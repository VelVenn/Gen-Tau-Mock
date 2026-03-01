const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');

class HTTPServer {
    constructor(mqttHandler, parser, httpPort = 2026, host = '127.0.0.1') {
        this.mqttHandler = mqttHandler;
        this.parser = parser;
        this.httpPort = httpPort;
        this.host = host;
        this.httpServer = null;
    }

    start() {
        this.httpServer = http.createServer((req, res) => {
            // 设置CORS与缓存控制
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            const url = new URL(req.url, `http://${req.headers.host}`);
            
            // API 路由
            if (url.pathname === '/api/messages') {
                this.handleGetMessages(res);
            } else if (url.pathname === '/api/uplink-history') {
                this.handleGetUplinkHistory(res);
            } else if (url.pathname === '/api/publish' && req.method === 'POST') {
                this.handlePublish(req, res);
            } else if (url.pathname === '/api/auto-publish' && req.method === 'POST') {
                this.handleAutoPublish(req, res);
            } else {
                // 静态文件路由
                this.serveStatic(url.pathname, res);
            }
        });

        this.httpServer.listen(this.httpPort, this.host, () => {
            console.log(`✅ Web 可视化界面已启动 - http://${this.host}:${this.httpPort}`);
            console.log(`🌐 请在浏览器中打开: http://${this.host}:${this.httpPort}`);
        });
    }

    serveStatic(pathname, res) {
        if (pathname === '/' || pathname === '/index.html') {
            pathname = '/index.html';
        }
        
        const filePath = path.join(__dirname, 'public', pathname);
        const extname = String(path.extname(filePath)).toLowerCase();
        
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.gif': 'image/gif',
        };
        
        const contentType = mimeTypes[extname] || 'application/octet-stream';
        
        fs.readFile(filePath, (error, content) => {
            if (error) {
                if (error.code == 'ENOENT') {
                    res.writeHead(404);
                    res.end('Not Found');
                } else {
                    res.writeHead(500);
                    res.end('Internal Server Error: ' + error.code);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    }

    handleGetMessages(res) {
        const response = {
            serverMessages: this.parser.serverMessageNames.map(name => ({
                name: name,
                metadata: this.parser.messageMetadata[name]
            })),
            clientMessages: this.parser.clientMessageNames.map(name => ({
                name: name,
                metadata: this.parser.messageMetadata[name]
            })),
            statusMappings: config.statusMappings,
            messageDefaultFrequencies: config.messageDefaultFrequencies,
            autoPublishers: Object.keys(this.mqttHandler.autoPublishers)
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    }

    handleGetUplinkHistory(res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.mqttHandler.receivedMessages));
    }

    handlePublish(req, res) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { messageType, data, topic } = JSON.parse(body);
                
                // 将数据key从驼峰等转为下划线兼容的实际proto field
                const convertedData = this.convertKeys(messageType, data);
                
                this.mqttHandler.publish(messageType, topic, convertedData, (err, size) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        console.log(`📤 手动发送下行消息 - 类型: ${messageType}, 大小: ${size} 字节`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: true, 
                            topic: topic || messageType,
                            size: size 
                        }));
                    }
                });
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }

    handleAutoPublish(req, res) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { messageType, enabled, intervalMs, topic, data } = JSON.parse(body);
                
                if (!messageType) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'messageType is required' }));
                    return;
                }
                
                const convertedData = data ? this.convertKeys(messageType, data) : null;
                
                if (enabled) {
                    this.mqttHandler.startAutoPublish(messageType, intervalMs, topic, convertedData);
                } else {
                    this.mqttHandler.stopAutoPublish(messageType);
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true,
                    messageType: messageType,
                    enabled: !!this.mqttHandler.autoPublishers[messageType],
                    intervalMs: this.mqttHandler.autoPublishers[messageType]?.intervalMs || 0
                }));
                
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }

    // 辅助：从驼峰或其它方式转回实际proto期望的驼峰属性名 (protobufjs expects camelCase by default unless keepCase is fully respected everywhere)
    convertKeys(messageType, data) {
        const metadata = this.parser.messageMetadata[messageType];
        if (!metadata || !data) return data;
        
        const converted = {};
        for (const [key, val] of Object.entries(data)) {
            let fieldMeta = metadata.fields[key];
            let actualKey = key;
            
            if (!fieldMeta) {
                const camelName = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                fieldMeta = metadata.fields[camelName];
                if (fieldMeta) actualKey = camelName;
            }
            if (!fieldMeta) {
                const snakeName = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
                fieldMeta = metadata.fields[snakeName];
                if (fieldMeta) actualKey = snakeName;
            }
            
            converted[actualKey] = val;
        }
        return converted;
    }

    stop() {
        if (this.httpServer) {
            this.httpServer.close(() => console.log('⏹️ Web 服务已停止'));
        }
    }
}

module.exports = HTTPServer;
