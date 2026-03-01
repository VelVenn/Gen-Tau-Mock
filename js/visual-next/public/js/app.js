// app.js
let messagesData = null;
let uplinkHistory = [];
let isPolling = false;

window.toggleMessage = function (element) {
  if (element.classList.contains("active")) {
    element.classList.remove("active");
  } else {
    const siblings = element.parentElement.children;
    for (let i = 0; i < siblings.length; i++) {
      siblings[i].classList.remove("active");
    }
    element.classList.add("active");
  }
};

async function loadMessages() {
  try {
    const response = await fetch("/api/messages?_t=" + Date.now(), {
      cache: "no-store",
    });
    messagesData = await response.json();

    window.renderUplinkMessages(messagesData);
    window.renderDownlinkMessages(messagesData);
    window.populateManualSelect(messagesData);
  } catch (error) {
    console.error("加载消息定义失败:", error);
    document.getElementById("uplinkMessages").innerHTML =
      '<p class="loading-text" style="color:red">加载配置失败，请确保后台运行正常</p>';
  }
}

async function refreshHistory() {
  if (isPolling) return;
  isPolling = true;

  try {
    const response = await fetch("/api/uplink-history");
    uplinkHistory = await response.json();
    renderHistory();
    updateUplinkReceivedData();
  } catch (error) {
    console.error("获取历史记录失败:", error);
  } finally {
    isPolling = false;
  }
}

function renderHistory() {
  const list = document.getElementById("historyPanel");
  if (!uplinkHistory || uplinkHistory.length === 0) {
    list.innerHTML = '<p class="loading-text">暂无历史记录</p>';
    return;
  }

  list.innerHTML = "";

  uplinkHistory.forEach((msg) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const timeObj = new Date(msg.timestamp);
    const timeStr =
      timeObj.toLocaleTimeString() +
      "." +
      timeObj.getMilliseconds().toString().padStart(3, "0");

    const header = document.createElement("div");
    header.className = "history-header";

    const typeEl = document.createElement("div");
    typeEl.className = "history-type";
    typeEl.textContent = msg.messageType;

    const timeEl = document.createElement("div");
    timeEl.className = "history-time";
    timeEl.textContent = timeStr;

    header.appendChild(typeEl);
    header.appendChild(timeEl);

    const dataBox = document.createElement("div");
    dataBox.className = "history-data";

    let html = "";
    if (msg.parsedData) {
      Object.entries(msg.parsedData).forEach(([key, parsed]) => {
        html += `
                    <div class="field-display">
                        <span class="field-display-name">${key}:</span>
                        <span class="field-display-value">${parsed.display}</span>
                        ${parsed.description ? `<span class="field-display-desc">// ${parsed.description}</span>` : ""}
                    </div>
                `;
      });
    } else {
      html = JSON.stringify(msg.data, null, 2);
    }

    dataBox.innerHTML = html;

    item.appendChild(header);
    item.appendChild(dataBox);
    list.appendChild(item);
  });
}

function updateUplinkReceivedData() {
  if (!uplinkHistory || uplinkHistory.length === 0) return;

  const latestByType = {};
  for (let i = uplinkHistory.length - 1; i >= 0; i--) {
    latestByType[uplinkHistory[i].messageType] = uplinkHistory[i];
  }

  Object.values(latestByType).forEach((msg) => {
    const type = msg.messageType;
    const parsed = msg.parsedData;
    if (!parsed) return;

    const timeObj = new Date(msg.timestamp);
    const timeStr =
      timeObj.toLocaleTimeString() +
      "." +
      timeObj.getMilliseconds().toString().padStart(3, "0");

    Object.entries(parsed).forEach(([key, fieldData]) => {
      const elId = `value-${type}-${key}`;
      const el = document.getElementById(elId);
      if (el) {
        el.innerHTML = `
                    <div class="field-value-received">${fieldData.display}</div>
                    ${fieldData.description ? `<div class="field-value-desc">${fieldData.description}</div>` : ""}
                    <div class="field-value-time">更新时间: ${timeStr}</div>
                `;
      }
    });
  });
}

function showSendStatus(el, success) {
  if (!el) return;
  el.textContent = success ? "Yae!" : "Nah!";
  el.style.color = success ? "#2da44e" : "#cf222e";
  el.style.opacity = "1";
  clearTimeout(el._fadeTimer);
  el._fadeTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, 2000);
}

window.sendDownlinkMessage = function (messageName, statusEl) {
  if (!messagesData) return;

  const meta = messagesData.serverMessages.find(
    (m) => m.name === messageName,
  )?.metadata;
  if (!meta) return alert("找不到该消息定义");

  const data = {};
  let hasError = false;

  Object.entries(meta.fields).forEach(([fieldName, fieldMeta]) => {
    const inputId = `input-${messageName}-${fieldName}`;
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;

    if (fieldMeta.repeated) {
      try {
        let val = inputEl.value;
        if (!val.startsWith("[")) val = "[" + val + "]";
        data[fieldName] = JSON.parse(val);
      } catch (e) {
        alert(`字段 ${fieldName} 格式错误，请输入 JSON 数组如 [1,2,3]`);
        hasError = true;
      }
    } else if (fieldMeta.type === "bool") {
      data[fieldName] = inputEl.value === "true";
    } else if (
      [
        "int32",
        "uint32",
        "int64",
        "uint64",
        "sint32",
        "sint64",
        "fixed32",
        "fixed64",
        "sfixed32",
        "sfixed64",
      ].includes(fieldMeta.type)
    ) {
      data[fieldName] = parseInt(inputEl.value) || 0;
    } else if (fieldMeta.type === "float" || fieldMeta.type === "double") {
      data[fieldName] = parseFloat(inputEl.value) || 0.0;
    } else {
      data[fieldName] = inputEl.value;
    }
  });

  if (hasError) return;

  fetch("/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messageType: messageName,
      topic: messageName,
      data: data,
    }),
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.error) {
        showSendStatus(statusEl, false);
      } else {
        showSendStatus(statusEl, true);
      }
    })
    .catch((err) => {
      console.error(err);
      showSendStatus(statusEl, false);
    });
};

window.toggleAutoPublish = function (messageName) {
  const isEnable = document.getElementById(`autoEnable-${messageName}`).checked;
  const freqInput = document.getElementById(`autoFreq-${messageName}`);
  let freq = parseFloat(freqInput.value);

  if (isNaN(freq) || freq <= 0) {
    freq = 1;
    freqInput.value = 1;
  }

  const intervalMs = Math.round(1000 / freq);

  // 如果是开启状态，先收集当前面板上填写的所有最新值
  let data = null;
  if (isEnable) {
    const meta = messagesData?.serverMessages.find(
      (m) => m.name === messageName,
    )?.metadata;
    if (meta) {
      data = {};
      let hasError = false;
      Object.entries(meta.fields).forEach(([fieldName, fieldMeta]) => {
        const inputId = `input-${messageName}-${fieldName}`;
        const inputEl = document.getElementById(inputId);
        if (inputEl) {
          if (fieldMeta.repeated) {
            try {
              data[fieldName] = JSON.parse(inputEl.value || "[]");
            } catch (e) {
              hasError = true;
            }
          } else if (fieldMeta.type === "bool") {
            data[fieldName] = inputEl.value === "true";
          } else if (
            [
              "int32",
              "uint32",
              "int64",
              "uint64",
              "sint32",
              "sint64",
              "fixed32",
              "fixed64",
              "sfixed32",
              "sfixed64",
            ].includes(fieldMeta.type)
          ) {
            data[fieldName] = parseInt(inputEl.value) || 0;
          } else if (
            fieldMeta.type === "float" ||
            fieldMeta.type === "double"
          ) {
            data[fieldName] = parseFloat(inputEl.value) || 0.0;
          } else {
            data[fieldName] = inputEl.value;
          }
        }
      });
      if (hasError) {
        alert("数组解析错误，无法开启自动发送。请确保填写的是有效 JSON 数组");
        document.getElementById(`autoEnable-${messageName}`).checked = false;
        return;
      }
    }
  }

  fetch("/api/auto-publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messageType: messageName,
      enabled: isEnable,
      intervalMs: intervalMs,
      data: data,
    }),
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.error) {
        alert("自动发送设置失败: " + res.error);
        document.getElementById(`autoEnable-${messageName}`).checked =
          !isEnable;
      }
    })
    .catch((err) => {
      console.error(err);
      document.getElementById(`autoEnable-${messageName}`).checked = !isEnable;
    });
};

// Start
document.addEventListener("DOMContentLoaded", () => {
  loadMessages();
  setInterval(refreshHistory, 500); // 0.5秒刷新一次前端通信面板
});
