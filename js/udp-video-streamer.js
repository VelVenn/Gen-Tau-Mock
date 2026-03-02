const dgram = require("dgram");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");

// 设置 ffmpeg 路径
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
// 设置 ffprobe 路径（用于获取帧率）
try {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
} catch (e) {
  console.warn("⚠️ 无法设置 ffprobe 路径:", e.message);
}

class UDPVideoStreamer {
  constructor(port = 3334, host = "127.0.0.1") {
    this.port = port;
    this.host = host;
    this.socket = dgram.createSocket("udp4");
    this.frameNumber = 0;
    this.isStreaming = false;
    this.maxPacketSize = 1400; // UDP 最大包大小（减去8字节头部后的有效载荷）
    this.lastSendAt = 0;

    // 视频列表和当前索引
    this.videoFiles = [];
    this.currentVideoIndex = 0;
    this.currentFrameTimer = null;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.socket.on("error", (err) => {
        console.error(`❌ UDP 发送套接字错误: ${err.message}`);
        reject(err);
      });

      // 不绑定目标端口(3334)，以免占用客户端监听端口。
      // 发送端只需向目标地址发送数据即可，操作系统会分配临时源端口。
      console.log(
        `✅ UDP 视频流服务就绪（发送目标: ${this.host}:${this.port}）`,
      );
      this.isStreaming = true;

      // 初始化视频文件列表
      this.initVideoFileList();

      // 开始播放第一个视频
      this.streamVideo();
      resolve();
    });
  }

  // 初始化视频文件列表
  initVideoFileList() {
    const videoDir = path.join(__dirname, "..", "VideoSource");

    // 检查文件夹是否存在
    if (!fs.existsSync(videoDir)) {
      console.error("❌ VideoSource 文件夹不存在");
      this.videoFiles = [];
      return;
    }

    // 扫描所有支持的视频文件
    const allFiles = fs.readdirSync(videoDir);
    this.videoFiles = allFiles
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return [".mp4", ".avi", ".mov", ".mkv", ".flv", ".wmv"].includes(ext);
      })
      .map((file) => path.join(videoDir, file));

    if (this.videoFiles.length === 0) {
      console.error("❌ VideoSource 文件夹中没有找到视频文件");
      console.warn("⚠️  支持的视频格式: .mp4, .avi, .mov, .mkv, .flv, .wmv");
    } else {
      console.log(`📹 找到 ${this.videoFiles.length} 个视频文件:`);
      this.videoFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${path.basename(file)}`);
      });
    }
  }

  async streamVideo() {
    // 检查视频文件列表
    if (this.videoFiles.length === 0) {
      console.error("❌ 没有可播放的视频文件");
      // 5秒后重新扫描
      setTimeout(() => {
        this.initVideoFileList();
        if (this.videoFiles.length > 0) {
          this.streamVideo();
        }
      }, 5000);
      return;
    }

    // 获取当前要播放的视频
    const videoFile = this.videoFiles[this.currentVideoIndex];
    const videoName = path.basename(videoFile);

    console.log("");
    console.log("═".repeat(60));
    console.log(
      `📹 正在播放视频 [${this.currentVideoIndex + 1}/${this.videoFiles.length}]: ${videoName}`,
    );
    console.log("═".repeat(60));

    // 检查文件是否存在
    if (!fs.existsSync(videoFile)) {
      console.error(`❌ 视频文件不存在: ${videoFile}`);
      this.playNextVideo();
      return;
    }

    // 获取视频帧率 (FPS)，用于按帧发送
    let fps = 25; // 默认值
    try {
      const probe = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoFile, (err, metadata) => {
          if (err) return reject(err);
          resolve(metadata);
        });
      });
      const vstream = (probe.streams || []).find(
        (s) => s.codec_type === "video",
      );
      if (vstream) {
        const r =
          vstream.r_frame_rate || vstream.avg_frame_rate || vstream.frame_rate;
        if (r && typeof r === "string") {
          const parts = r.split("/").map(Number);
          if (parts.length === 2 && parts[1] !== 0) {
            fps = parts[0] / parts[1];
          } else if (!isNaN(Number(r))) {
            fps = Number(r);
          }
        }
      }
    } catch (e) {
      console.warn("⚠️ 无法获取视频帧率，使用默认 25 fps:", e.message);
    }

    const frameIntervalMs = Math.max(10, Math.round(1000 / fps));
    // 保存到实例便于 sendFrame 日志打印与检测
    this.frameIntervalMs = frameIntervalMs;

    // 使用 libx265 (HEVC) 编码并以原始流输出；如果运行时缺少编码器会抛出错误并在5秒后重试
    const command = ffmpeg(videoFile)
      .inputOptions(["-re"]) // 以实际帧率读取输入
      .videoCodec("libx265")
      .outputOptions([
        "-f hevc", // 输出格式为 HEVC 原始流
        "-preset ultrafast", // 快速编码
        "-tune zerolatency", // 低延迟（禁用B帧）
        "-g 30", // GOP 长度
        "-b:v 2000k",
        "-maxrate 2500k",
        "-bufsize 1200k",
        "-x265-params",
        "repeat-headers=1:intra-refresh=1", // 在所有IDR前插入SPS/PPS/VPS, 开启周期性刷新 (这个设置有助于丢包恢复)
        "-an", // 不处理音频
      ])
      .on("start", (cmd) => {
        console.log(`🎬 FFmpeg 开始转码 (HEVC)`);
        console.log(
          `   帧率: ${fps.toFixed(2)} fps, 间隔: ${frameIntervalMs} ms`,
        );
      })
      .on("error", (err) => {
        console.error("❌ FFmpeg 错误:", err.message);
        // 清理定时器
        if (this.currentFrameTimer) {
          clearInterval(this.currentFrameTimer);
          this.currentFrameTimer = null;
        }
        // 5秒后播放下一个视频
        console.log("⏭️  5秒后播放下一个视频...");
        setTimeout(() => this.playNextVideo(), 5000);
      })
      .on("end", () => {
        console.log(`✅ 视频播放完成: ${videoName}`);
        // 播放下一个视频
        this.playNextVideo();
      });

    // 使用流式处理
    let stream = command.pipe();
    // 将收到的数据缓冲并按帧率定时 flush（发送）
    let pendingFrameBuf = Buffer.alloc(0);
    let lastFlushAt = Date.now();
    const maxBufferedBytes = this.maxPacketSize * 500; // 约 700kB
    const maxBufferedMs = frameIntervalMs * 4; // 超过此时间窗口则丢弃并重置

    this.currentFrameTimer = setInterval(() => {
      if (!this.isStreaming) return;
      const now = Date.now();
      // 如果没有数据，则跳过
      if (pendingFrameBuf.length === 0) {
        lastFlushAt = now;
        return;
      }

      // 如果缓冲区过大或积压超过多帧，丢掉以前的内容，保留近期数据
      if (
        pendingFrameBuf.length > maxBufferedBytes ||
        now - lastFlushAt > maxBufferedMs
      ) {
        console.warn("⚠️ pendingFrameBuf 积压过大，执行丢弃并重置");
        pendingFrameBuf = Buffer.alloc(0);
        lastFlushAt = now;
        return;
      }

      // 发送一帧（当前缓冲）
      this.sendFrame(pendingFrameBuf);
      pendingFrameBuf = Buffer.alloc(0);
      lastFlushAt = now;
    }, frameIntervalMs);

    // 只追加到 pendingFrameBuf，实际发送由 frameTimer 控制，避免重复发送
    stream.on("data", (chunk) => {
      pendingFrameBuf = Buffer.concat([pendingFrameBuf, chunk]);
    });

    stream.on("end", () => {
      if (pendingFrameBuf.length > 0) {
        this.sendFrame(pendingFrameBuf);
        pendingFrameBuf = Buffer.alloc(0);
      }
      // 清理定时器
      if (this.currentFrameTimer) {
        clearInterval(this.currentFrameTimer);
        this.currentFrameTimer = null;
      }
    });
  }

  // 播放下一个视频
  playNextVideo() {
    // 清理当前定时器
    if (this.currentFrameTimer) {
      clearInterval(this.currentFrameTimer);
      this.currentFrameTimer = null;
    }

    // 切换到下一个视频
    this.currentVideoIndex++;

    // 如果播放完所有视频，从头开始
    if (this.currentVideoIndex >= this.videoFiles.length) {
      this.currentVideoIndex = 0;
      console.log("");
      console.log("🔄 所有视频播放完成，重新开始循环播放...");
      console.log("");
    }

    // 重置帧计数器
    this.frameNumber = 0;

    // 延迟1秒后播放下一个视频
    setTimeout(() => {
      if (this.isStreaming) {
        this.streamVideo();
      }
    }, 1000);
  }

  sendFrame(frameData) {
    if (!this.isStreaming) return;

    this.frameNumber++;
    const totalBytes = frameData.length;
    const payloadSize = this.maxPacketSize - 8; // 减去8字节头部
    const totalPackets = Math.ceil(totalBytes / payloadSize);

    const now = Date.now();
    const delta = this.lastSendAt ? now - this.lastSendAt : 0;
    this.lastSendAt = now;
    console.log(
      `📤 发送帧 #${this.frameNumber}, 大小: ${totalBytes} 字节, 分 ${totalPackets} 个包, 间隔: ${delta} ms (目标: ${this.frameIntervalMs} ms)`,
    );

    for (let packetIndex = 0; packetIndex < totalPackets; packetIndex++) {
      const start = packetIndex * payloadSize;
      const end = Math.min(start + payloadSize, totalBytes);
      const payload = frameData.slice(start, end);

      // 构造 8 字节头部
      const header = Buffer.alloc(8);
      header.writeUInt16LE(this.frameNumber & 0xffff, 0); // 帧编号 (2 bytes)
      header.writeUInt16LE(packetIndex, 2); // 分片序号 (2 bytes)
      header.writeUInt32LE(totalBytes, 4); // 总字节数 (4 bytes)

      // 合并头部和载荷
      const packet = Buffer.concat([header, payload]);

      // 发送 UDP 包
      this.socket.send(packet, this.port, this.host, (err) => {
        if (err) {
          console.error(`❌ UDP 发送错误: ${err.message}`);
        }
      });
    }
  }

  stop() {
    this.isStreaming = false;

    // 清理定时器
    if (this.currentFrameTimer) {
      clearInterval(this.currentFrameTimer);
      this.currentFrameTimer = null;
    }

    // 关闭socket
    if (this.socket) {
      this.socket.close();
      console.log("⏹️  UDP 视频流服务已停止");
    }
  }
}

module.exports = UDPVideoStreamer;
