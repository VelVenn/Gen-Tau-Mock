const UDPVideoStreamer = require('./udp-video-streamer');
const UDPVideoStreamerFast = require('./udp-video-streamer-fast');
const UDPCameraStreamer = require('./udp-camera-streamer');

// 配置信息
const CONFIG = {
    udp: {
        port: 3334,
        host: '127.0.0.1'
    }
};

// 服务实例
let udpStreamer = null;
let mqttServer = null;

// 启动函数
async function startServer() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('          UDPServer - UDP视频流模拟服务器');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    try {
        // 解析命令行参数以选择服务模式
        const args = process.argv.slice(2);
        let serviceType = 'default';
        if (args.includes('fast') || args.includes('--fast')) serviceType = 'fast';
        if (args.includes('camera') || args.includes('--camera')) serviceType = 'camera';

        // 启动 UDP 服务
        console.log(`📹 正在启动 UDP 视频流服务 (模式: ${serviceType})...`);
        switch (serviceType) {
            case 'fast':
                udpStreamer = new UDPVideoStreamerFast(CONFIG.udp.port, CONFIG.udp.host);
                break;
            case 'camera':
                udpStreamer = new UDPCameraStreamer(CONFIG.udp.port, CONFIG.udp.host);
                break;
            case 'default':
            default:
                udpStreamer = new UDPVideoStreamer(CONFIG.udp.port, CONFIG.udp.host);
                break;
        }

        await udpStreamer.start();
        console.log('');

        console.log('═══════════════════════════════════════════════════════');
        console.log('✨ 所有服务已成功启动！');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('📊 服务状态:');
        console.log(`   ✅ UDP 视频流: ${CONFIG.udp.host}:${CONFIG.udp.port}`);
        console.log('');
        console.log('💡 提示:');
        console.log('   - 启动不同模式: node UDPserver.js [fast | camera | default]');
        console.log('   - UDP 客户端会持续接收 HEVC 格式的视频流数据');
        console.log('   - 每个 UDP 包前8字节包含: 帧编号(2) + 分片序号(2) + 总字节数(4)');
        console.log('   - 按 Ctrl+C 停止服务器');
        console.log('');

    } catch (error) {
        console.error('');
        console.error('❌ 服务启动失败:', error.message);
        console.error('');
        process.exit(1);
    }
}

// 优雅关闭
function gracefulShutdown() {
    console.log('');
    console.log('⏹️  正在关闭服务...');
    if (udpStreamer) {
        udpStreamer.stop();
    }
    setTimeout(() => {
        console.log('👋 服务已完全关闭');
        process.exit(0);
    }, 1000);
}

// 错误处理
process.on('uncaughtException', (error) => {
    console.error('');
    console.error('💥 未捕获的异常:', error.message);
    console.error(error.stack);
    gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('');
    console.error('💥 未处理的 Promise 拒绝:', reason);
    gracefulShutdown();
});

// 监听退出信号
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// 启动服务器
startServer();
