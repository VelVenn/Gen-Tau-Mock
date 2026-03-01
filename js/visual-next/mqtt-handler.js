const net = require('net');
const aedes = require('aedes')();
const config = require('./config');

class MQTTHandler {
    constructor(parser, mqttPort = 3333, host = '127.0.0.1') {
        this.parser = parser;
        this.mqttPort = mqttPort;
        this.host = host;
        this.mqttServer = null;
        
        // 接收到的上行消息历史
        this.receivedMessages = [];
        this.maxHistorySize = 100;
        
        // 下行消息配置自动发送
        this.downlinkConfigs = {};
        this.autoPublishers = {};
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.mqttServer = net.createServer(aedes.handle);

            this.mqttServer.on('error', (err) => {
                console.error(`❌ MQTT 服务器错误: ${err.message}`);
                reject(err);
            });

            // 监听客户端连接
            aedes.on('client', (client) => {
                console.log(`📱 MQTT 客户端已连接: ${client.id}`);
            });

            // 监听客户端断开
            aedes.on('clientDisconnect', (client) => {
                console.log(`📴 MQTT 客户端已断开: ${client.id}`);
            });

            // 监听订阅
            aedes.on('subscribe', (subscriptions, client) => {
                console.log(`📌 客户端 ${client.id} 订阅:`, subscriptions.map(s => s.topic).join(', '));
            });

            // 监听客户端发布的消息
            aedes.on('publish', async (packet, client) => {
                if (!client) return;
                
                const topic = packet.topic;
                
                for (const msgName of this.parser.clientMessageNames) {
                    if (topic.includes(msgName) || topic === msgName) {
                        try {
                            const MessageType = this.parser.protoRoot.lookupType(msgName);
                            const decoded = MessageType.decode(packet.payload);
                            const obj = MessageType.toObject(decoded, { 
                                longs: String, 
                                enums: String, 
                                bytes: String,
                                defaults: true,
                                keepCase: true
                            });
                            
                            const parsedData = this.parser.parseFieldValues(msgName, obj);
                            
                            this.receivedMessages.unshift({
                                timestamp: new Date().toISOString(),
                                clientId: client.id,
                                topic: topic,
                                messageType: msgName,
                                data: obj,
                                parsedData: parsedData
                            });
                            
                            if (this.receivedMessages.length > this.maxHistorySize) {
                                this.receivedMessages = this.receivedMessages.slice(0, this.maxHistorySize);
                            }
                            
                            console.log(`📥 收到上行消息 - 客户端: ${client.id}, 类型: ${msgName}`);
                            
                        } catch (err) {
                            console.error(`❌ 解析消息失败 (${msgName}):`, err.message);
                        }
                        break;
                    }
                }
            });

            this.mqttServer.listen(this.mqttPort, this.host, () => {
                console.log(`✅ MQTT 服务已启动 - mqtt://${this.host}:${this.mqttPort}`);
                resolve();
            });
        });
    }

    publish(messageType, topic, data, callback) {
        try {
            const MessageType = this.parser.protoRoot.lookupType(messageType);
            const errMsg = MessageType.verify(data);
            if (errMsg) {
                return callback(new Error(`数据验证失败: ${errMsg}`));
            }
            const message = MessageType.create(data);
            const buffer = MessageType.encode(message).finish();
            
            aedes.publish({
                topic: topic || messageType,
                payload: buffer,
                qos: 0,
                retain: false
            }, (err) => {
                if (!err) {
                    this.downlinkConfigs[messageType] = data;
                }
                callback(err, buffer.length);
            });
        } catch (error) {
            callback(error);
        }
    }

    startAutoPublish(messageType, intervalMs, topic, dataTemplate) {
        if (this.autoPublishers[messageType]) {
            clearInterval(this.autoPublishers[messageType].timer);
            this.autoPublishers[messageType] = null;
        }

        const hz = config.messageDefaultFrequencies[messageType];
        const defaultMs = hz ? 1000 / hz : 1000; 
        const ms = intervalMs || defaultMs;

        const publishTopic = topic || messageType;
        const template = dataTemplate || this.downlinkConfigs[messageType] || {};

        const timer = setInterval(() => {
            this.publish(messageType, publishTopic, template, (err, size) => {
                if (err) {
                    console.error(`❌ 自动发送失败 (${messageType}):`, err.message);
                } else {
                    console.log(`📤 自动发送下行消息 - 类型: ${messageType}, 大小: ${size} 字节`);
                }
            });
        }, ms);

        this.autoPublishers[messageType] = { timer, intervalMs: ms, topic: publishTopic };
        console.log(`🚀 开始自动发送下行消息(${messageType})，间隔: ${ms}ms`);
    }

    stopAutoPublish(messageType) {
        const p = this.autoPublishers[messageType];
        if (p && p.timer) {
            clearInterval(p.timer);
            delete this.autoPublishers[messageType];
            console.log(`⏹️ 停止自动发送下行消息(${messageType})`);
        }
    }

    stopAll() {
        for (const msgType of Object.keys(this.autoPublishers)) {
            this.stopAutoPublish(msgType);
        }
        if (this.mqttServer) {
            this.mqttServer.close();
        }
        if (aedes) {
            aedes.close();
        }
    }
}

module.exports = MQTTHandler;
