const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

// 设置 ffmpeg 路径
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

class UDPVideoStreamerFast {
    constructor(port = 3334, host = '127.0.0.1') {
        this.port = port;
        this.host = host;
        this.socket = dgram.createSocket('udp4');
        this.frameNumber = 0;
        this.isStreaming = false;
        this.maxPacketSize = 1400; // UDP 最大包大小（减去8字节头部后的有效载荷）
        
        // 视频列表和当前索引
        this.videoFiles = [];
        this.currentVideoIndex = 0;
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.socket.on('error', (err) => {
                console.error(`❌ UDP 发送套接字错误: ${err.message}`);
                reject(err);
            });

            console.log(`🚀 [全速模式] UDP 视频流服务就绪（发送目标: ${this.host}:${this.port}）`);
            this.isStreaming = true;
            
            this.initVideoFileList();
            this.streamVideo();
            resolve();
        });
    }

    initVideoFileList() {
        const videoDir = path.join(__dirname, '..', 'VideoSource');
        
        if (!fs.existsSync(videoDir)) {
            console.error('❌ VideoSource 文件夹不存在');
            this.videoFiles = [];
            return;
        }

        const allFiles = fs.readdirSync(videoDir);
        this.videoFiles = allFiles.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv'].includes(ext);
        }).map(file => path.join(videoDir, file));

        if (this.videoFiles.length === 0) {
            console.error('❌ VideoSource 中没有视频');
        } else {
            console.log(`📹 找到 ${this.videoFiles.length} 个视频文件`);
        }
    }

    async streamVideo() {
        if (this.videoFiles.length === 0) {
            setTimeout(() => {
                this.initVideoFileList();
                if (this.videoFiles.length > 0) this.streamVideo();
            }, 5000);
            return;
        }

        const videoFile = this.videoFiles[this.currentVideoIndex];
        const videoName = path.basename(videoFile);
        
        console.log(`\n📹 正在全速转码和发送视频 [${this.currentVideoIndex + 1}/${this.videoFiles.length}]: ${videoName}\n`);

        if (!fs.existsSync(videoFile)) {
            console.error(`❌ 文件不存在: ${videoFile}`);
            this.playNextVideo();
            return;
        }

        const command = ffmpeg(videoFile)
            // 移除了 .inputOptions(['-re']) 以解锁读取速度
            .videoCodec('libx265')
            .outputOptions([
                '-f hevc',           
                '-preset ultrafast', 
                '-tune zerolatency', 
                '-an'                
            ])
            .on('start', (cmd) => {
                console.log(`🎬 FFmpeg 开始全速转码 (HEVC)`);
            })
            .on('error', (err) => {
                console.error('❌ FFmpeg 错误:', err.message);
                setTimeout(() => this.playNextVideo(), 5000);
            })
            .on('end', () => {
                console.log(`✅ 视频本地转码完成: ${videoName}`);
                this.playNextVideo();
            });

        let stream = command.pipe();
        
        // 用于无缝拼接 FFmpeg 吐出的变长 chunk，攒够一定阈值当做一次"网络大帧"投递
        // 虽然 H265 的真实 Frame 边界（NALU）在流式传输中会被打散，但 C++ 端 TReassembly 只关心按大小收到的数据总块
        let pendingFrameBuf = Buffer.alloc(0);
        
        // 当积累的数据达到约 64KB (不超过客户端 reassembly 槽位大小) 时抛出，避免单帧无意义拆解成多包过度挤占 CPU
        const AGGREGATE_THRESHOLD = 65536; 

        stream.on('data', (chunk) => {
            if (!this.isStreaming) return;
            
            pendingFrameBuf = Buffer.concat([pendingFrameBuf, chunk]);
            
            if (pendingFrameBuf.length >= AGGREGATE_THRESHOLD) {
                this.sendFrame(pendingFrameBuf);
                pendingFrameBuf = Buffer.alloc(0);
            }
        });

        stream.on('end', () => {
            if (pendingFrameBuf.length > 0) {
                this.sendFrame(pendingFrameBuf);
                pendingFrameBuf = Buffer.alloc(0);
            }
        });
    }

    playNextVideo() {
        this.currentVideoIndex++;
        if (this.currentVideoIndex >= this.videoFiles.length) {
            this.currentVideoIndex = 0;
            console.log('\n🔄 循环播放...');
        }
        this.frameNumber = 0;
        
        setTimeout(() => {
            if (this.isStreaming) this.streamVideo();
        }, 1000);
    }

    sendFrame(frameData) {
        if (!this.isStreaming) return;

        this.frameNumber++;
        // C++ 端 TReassembly header->frameIdx 是 u16 类型，如果溢出直接截断，因此这里我们做 & 0xFFFF 保护防止超限
        const currentFrameIdx = this.frameNumber & 0xFFFF;
        
        const totalBytes = frameData.length;
        const payloadSize = this.maxPacketSize - 8; 
        const totalPackets = Math.ceil(totalBytes / payloadSize);

        for (let packetIndex = 0; packetIndex < totalPackets; packetIndex++) {
            const start = packetIndex * payloadSize;
            const end = Math.min(start + payloadSize, totalBytes);
            const payload = frameData.slice(start, end);

            // 构造 8 字节头部 (与 C++ 端的 Header packed struct 紧密对应)
            // u16 frameIdx; u16 secIdx; u32 frameLen; (Little Endian)
            const header = Buffer.alloc(8);
            header.writeUInt16LE(currentFrameIdx, 0);                 // 帧编号 (2 bytes)
            header.writeUInt16LE(packetIndex & 0xFFFF, 2);            // 分片序号 (2 bytes)
            header.writeUInt32LE(totalBytes >>> 0, 4);                // 总字节数 (4 bytes)

            const packet = Buffer.concat([header, payload]);

            this.socket.send(packet, this.port, this.host, (err) => {
                if (err) {
                    console.error(`❌ UDP 发送错误: ${err.message}`);
                }
            });
        }
    }

    stop() {
        this.isStreaming = false;
        if (this.socket) {
            this.socket.close();
            console.log('⏹️  UDP 视频流服务已停止');
        }
    }
}

module.exports = UDPVideoStreamerFast;
