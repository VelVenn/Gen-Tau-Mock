const path = require("path");
const ProtoParser = require("./proto-parser");
const MQTTHandler = require("./mqtt-handler");
const HTTPServer = require("./http-server");

// 配置
const PROTO_PATH = path.join(__dirname, "..", "..", "proto", "messages.proto");
const HTTP_PORT = 8888;
const MQTT_PORT = 3333;
const HOST = "127.0.0.1";

async function main() {
  console.log("🚀 正在初始化 MQTT Server Visual (Next-Gen Modular)");

  // 1. 初始化解析器
  const parser = new ProtoParser();
  const success = await parser.loadProto(PROTO_PATH);
  if (!success) {
    process.exit(1);
  }

  // 2. 初始化MQTT处理
  const mqttHandler = new MQTTHandler(parser, MQTT_PORT, HOST);
  try {
    await mqttHandler.start();
  } catch (error) {
    console.error("MQTT 服务启动失败，退出...", error);
    process.exit(1);
  }

  // 3. 初始化HTTP服务 (提供 API 和 静态页面)
  const httpServer = new HTTPServer(mqttHandler, parser, HTTP_PORT, HOST);
  httpServer.start();

  // 优雅退出处理
  process.on("SIGINT", () => {
    console.log("\n🛑 正在关闭服务...");
    httpServer.stop();
    mqttHandler.stopAll();
    setTimeout(() => process.exit(0), 500);
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 正在关闭服务...");
    httpServer.stop();
    mqttHandler.stopAll();
    setTimeout(() => process.exit(0), 500);
  });
}

main().catch(console.error);
