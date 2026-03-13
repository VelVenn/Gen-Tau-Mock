const protobuf = require("protobufjs");
const fs = require("fs");
const path = require("path");
const config = require("./config");

class ProtoParser {
  constructor() {
    this.protoRoot = null;
    this.serverMessageNames = [];
    this.clientMessageNames = [];
    this.messageMetadata = {};
  }

  async loadProto(protoPath) {
    try {
      const protoText = fs.readFileSync(protoPath, "utf8");

      // 清理并解析proto
      const protoTextSanitized = protoText.replace(
        /^\s*package\s+\S+;\s*$/gm,
        "",
      );
      const parsed = protobuf.parse(protoTextSanitized, { keepCase: true });
      this.protoRoot = parsed.root;

      // 解析消息和注释
      this.parseProtoMessages(protoText);

      console.log("✅ Protobuf 定义加载成功");
      console.log(
        `📤 下行消息 (服务器->客户端): ${this.serverMessageNames.length} 个`,
      );
      console.log(
        `📥 上行消息 (客户端->服务器): ${this.clientMessageNames.length} 个`,
      );

      return true;
    } catch (error) {
      console.error("❌ Protobuf 加载失败:", error.message);
      return false;
    }
  }

  parseProtoMessages(protoText) {
    const lines = protoText.split(/\r?\n/);

    // 找到两个package的位置
    const upIndex = lines.findIndex((l) =>
      /^\s*package\s+rm_client_up\s*;/.test(l),
    );
    const downIndex = lines.findIndex((l) =>
      /^\s*package\s+rm_client_down\s*;/.test(l),
    );

    // 解析上行消息（客户端->服务器）
    if (upIndex !== -1) {
      const endIdx = downIndex !== -1 ? downIndex : lines.length;
      this.parseMessageBlock(lines, upIndex + 1, endIdx, "client");
    }

    // 解析下行消息（服务器->客户端）
    if (downIndex !== -1) {
      this.parseMessageBlock(lines, downIndex + 1, lines.length, "server");
    }
  }

  parseMessageBlock(lines, startIdx, endIdx, type) {
    let currentMessage = null;
    let messageComments = [];
    let fieldComments = [];

    for (let i = startIdx; i < endIdx; i++) {
      const line = lines[i].trim();

      // 收集注释（区分消息注释和字段注释）
      if (line.startsWith("//")) {
        const comment = line.replace(/^\/\/\s*/, "");
        if (!currentMessage) {
          messageComments.push(comment);
        } else {
          fieldComments.push(comment);
        }
        continue;
      }

      // 解析消息定义
      const msgMatch = line.match(/^\s*message\s+([A-Za-z0-9_]+)\s*\{/);
      if (msgMatch) {
        currentMessage = msgMatch[1];

        if (type === "server") {
          this.serverMessageNames.push(currentMessage);
        } else {
          this.clientMessageNames.push(currentMessage);
        }

        let cleanedDescription = messageComments.join(" ");

        // 提取频率配置 (如果 config 里没有记录，在这里动态补充)
        const freqMatch = cleanedDescription.match(
          /频率\s*[:：]?\s*(\d+(?:\.\d+)?)Hz/i,
        );
        if (freqMatch && !config.messageDefaultFrequencies[currentMessage]) {
          config.messageDefaultFrequencies[currentMessage] = parseFloat(
            freqMatch[1],
          );
        } else if (
          cleanedDescription.includes("触发") &&
          typeof config.messageDefaultFrequencies[currentMessage] ===
            "undefined"
        ) {
          config.messageDefaultFrequencies[currentMessage] = 0;
        }

        cleanedDescription = cleanedDescription.replace(
          /^\d+\.\d+\.\d+\s+\w+\s*/,
          "",
        );
        cleanedDescription = cleanedDescription.replace(/^用途:\s*/, "");

        const displayName =
          config.messageDisplayNames[currentMessage] ||
          config.messageDisplayNames[cleanedDescription] ||
          cleanedDescription ||
          currentMessage;

        this.messageMetadata[currentMessage] = {
          type: type,
          description: cleanedDescription,
          displayName: displayName,
          fields: {},
          comments: [...messageComments],
          enumComments: {},
        };

        messageComments = [];
        fieldComments = [];
        continue;
      }

      // 解析字段
      if (currentMessage) {
        const fieldMatch = line.match(
          /^\s*(repeated\s+)?(\w+)\s+(\w+)\s*=\s*(\d+)(?:\s*\[([^\]]+)\])?;(?:\s*\/\/\s*(.*))?/,
        );
        if (fieldMatch) {
          const [
            ,
            repeated,
            fieldType,
            fieldName,
            fieldNumber,
            options,
            comment,
          ] = fieldMatch;

          let enumComment = null;
          let parsedEnum = null;

          if (comment && comment.includes("枚举")) {
            enumComment = comment;
          }
          if (!enumComment) {
            for (const fc of fieldComments) {
              if (fc.includes(fieldName) && fc.includes("枚举")) {
                enumComment = fc;
                break;
              }
            }
            if (!enumComment) {
              const fallbackEnum = fieldComments.find(
                (fc) => fc.includes("枚举") && !fc.match(/[a-zA-Z_]+\s*枚举/),
              );
              if (fallbackEnum) enumComment = fallbackEnum;
            }
          }

          if (enumComment) {
            // 改为仅匹配英文逗号，并支持 \, 转义。匹配：数字、冒号/等号、(转义的逗号|非逗号的任意字符)+
            const enumKvMatch = enumComment.match(
              /(\d+)\s*[:=：]\s*(?:\\,|[^,])+/g,
            );
            if (enumKvMatch) {
              parsedEnum = enumKvMatch.map((kv) => {
                // 为了防止 label 内部也有冒号被误切，只按第一个匹配的冒号/等号分割
                const splitIndex = kv.search(/[:=：]/);
                const valStr = kv.substring(0, splitIndex).trim();
                const labelStr = kv.substring(splitIndex + 1).trim();
                return {
                  value: parseInt(valStr),
                  label: labelStr.replace(/\\,/g, ','),
                };
              });
            }
            fieldComments = fieldComments.filter((fc) => fc !== enumComment);
          }

          const fieldDesc =
            fieldComments.filter((fc) => !fc.includes("枚举")).join(" ") ||
            comment ||
            "";

          this.messageMetadata[currentMessage].fields[fieldName] = {
            type: fieldType,
            repeated: !!repeated,
            number: parseInt(fieldNumber),
            options: options || "",
            comment: comment || "",
            description: fieldDesc,
            enumComment: enumComment,
            parsedEnum: parsedEnum,
          };

          if (enumComment) {
            this.messageMetadata[currentMessage].enumComments[fieldName] =
              enumComment;
          }

          fieldComments = fieldComments.filter((fc) => fc.includes("枚举"));
        }

        if (line === "}") {
          currentMessage = null;
          fieldComments = [];
        }
      }
    }
  }

  parseFieldValues(messageType, data) {
    const metadata = this.messageMetadata[messageType];
    if (!metadata || !metadata.fields) return {};

    const parsed = {};
    const normalizedData = { ...data };

    // Handle omit default values from Proto3
    for (const fieldName of Object.keys(metadata.fields)) {
      const camelName = fieldName.replace(/_([a-z])/g, (_, c) =>
        c.toUpperCase(),
      );
      if (
        normalizedData[fieldName] === undefined &&
        normalizedData[camelName] === undefined
      ) {
        const type = metadata.fields[fieldName].type;
        if (metadata.fields[fieldName].repeated) {
          normalizedData[fieldName] = [];
        } else if (type === "bool") {
          normalizedData[fieldName] = false;
        } else if (type === "string" || type === "bytes") {
          normalizedData[fieldName] = "";
        } else {
          normalizedData[fieldName] = 0;
        }
      }
    }

    for (const [fieldName, value] of Object.entries(normalizedData)) {
      let fieldMeta = metadata.fields[fieldName];
      let realFieldName = fieldName;

      if (!fieldMeta) {
        const snakeName = fieldName
          .replace(/([A-Z])/g, "_$1")
          .toLowerCase()
          .replace(/^_/, "");
        fieldMeta = metadata.fields[snakeName];
        if (fieldMeta) realFieldName = snakeName;
      }
      if (!fieldMeta) {
        const camelName = fieldName.replace(/_([a-z])/g, (_, c) =>
          c.toUpperCase(),
        );
        fieldMeta = metadata.fields[camelName];
        if (fieldMeta) realFieldName = camelName;
      }

      if (!fieldMeta) {
        parsed[realFieldName] = { value, display: String(value) };
        continue;
      }

      let display = String(value);
      let description = fieldMeta.description || fieldMeta.comment || "";

      let mappingKey = realFieldName;
      if (
        messageType === "DeployModeStatusSync" &&
        realFieldName === "status"
      ) {
        mappingKey = "deploy_mode_status";
      } else if (
        messageType === "TechCoreMotionStateSync" &&
        realFieldName === "status"
      ) {
        mappingKey = "core_status";
      }

      const statusMapping =
        config.statusMappings[mappingKey] || config.statusMappings[fieldName];
      if (statusMapping && Array.isArray(statusMapping)) {
        const mapping = statusMapping.find((m) => m.value === value);
        if (mapping) {
          display = `${value} (${mapping.label})`;
        }
      } else if (fieldMeta.type === "bool") {
        if (fieldName.includes("button") || fieldName.includes("down")) {
          display = value ? "按下" : "抬起";
        } else if (fieldName.includes("is_") || fieldName.includes("can_")) {
          display = value ? "是" : "否";
        } else if (fieldName.includes("open")) {
          display = value ? "开启" : "关闭";
        } else if (
          description.includes("false") ||
          description.includes("true")
        ) {
          const match = description.match(
            /(false|抬起|否)[^a-zA-Z]*[:：=]?([^,，)]+).*?(true|按下|是)[^a-zA-Z]*[:：=]?([^,，)]+)/i,
          );
          if (match) {
            display = value
              ? match[4]?.trim() || "是"
              : match[2]?.trim() || "否";
          } else {
            display = value ? "是" : "否";
          }
        } else {
          display = value ? "是" : "否";
        }
      } else if (
        (fieldMeta.type === "int32" || fieldMeta.type === "float") &&
        description
      ) {
        display = String(value);
        if (fieldName.toLowerCase().includes("mouse")) {
          if (value < 0) {
            if (description.includes("向左") || fieldName.includes("_x"))
              display += " (向左)";
            else if (description.includes("向下") || fieldName.includes("_y"))
              display += " (向下)";
            else if (description.includes("向后") || fieldName.includes("_z"))
              display += " (向后滚动)";
          } else if (value > 0) {
            if (description.includes("向左") || fieldName.includes("_x"))
              display += " (向右)";
            else if (description.includes("向下") || fieldName.includes("_y"))
              display += " (向上)";
            else if (description.includes("向后") || fieldName.includes("_z"))
              display += " (向前滚动)";
          }
        }
      } else if (fieldMeta.type === "uint32" || fieldMeta.type === "int32") {
        if (fieldMeta.parsedEnum && fieldMeta.parsedEnum.length > 0) {
          const mapping = fieldMeta.parsedEnum.find((m) => m.value === value);
          if (mapping) {
            display = `${value} (${mapping.label})`;
          }
        } else if (description) {
          const enumComment = this.findEnumComment(metadata, fieldName);
          if (enumComment) {
            const enumValue = this.parseEnumValue(enumComment, value);
            if (enumValue) {
              display = `${value} (${enumValue})`;
            }
          }
        }
      }

      parsed[realFieldName] = {
        value: value,
        display: display,
        description: description,
        type: fieldMeta.type,
      };
    }

    return parsed;
  }

  findEnumComment(metadata, fieldName) {
    if (metadata.enumComments && metadata.enumComments[fieldName]) {
      return metadata.enumComments[fieldName];
    }
    if (metadata.fields[fieldName]) {
      const desc =
        metadata.fields[fieldName].description ||
        metadata.fields[fieldName].comment;
      if (desc && desc.includes("枚举")) {
        return desc;
      }
    }
    for (const comment of metadata.comments) {
      if (comment.includes(fieldName) && comment.includes("枚举")) {
        return comment;
      }
    }
    return null;
  }

  parseEnumValue(enumComment, value) {
    const match = enumComment.match(/枚举[^:]*:\s*(.+)/);
    if (!match) return null;

    const enumPart = match[1];
    // 改为使用负向零宽断言进行分割，仅匹配前面不是反斜线 \ 的英文逗号
    const pairs = enumPart.split(/(?<!\\),/);

    for (const pair of pairs) {
      const pairMatch = pair.trim().match(/^(\d+)\s*[:：]\s*(.+)/);
      if (pairMatch && parseInt(pairMatch[1]) === value) {
        // 返回时恢复转义的英文逗号
        return pairMatch[2].trim().replace(/\\,/g, ',');
      }
    }
    return null;
  }
}

module.exports = ProtoParser;
