const dgram = require("dgram");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

// 确保使用项目自带的 FFmpeg 二进制，或者如遇兼容问题可以使用系统 `ffmpeg` 路径
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

class UDPCameraStreamer {
  constructor(port = 3334, host = "127.0.0.1", device = "/dev/video0") {
    this.port = port;
    this.host = host;
    this.device = device;
    this.socket = dgram.createSocket("udp4");
    this.frameNumber = 0;
    this.isStreaming = false;
    this.maxPacketSize = 1400; // UDP 最大载荷
    this.currentFrameTimer = null;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.socket.on("error", (err) => {
        console.error(`❌ UDP 错误: ${err.message}`);
        reject(err);
      });

      console.log(`🚀 开始从摄像头 (${this.device}) 发送 HEVC 流至 ${this.host}:${this.port}`);
      this.isStreaming = true;
      this.streamCamera();
      resolve();
    });
  }

  streamCamera() {
    const command = ffmpeg(this.device)
      .inputFormat("video4linux2") // Linux 摄像头接口 
      // 可选：指定摄像头采集的帧率和分辨率
      // .inputOptions([
      //   "-framerate 30",       // 强制 30fps
      //   "-video_size 1280x720" // 强制分辨率，如果摄像头支持的话
      // ])
      .videoCodec("libx265")
      .outputOptions([
        "-f hevc",                           // 输出 HEVC 裸流格式
        "-preset ultrafast",                 // 最低的 CPU 占用和最低延迟处理
        "-tune zerolatency",                 // 零延迟模式，不缓冲 B 帧
        "-g 30",                             // GOP 大小
        "-keyint_min 30",
        "-b:v 2000k",
        "-maxrate 2500k",
        "-bufsize 1200k",
        "-x265-params",
        "repeat-headers=1:intra-refresh=1:bframes=0:force-flush=1",  // 防止 UDP 丢包导致长时间无法恢复
        "-an",                               // 关闭音频轨道
        "-pix_fmt yuv420p"                   // 指定像素格式
      ])
      .on("start", (cmd) => {
        console.log(`🎬 FFmpeg 开始捕获摄像头: ${cmd}`);
      })
      .on("error", (err) => {
        console.error("❌ FFmpeg 摄像头捕获错误:", err.message);
        // 如果断开，尝试 5 秒后重连
        setTimeout(() => { if (this.isStreaming) this.streamCamera() }, 5000);
      })
      .on("end", () => {
        console.log(`✅ 摄像头流输出结束`);
        setTimeout(() => { if (this.isStreaming) this.streamCamera() }, 1000);
      });

    let stream = command.pipe();

    let pendingFrameBuf = Buffer.alloc(0);
    const frameIntervalMs = 33; // 约 30fps
    let lastFlushAt = Date.now();
    const maxBufferedBytes = this.maxPacketSize * 500; // 约 700kB
    const maxBufferedMs = frameIntervalMs * 4;

    this.currentFrameTimer = setInterval(() => {
      if (!this.isStreaming) return;
      const now = Date.now();
      if (pendingFrameBuf.length === 0) {
        lastFlushAt = now;
        return;
      }

      if (pendingFrameBuf.length > maxBufferedBytes || now - lastFlushAt > maxBufferedMs) {
        console.warn("⚠️ pendingFrameBuf 积压过大，执行丢弃并重置");
        pendingFrameBuf = Buffer.alloc(0);
        lastFlushAt = now;
        return;
      }

      this.sendFrame(pendingFrameBuf);
      pendingFrameBuf = Buffer.alloc(0);
      lastFlushAt = now;
    }, frameIntervalMs);

    stream.on("data", (chunk) => {
        if (!this.isStreaming) return;
        pendingFrameBuf = Buffer.concat([pendingFrameBuf, chunk]);
    });

    stream.on("end", () => {
      if (pendingFrameBuf.length > 0) {
        this.sendFrame(pendingFrameBuf);
        pendingFrameBuf = Buffer.alloc(0);
      }
      if (this.currentFrameTimer) {
        clearInterval(this.currentFrameTimer);
        this.currentFrameTimer = null;
      }
    });

    stream.on("error", () => {
      if (this.currentFrameTimer) {
        clearInterval(this.currentFrameTimer);
        this.currentFrameTimer = null;
      }
    });
  }

  sendFrame(frameData) {
    if (!this.isStreaming) return;

    this.frameNumber++;
    // 与 C++ 中的 Header packed struct 紧密对应
    const currentFrameIdx = this.frameNumber & 0xffff;
    const totalBytes = frameData.length;
    const payloadSize = this.maxPacketSize - 8;
    const totalPackets = Math.ceil(totalBytes / payloadSize);

    for (let packetIndex = 0; packetIndex < totalPackets; packetIndex++) {
      const start = packetIndex * payloadSize;
      const end = Math.min(start + payloadSize, totalBytes);
      const payload = frameData.slice(start, end);

      // u16 frameIdx; u16 secIdx; u32 frameLen; (Big Endian)
      const header = Buffer.alloc(8);
      header.writeUInt16BE(currentFrameIdx, 0);       // 帧编号
      header.writeUInt16BE(packetIndex & 0xffff, 2);  // 分片序号
      header.writeUInt32BE(totalBytes >>> 0, 4);      // 总字节数

      const packet = Buffer.concat([header, payload]);

      this.socket.send(packet, this.port, this.host, (err) => {
        if (err) console.error(`❌ UDP 帧发送异常: ${err.message}`);
      });
    }
  }

  stop() {
    this.isStreaming = false;
    if (this.currentFrameTimer) {
      clearInterval(this.currentFrameTimer);
      this.currentFrameTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      console.log("⏹️  摄像头 UDP 视频流已停止");
    }
  }
}

module.exports = UDPCameraStreamer;