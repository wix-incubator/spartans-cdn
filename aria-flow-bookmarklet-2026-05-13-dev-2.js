(async function installAriaFlowBookmarklet() {
  const VERSION = '2026-05-13-dev-2';
  const GLOBAL_KEY = '__ariaFlowBookmarklet';
  const LAUNCHER_ID = 'aria-flow-launcher';
  const MODAL_ID = 'aria-flow-modal';
  const STYLE_ID = 'aria-flow-style';

  if (window[GLOBAL_KEY]?.open) {
    window[GLOBAL_KEY].open();
    return;
  }

  const state = {
    loadedConversationId: null,
    isLoading: false,
  };

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function getConversationId() {
    const conversationId = location.pathname.match(/\/conversations\/([^/?#]+)/)?.[1];
    if (!conversationId) {
      throw new Error('Could not find conversation id in URL');
    }
    return conversationId;
  }

  function injectStyle() {
    document.querySelector(`#${STYLE_ID}`)?.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${LAUNCHER_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483646;
        border: 0;
        border-radius: 999px;
        background: #155eef;
        color: white;
        padding: 10px 14px;
        font: 600 13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 10px 28px rgba(16,24,40,.24);
        cursor: pointer;
      }
      #${MODAL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: none;
        background: rgba(16,24,40,.56);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #172033;
      }
      #${MODAL_ID}.open { display: block; }
      #${MODAL_ID} .panel {
        position: absolute;
        inset: 36px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 24px 80px rgba(16,24,40,.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #${MODAL_ID} .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 16px;
        border-bottom: 1px solid #eaecf0;
        background: #fcfcfd;
      }
      #${MODAL_ID} h1 { font-size: 16px; margin: 0; }
      #${MODAL_ID} .meta { color: #667085; font-size: 12px; margin-top: 3px; }
      #${MODAL_ID} .actions { display: flex; gap: 8px; align-items: center; }
      #${MODAL_ID} button {
        border: 1px solid #d0d5dd;
        background: #fff;
        border-radius: 7px;
        padding: 6px 10px;
        cursor: pointer;
        color: #344054;
        font-weight: 600;
      }
      #${MODAL_ID} button.primary { background: #155eef; color: #fff; border-color: #155eef; }
      #${MODAL_ID} .content {
        overflow: auto;
        padding: 14px 18px 24px;
        background: #fff;
      }
      #${MODAL_ID} .item {
        border: 1px solid #eaecf0;
        border-radius: 8px;
        padding: 12px;
        margin: 10px 0;
        background: #fcfcfd;
        font-size: 13px;
        line-height: 1.45;
      }
      #${MODAL_ID} .user {
        background: #f2f4f7;
        border-color: #d0d5dd;
        box-shadow: inset 5px 0 0 #98a2b3;
      }
      #${MODAL_ID} .assistant {
        background: #ecfdf3;
        border-color: #abefc6;
        box-shadow: inset 5px 0 0 #12b76a;
      }
      #${MODAL_ID} .tool {
        background: #f4f3ff;
        border-color: #d9d6fe;
        box-shadow: inset 5px 0 0 #7a5af8;
      }
      #${MODAL_ID} .execute-tool {
        background: #f0e9ff;
        border-color: #bdb4fe;
        box-shadow: inset 7px 0 0 #6938ef;
      }
      #${MODAL_ID} .tool-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
      #${MODAL_ID} h2 { font-size: 14px; margin: 0; }
      #${MODAL_ID} .badge {
        display: inline-block;
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 999px;
        background: #ecfdf3;
        color: #027a48;
        border: 1px solid #abefc6;
        margin-left: 4px;
      }
      #${MODAL_ID} .badge.error { background: #fef3f2; color: #b42318; border-color: #fecdca; }
      #${MODAL_ID} .badge.mutation { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
      #${MODAL_ID} .reason { margin: 8px 0; color: #344054; }
      #${MODAL_ID} details { margin-top: 8px; }
      #${MODAL_ID} summary { cursor: pointer; color: #344054; font-weight: 600; }
      #${MODAL_ID} a { color: #155eef; font-weight: 600; }
      #${MODAL_ID} pre {
        white-space: pre-wrap;
        overflow: auto;
        background: #101828;
        color: #f8fafc;
        padding: 10px;
        border-radius: 6px;
        font-size: 12px;
        line-height: 1.45;
        max-height: 420px;
      }
      #${MODAL_ID} .msg-role { font-size: 11px; font-weight: 700; color: #667085; margin-bottom: 4px; }
    `;
    document.head.appendChild(style);
  }

  async function fetchJson(url, init) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      ...init,
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}: ${url}\n${await res.text()}`);
    }
    return res.json();
  }

  function extractText(content) {
    return content?.text?.generatedText ?? content?.generatedText ?? '';
  }

  function extractToolResultText(toolResult) {
    return (toolResult.content ?? []).map(extractText).filter(Boolean).join('\n');
  }

  function linkifyEscaped(value) {
    return esc(value).replace(
      /https?:\/\/[^\s<>"')]+/g,
      (url) => `<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`,
    );
  }

  function renderText(value) {
    return linkifyEscaped(value).replaceAll('\n', '<br>');
  }

  function shouldRenderMessage(role, text) {
    if (!['USER', 'ASSISTANT'].includes(role)) return false;
    if (!text.trim() || text.includes('<HIDDEN>')) return false;
    if (text.startsWith('Consent message:')) return false;
    if (text.startsWith('The following is the most up-to-date')) return false;
    return true;
  }

  function shouldRenderTool(name) {
    return !['updateSkillCatalog', 'injectRuntimeKnowledge'].includes(name);
  }

  function toolClass(name) {
    if (name === 'ExecuteWixAPI') return 'api-tool execute-tool';
    if (name === 'CallWixSiteAPI') return 'api-tool';
    return '';
  }

  function responseShape(text) {
    const trimmed = text.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return `JSON array, ${parsed.length} items`;
      if (parsed && typeof parsed === 'object') return 'JSON object';
    } catch {}
    return text.includes('\n') ? `Text, ${text.split('\n').length} lines` : 'Text';
  }

  function extractAssistantResponse(llmCall) {
    const anthropicBlocks = llmCall.response?.googleAnthropicClaudeResponse?.contentBlocks;
    if (Array.isArray(anthropicBlocks)) {
      const text = anthropicBlocks
        .map((block) => block.textContent?.text || block.textContent?.generatedText || '')
        .filter(Boolean)
        .join('\n\n');
      if (text.trim()) return text;
    }

    const openAiText = llmCall.response?.openAiChatCompletionResponse?.choices?.[0]?.message?.content;
    if (typeof openAiText === 'string' && openAiText.trim()) {
      return openAiText;
    }

    const generatedText = llmCall.response?.generatedTexts?.find((text) => text.trim());
    return generatedText || '';
  }

  function renderTool(index, toolUse, resultByToolId) {
    const input = toolUse.input ?? {};
    const result = resultByToolId.get(toolUse.id);
    const hasError = Boolean(result?.error);
    const response = result?.text ?? '';

    return `
      <div class="item tool ${toolClass(toolUse.name)}">
        <div class="tool-head">
          <h2>${index}. ${esc(toolUse.name)}</h2>
          <div>
            <span class="badge ${hasError ? 'error' : ''}">${hasError ? 'Has error' : 'Success'}</span>
            ${input.hasMutations == null ? '' : `<span class="badge mutation">${input.hasMutations ? 'Mutation' : 'Read-only'}</span>`}
          </div>
        </div>
        ${input.reason ? `<div class="reason"><strong>Reason:</strong> ${esc(input.reason)}</div>` : ''}
        ${input.searchTerm ? `<div><strong>Search:</strong> ${esc(input.searchTerm)}</div>` : ''}
        ${input.articleUrl ? `<div><strong>Article:</strong> <a href="${esc(input.articleUrl)}" target="_blank" rel="noreferrer noopener">${esc(input.articleUrl)}</a></div>` : ''}
        ${input.code ? `<details><summary>Script</summary><pre>${esc(input.code)}</pre></details>` : ''}
        ${response ? `<details><summary>Response preview · ${esc(responseShape(response))} · ${response.length} chars</summary><pre>${linkifyEscaped(response)}</pre></details>` : ''}
      </div>
    `;
  }

  async function loadFlowHtml(conversationId) {
    const messagesData = await fetchJson(
      '/_api/conversation-message/internal/v2/conversation-messages/query',
      {
        method: 'POST',
        body: JSON.stringify({
          conversationId,
          query: {
            sort: [{ order: 'ASC', fieldName: 'createdDate' }],
            cursorPaging: { limit: 100 },
          },
        }),
      },
    );

    const messages = messagesData.conversationMessages ?? [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'ASSISTANT');
    if (!lastAssistant?.id) {
      throw new Error('Could not find assistant message id');
    }

    const payloadId = encodeURIComponent(lastAssistant.id);
    const logData = await fetchJson(
      `/conversation-message-log-payload-service/v1/conversation-message-log-payloads/${payloadId}?conversationMessageLogPayloadId=${payloadId}`,
    );

    const logs = logData.conversationMessageLogPayload?.logs ?? [];
    const llmCalls = logs
      .filter((log) => log.logType === 'GENERIC_LOG' && log.message === 'LLM Call' && log.jsonData)
      .map((log) => {
        try { return JSON.parse(log.jsonData); } catch { return null; }
      })
      .filter(Boolean);

    const llmCall =
      [...llmCalls].reverse().find((call) =>
        call.request?.dynamicRequestConfig?.gatewayToolDefinitions?.length > 0
      ) ?? llmCalls.at(-1);

    if (!llmCall) {
      throw new Error('No main LLM call found');
    }

    const gatewayMessages = llmCall.request?.dynamicRequestConfig?.gatewayMessageDefinitions ?? [];
    const resultByToolId = new Map();

    for (const msg of gatewayMessages) {
      for (const content of msg.content ?? []) {
        if (content.toolResult?.toolUseId) {
          resultByToolId.set(content.toolResult.toolUseId, {
            error: Boolean(content.toolResult.error),
            text: extractToolResultText(content.toolResult),
          });
        }
      }
    }

    const items = [];
    let step = 1;

    for (const msg of gatewayMessages) {
      if (msg.role === 'SYSTEM') continue;

      for (const content of msg.content ?? []) {
        const text = extractText(content);

        if (text && shouldRenderMessage(msg.role, text)) {
          items.push(`
            <div class="item ${msg.role.toLowerCase()}">
              <div class="msg-role">${esc(msg.role)}</div>
              <div>${renderText(text)}</div>
            </div>
          `);
        }

        if (content.toolUse && shouldRenderTool(content.toolUse.name)) {
          items.push(renderTool(step++, content.toolUse, resultByToolId));
        }
      }
    }

    const finalAssistantResponse = extractAssistantResponse(llmCall);
    if (finalAssistantResponse.trim()) {
      items.push(`
        <div class="item assistant">
          <div class="msg-role">ASSISTANT RESPONSE</div>
          <div>${renderText(finalAssistantResponse)}</div>
        </div>
      `);
    }

    const tools = [...new Set(gatewayMessages.flatMap((m) =>
      (m.content ?? []).map((c) => c.toolUse?.name).filter(Boolean)
    ))];

    return {
      tools,
      html: items.join(''),
    };
  }

  function createUi() {
    document.querySelector(`#${LAUNCHER_ID}`)?.remove();
    document.querySelector(`#${MODAL_ID}`)?.remove();

    const launcher = document.createElement('button');
    launcher.id = LAUNCHER_ID;
    launcher.textContent = 'Open Aria Flow';
    document.body.appendChild(launcher);

    const modal = document.createElement('section');
    modal.id = MODAL_ID;
    modal.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true">
        <div class="topbar">
          <div>
            <h1>Injected Aria Flow</h1>
            <div class="meta">Version: ${esc(VERSION)}</div>
          </div>
          <div class="actions">
            <button class="primary" data-refresh>Refresh</button>
            <button data-close>Close</button>
          </div>
        </div>
        <div class="content">
          <div class="item">Loading...</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    return { launcher, modal };
  }

  const { launcher, modal } = createUi();

  async function refresh(force = false) {
    const conversationId = getConversationId();
    const content = modal.querySelector('.content');

    if (state.isLoading) return;
    if (!force && state.loadedConversationId === conversationId && content.dataset.loaded === 'true') {
      return;
    }

    state.isLoading = true;
    content.dataset.loaded = 'false';
    content.innerHTML = '<div class="item">Loading...</div>';

    try {
      const flow = await loadFlowHtml(conversationId);
      modal.querySelector('.meta').textContent =
        `Conversation: ${conversationId} · Tools: ${flow.tools.join(', ')}`;
      content.innerHTML = flow.html || '<div class="item">No rendered messages/tools found.</div>';
      content.dataset.loaded = 'true';
      state.loadedConversationId = conversationId;
    } catch (error) {
      content.innerHTML = `<div class="item"><strong>Error:</strong><pre>${esc(error.stack || error.message || error)}</pre></div>`;
    } finally {
      state.isLoading = false;
    }
  }

  function openModal() {
    modal.classList.add('open');
    void refresh(false);
  }

  function closeModal() {
    modal.classList.remove('open');
  }

  launcher.addEventListener('click', openModal);
  modal.querySelector('[data-close]').addEventListener('click', closeModal);
  modal.querySelector('[data-refresh]').addEventListener('click', () => refresh(true));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  injectStyle();

  window[GLOBAL_KEY] = {
    version: VERSION,
    open: openModal,
    close: closeModal,
    refresh: () => refresh(true),
    uninstall: () => {
      document.querySelector(`#${LAUNCHER_ID}`)?.remove();
      document.querySelector(`#${MODAL_ID}`)?.remove();
      document.querySelector(`#${STYLE_ID}`)?.remove();
      delete window[GLOBAL_KEY];
    },
  };

  openModal();
})();
