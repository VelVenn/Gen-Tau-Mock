// ui-render.js
function populateManualSelect(messagesData) {
    const select = document.getElementById('manualMessageType');
    if (!messagesData || !select) return;
    
    messagesData.serverMessages.forEach(msg => {
        const option = document.createElement('option');
        option.value = msg.name;
        option.textContent = msg.name;
        select.appendChild(option);
    });
}

function generateFieldInput(messageName, fieldName, fieldMeta, messagesData) {
    const inputId = `input-${messageName}-${fieldName}`;
    const description = fieldMeta.description || fieldMeta.comment || '';
    
    let mappingKey = fieldName;
    if (messageName === 'DeployModeStatusSync' && fieldName === 'status') {
        mappingKey = 'deploy_mode_status';
    } else if (messageName === 'TechCoreMotionStateSync' && fieldName === 'status') {
        mappingKey = 'core_status';
    }
    
    const statusOptions = messagesData.statusMappings?.[mappingKey];
    if (statusOptions && statusOptions.length > 0) {
        const optionsHtml = statusOptions.map(opt => 
            `<option value="${opt.value}">${opt.value}: ${opt.label}</option>`
        ).join('');
        
        return `
            <div class="field-input-section" onclick="event.stopPropagation()">
                <div class="field-input-label">✏️ 选择状态</div>
                <select class="field-select" id="${inputId}" data-type="${fieldMeta.type}">
                    ${optionsHtml}
                </select>
            </div>
        `;
    }
    
    if (fieldMeta.type === 'bool') {
        let options = '';
        if (description.includes('false') || description.includes('true')) {
            const match = description.match(/(false|抬起|否)[^a-zA-Z]*[:：=]?([^,，)]+).*?(true|按下|是)[^a-zA-Z]*[:：=]?([^,，)]+)/i);
            if (match) {
                const falseText = match[2]?.trim() || '抬起/否';
                const trueText = match[4]?.trim() || '按下/是';
                options = `
                    <option value="false">false: ${falseText}</option>
                    <option value="true">true: ${trueText}</option>
                `;
            } else {
                options = `
                    <option value="false">false</option>
                    <option value="true">true</option>
                `;
            }
        } else {
            options = `
                <option value="false">false</option>
                <option value="true">true</option>
            `;
        }
        return `
            <div class="field-input-section" onclick="event.stopPropagation()">
                <div class="field-input-label">✏️ 设置值</div>
                <select class="field-select" id="${inputId}" data-type="bool">
                    ${options}
                </select>
            </div>
        `;
    }
    
    if (fieldMeta.parsedEnum && fieldMeta.parsedEnum.length > 0) {
        const optionsHtml = fieldMeta.parsedEnum.map(opt => 
            `<option value="${opt.value}">${opt.value}: ${opt.label}</option>`
        ).join('');
        return `
            <div class="field-input-section" onclick="event.stopPropagation()">
                <div class="field-input-label">✏️ 选择值</div>
                <select class="field-select" id="${inputId}" data-type="${fieldMeta.type}">
                    ${optionsHtml}
                </select>
            </div>
        `;
    }

    const enumComment = fieldMeta.enumComment;
    if (enumComment || (fieldMeta.type === 'uint32' && description.includes('枚举'))) {
        const enumOptions = parseEnumOptions(enumComment || description);
        if (enumOptions.length > 0) {
            const optionsHtml = enumOptions.map(opt => 
                `<option value="${opt.value}">${opt.value}: ${opt.label}</option>`
            ).join('');
            return `
                <div class="field-input-section" onclick="event.stopPropagation()">
                    <div class="field-input-label">✏️ 选择值</div>
                    <select class="field-select" id="${inputId}" data-type="uint32">
                        ${optionsHtml}
                    </select>
                </div>
            `;
        }
    }
    
    if (fieldMeta.repeated) {
        return `
            <div class="field-input-section" onclick="event.stopPropagation()">
                <div class="field-input-label">✏️ 输入值 (数组，如: [1,2,3])</div>
                <input type="text" class="field-input" id="${inputId}" 
                       data-type="${fieldMeta.type}" data-repeated="true"
                       placeholder="[1, 2, 3]" value="[]">
            </div>
        `;
    }
    
    if (fieldMeta.type === 'uint32' || fieldMeta.type === 'int32') {
        return `
            <div class="field-input-section" onclick="event.stopPropagation()">
                <div class="field-input-label">✏️ 输入值</div>
                <input type="number" class="field-input" id="${inputId}" 
                       data-type="${fieldMeta.type}"
                       placeholder="0" value="0">
            </div>
        `;
    }
    
    if (fieldMeta.type === 'float' || fieldMeta.type === 'double') {
        return `
            <div class="field-input-section" onclick="event.stopPropagation()">
                <div class="field-input-label">✏️ 输入值</div>
                <input type="number" step="0.01" class="field-input" id="${inputId}" 
                       data-type="${fieldMeta.type}"
                       placeholder="0.0" value="0.0">
            </div>
        `;
    }
    
    if (fieldMeta.type === 'string') {
        return `
            <div class="field-input-section" onclick="event.stopPropagation()">
                <div class="field-input-label">✏️ 输入值</div>
                <input type="text" class="field-input" id="${inputId}" 
                       data-type="string"
                       placeholder="文本内容" value="">
            </div>
        `;
    }
    
    if (fieldMeta.type === 'bytes') {
        return `
            <div class="field-input-section" onclick="event.stopPropagation()">
                <div class="field-input-label">✏️ 输入值 (文本或Base64)</div>
                <input type="text" class="field-input" id="${inputId}" 
                       data-type="bytes"
                       placeholder="文本内容" value="">
            </div>
        `;
    }
    
    return `
        <div class="field-input-section" onclick="event.stopPropagation()">
            <div class="field-input-label">✏️ 输入值</div>
            <input type="text" class="field-input" id="${inputId}" 
                   data-type="${fieldMeta.type}"
                   placeholder="值" value="">
        </div>
    `;
}

function parseEnumOptions(description) {
    const match = description.match(/枚举[^:]*:\s*(.+)/);
    if (!match) return [];
    
    const enumPart = match[1];
    const pairs = enumPart.split(/[,，、]/);
    const options = [];
    
    for (const pair of pairs) {
        const pairMatch = pair.trim().match(/^(\d+)\s*[:：]\s*(.+)/);
        if (pairMatch) {
            options.push({
                value: parseInt(pairMatch[1]),
                label: pairMatch[2].trim()
            });
        }
    }
    return options;
}

function renderUplinkMessages(messagesData) {
    const container = document.getElementById('uplinkMessages');
    const count = document.getElementById('uplinkCount');
    
    container.innerHTML = '';
    
    if (!messagesData || messagesData.clientMessages.length === 0) {
        container.innerHTML = '<p class="loading-text">暂无上行消息</p>';
        count.textContent = '0';
        return;
    }
    
    count.textContent = messagesData.clientMessages.length;

    messagesData.clientMessages.forEach(msg => {
        const meta = msg.metadata;
        const item = document.createElement('div');
        item.className = 'message-item';
        item.setAttribute('onclick', 'window.toggleMessage(this)'); // We attach it to window in app.js

        const nameEl = document.createElement('div');
        nameEl.className = 'message-name';
        nameEl.textContent = msg.name;

        const descEl = document.createElement('div');
        descEl.className = 'message-desc';
        descEl.textContent = meta.displayName || meta.description || '无描述';

        const fieldList = document.createElement('div');
        fieldList.className = 'field-list';

        Object.entries(meta.fields).forEach(([fieldName, field]) => {
            const fieldItem = document.createElement('div');
            fieldItem.className = 'field-item';

            const left = document.createElement('div');
            left.className = 'field-left';
            const fn = document.createElement('span'); fn.className = 'field-name'; fn.textContent = fieldName;
            const ft = document.createElement('span'); ft.className = 'field-type'; ft.textContent = '(' + (field.repeated ? 'repeated ' : '') + field.type + ')';
            const fc = document.createElement('div'); fc.className = 'field-comment'; fc.textContent = field.description || field.comment || '无说明';
            left.appendChild(fn); left.appendChild(ft); left.appendChild(fc);

            const right = document.createElement('div');
            right.className = 'field-right received';
            right.id = 'value-' + msg.name + '-' + fieldName;
            const empty = document.createElement('div'); empty.className = 'field-value-empty'; empty.textContent = '暂无数据';
            right.appendChild(empty);

            fieldItem.appendChild(left);
            fieldItem.appendChild(right);
            fieldList.appendChild(fieldItem);
        });

        item.appendChild(nameEl);
        item.appendChild(descEl);
        item.appendChild(fieldList);
        container.appendChild(item);
    });
}

function renderDownlinkMessages(messagesData) {
    const container = document.getElementById('downlinkMessages');
    const count = document.getElementById('downlinkCount');

    container.innerHTML = '';
    if (!messagesData || messagesData.serverMessages.length === 0) {
        container.innerHTML = '<p class="loading-text">暂无下行消息</p>';
        count.textContent = '0';
        return;
    }

    count.textContent = messagesData.serverMessages.length;

    messagesData.serverMessages.forEach(msg => {
        const meta = msg.metadata;
        const item = document.createElement('div');
        item.className = 'message-item';
        item.setAttribute('onclick', 'window.toggleMessage(this)');

        const nameEl = document.createElement('div');
        nameEl.className = 'message-name';
        nameEl.textContent = msg.name;

        const descEl = document.createElement('div');
        descEl.className = 'message-desc';
        descEl.textContent = meta.displayName || meta.description || '无描述';

        const fieldList = document.createElement('div');
        fieldList.className = 'field-list';

        Object.entries(meta.fields).forEach(([fieldName, field]) => {
            const fieldItem = document.createElement('div');
            fieldItem.className = 'field-item';

            const left = document.createElement('div');
            left.className = 'field-left';
            const fn = document.createElement('span'); fn.className = 'field-name'; fn.textContent = fieldName;
            const ft = document.createElement('span'); ft.className = 'field-type'; ft.textContent = '(' + (field.repeated ? 'repeated ' : '') + field.type + ')';
            const fc = document.createElement('div'); fc.className = 'field-comment'; fc.textContent = field.description || field.comment || '无说明';
            left.appendChild(fn); left.appendChild(ft); left.appendChild(fc);

            const inputWrapper = document.createElement('div');
            inputWrapper.className = 'field-right';
            inputWrapper.innerHTML = generateFieldInput(msg.name, fieldName, field, messagesData);

            fieldItem.appendChild(left);
            fieldItem.appendChild(inputWrapper);
            fieldList.appendChild(fieldItem);
        });

        const opArea = document.createElement('div');
        opArea.style.display = 'flex';
        opArea.style.gap = '10px';
        opArea.style.alignItems = 'center';
        opArea.style.marginTop = '10px';

        const sendBtn = document.createElement('button');
        sendBtn.className = 'send-message-btn';
        sendBtn.textContent = '📤 发送此消息';
        sendBtn.onclick = (e) => {
            e.stopPropagation();
            window.sendDownlinkMessage(msg.name);
        };

        const freqLabel = document.createElement('label');
        freqLabel.className = 'form-label';
        freqLabel.textContent = '频率(Hz)';

        const freqInput = document.createElement('input');
        freqInput.type = 'number';
        freqInput.className = 'form-input';
        freqInput.id = 'autoFreq-' + msg.name;
        freqInput.value = messagesData.messageDefaultFrequencies?.[msg.name] || 1;
        freqInput.min = 0.1;
        freqInput.step = 0.1;
        freqInput.style.width = '100px';

        const checkLabel = document.createElement('label');
        checkLabel.style.display = 'flex';
        checkLabel.style.gap = '6px';
        checkLabel.style.alignItems = 'center';
        checkLabel.style.fontSize = '12px';
        checkLabel.style.color = '#333';

        const checkBox = document.createElement('input');
        checkBox.type = 'checkbox';
        checkBox.id = 'autoEnable-' + msg.name;
        // Check if pre-configured active in backend
        if (messagesData.autoPublishers && messagesData.autoPublishers.includes(msg.name)) {
            checkBox.checked = true;
        }
        checkBox.onclick = (e) => {
            e.stopPropagation();
            window.toggleAutoPublish(msg.name);
        };

        checkLabel.appendChild(checkBox);
        checkLabel.appendChild(document.createTextNode('自动发送'));

        opArea.appendChild(sendBtn);
        opArea.appendChild(freqLabel);
        opArea.appendChild(freqInput);
        opArea.appendChild(checkLabel);

        item.appendChild(nameEl);
        item.appendChild(descEl);
        item.appendChild(fieldList);
        item.appendChild(opArea);
        container.appendChild(item);
    });
}

window.renderUplinkMessages = renderUplinkMessages;
window.renderDownlinkMessages = renderDownlinkMessages;
window.populateManualSelect = populateManualSelect;
