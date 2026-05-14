(async function installMcpBiSessionBookmarklet() {
  const VERSION = '2026-05-14-dev-4';
  const GLOBAL_KEY = '__mcpBiSessionBookmarklet';
  const LAUNCHER_ID = 'mcp-bi-session-launcher';
  const MODAL_ID = 'mcp-bi-session-modal';
  const STYLE_ID = 'mcp-bi-session-style';
  const DEFAULT_SESSION_ID = '355fe1c5-7ae2-40d0-b8a8-83c58619aa01';
  const QUERYBOOK_BASE = '/querybook-k8s/ds';
  const ROW_COLUMNS = [
    'date_created',
    'uuid',
    'session_id',
    'tool_invocation_id',
    'client_name',
    'tool_name',
    'execution_result',
    'duration',
    'params',
    'result',
    'additional_fields',
    'error_body',
    'ai_conversation_id',
    'conversation_id',
  ];

  if (window[GLOBAL_KEY]?.open) {
    window[GLOBAL_KEY].open();
    return;
  }

  const state = {
    sessionId: localStorage.getItem('mcpBiSessionViewerSessionId') || DEFAULT_SESSION_ID,
    isLoading: false,
    lastExport: null,
  };

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function getCookie(name) {
    return document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.split('=')
      .slice(1)
      .join('=');
  }

  function assertQuixPage() {
    if (location.hostname !== 'bo.wix.com' || !location.pathname.includes('/data-tools/quix/')) {
      throw new Error('Open https://bo.wix.com/data-tools/quix/v2/ first, then run this bookmarklet.');
    }
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
        inset: 28px;
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
      #${MODAL_ID} .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      #${MODAL_ID} input {
        width: 330px;
        max-width: 45vw;
        border: 1px solid #d0d5dd;
        border-radius: 7px;
        padding: 7px 9px;
        font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      #${MODAL_ID} button {
        border: 1px solid #d0d5dd;
        background: #fff;
        border-radius: 7px;
        padding: 7px 10px;
        cursor: pointer;
        color: #344054;
        font-weight: 700;
      }
      #${MODAL_ID} button.primary { background: #155eef; color: #fff; border-color: #155eef; }
      #${MODAL_ID} button:disabled { opacity: .55; cursor: wait; }
      #${MODAL_ID} .content {
        overflow: auto;
        padding: 14px 18px 24px;
        background: #fff;
      }
      #${MODAL_ID} .status { padding: 18px; color: #475467; }
      #${MODAL_ID} .error-box {
        margin: 14px 0;
        padding: 12px;
        border: 1px solid #fda29b;
        border-radius: 8px;
        background: #fff8f6;
        color: #b42318;
        white-space: pre-wrap;
      }
      #${MODAL_ID} .call {
        border-top: 1px solid #eaecf0;
        padding: 14px 0;
      }
      #${MODAL_ID} .api-tool {
        border-left: 4px solid #3366ff;
        padding-left: 12px;
        background: linear-gradient(90deg, #f5f7ff 0, #fff 240px);
      }
      #${MODAL_ID} .call-api-tool {
        border-left-color: #0e9384;
        background: linear-gradient(90deg, #f0fdf9 0, #fff 240px);
      }
      #${MODAL_ID} .call-head {
        display: flex;
        gap: 12px;
        justify-content: space-between;
        align-items: flex-start;
      }
      #${MODAL_ID} .title-row { display: flex; gap: 10px; align-items: center; }
      #${MODAL_ID} .step {
        display: inline-grid;
        width: 24px;
        height: 24px;
        place-items: center;
        border-radius: 50%;
        background: #e8edff;
        color: #155eef;
        font-size: 12px;
        font-weight: 800;
        flex: 0 0 auto;
      }
      #${MODAL_ID} h2 { font-size: 15px; margin: 0; }
      #${MODAL_ID} .badges { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
      #${MODAL_ID} .badge {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        background: #eef2f7;
        color: #475467;
      }
      #${MODAL_ID} .badge.success { background: #e7f7ef; color: #098849; }
      #${MODAL_ID} .badge.error { background: #fff0f2; color: #c4314b; }
      #${MODAL_ID} .badge.mutation { background: #fff4df; color: #b45309; }
      #${MODAL_ID} .badge.read { background: #eef2f7; color: #475467; }
      #${MODAL_ID} .badge.embedded-error { background: #fff1e6; color: #b42318; }
      #${MODAL_ID} .reason { margin: 10px 0 0; }
      #${MODAL_ID} .docs { margin-top: 10px; }
      #${MODAL_ID} .docs span, #${MODAL_ID} .kv span {
        display: block;
        color: #667085;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      #${MODAL_ID} .docs ul { margin: 6px 0 0; padding-left: 20px; }
      #${MODAL_ID} a { color: #155eef; overflow-wrap: anywhere; }
      #${MODAL_ID} details { margin-top: 10px; }
      #${MODAL_ID} summary { cursor: pointer; color: #475467; font-weight: 800; }
      #${MODAL_ID} pre {
        white-space: pre-wrap;
        overflow: auto;
        margin: 8px 0 0;
        padding: 12px;
        border-radius: 8px;
        background: #101828;
        color: #eef4ff;
        font-size: 11px;
        line-height: 1.45;
        max-height: 520px;
      }
      #${MODAL_ID} .response pre {
        background: #f8fafc;
        color: #101828;
        border: 1px solid #e4e7ec;
      }
      #${MODAL_ID} code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }
      #${MODAL_ID} .tok-keyword { color: #8be9fd; font-weight: 700; }
      #${MODAL_ID} .tok-string { color: #f1fa8c; }
      #${MODAL_ID} .tok-comment { color: #8a99b5; font-style: italic; }
      #${MODAL_ID} .tok-number { color: #bd93f9; }
      #${MODAL_ID} .tok-builtin { color: #50fa7b; }
      @media (max-width: 720px) {
        #${MODAL_ID} .panel { inset: 10px; }
        #${MODAL_ID} .topbar { display: block; }
        #${MODAL_ID} input { max-width: none; width: 100%; margin-top: 10px; }
        #${MODAL_ID} .actions { margin-top: 10px; }
        #${MODAL_ID} .call-head { display: block; }
        #${MODAL_ID} .badges { justify-content: flex-start; margin-top: 10px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    injectStyle();

    let launcher = document.querySelector(`#${LAUNCHER_ID}`);
    if (!launcher) {
      launcher = document.createElement('button');
      launcher.id = LAUNCHER_ID;
      launcher.textContent = 'Open MCP BI Session';
      launcher.addEventListener('click', () => open());
      document.body.appendChild(launcher);
    }

    let modal = document.querySelector(`#${MODAL_ID}`);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.innerHTML = `
        <div class="panel">
          <div class="topbar">
            <div>
              <h1>MCP BI Session Viewer</h1>
              <div class="meta">Querybook/Quix backed viewer (${esc(VERSION)})</div>
            </div>
            <div class="actions">
              <input class="session-input" placeholder="session id" value="${esc(state.sessionId)}">
              <button class="primary load-btn">Load</button>
              <button class="json-btn">Copy JSON</button>
              <button class="close-btn">Close</button>
            </div>
          </div>
          <div class="content"><div class="status">Enter a session id and click Load.</div></div>
        </div>
      `;
      modal.querySelector('.close-btn').addEventListener('click', close);
      modal.querySelector('.load-btn').addEventListener('click', () => {
        const input = modal.querySelector('.session-input');
        loadSession(input.value.trim());
      });
      modal.querySelector('.session-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          loadSession(event.currentTarget.value.trim());
        }
      });
      modal.querySelector('.json-btn').addEventListener('click', copyJson);
      document.body.appendChild(modal);
    }

    return modal;
  }

  function open() {
    const modal = ensureUi();
    modal.classList.add('open');
    modal.querySelector('.session-input')?.focus();
  }

  function close() {
    document.querySelector(`#${MODAL_ID}`)?.classList.remove('open');
  }

  function setLoading(isLoading) {
    state.isLoading = isLoading;
    const modal = ensureUi();
    modal.querySelectorAll('button').forEach((button) => {
      if (!button.classList.contains('close-btn')) {
        button.disabled = isLoading;
      }
    });
  }

  function setContent(html) {
    ensureUi().querySelector('.content').innerHTML = html;
  }

  function renderError(error) {
    setContent(`<div class="error-box">${esc(error.stack || error.message || error)}</div>`);
  }

  async function quixFetch(path, init = {}) {
    const headers = {
      accept: 'application/json, text/plain, */*',
      'x-xsrf-token': getCookie('XSRF-TOKEN'),
      ...(init.headers || {}),
    };

    if (init.body !== undefined) {
      headers['content-type'] = 'application/json; charset=UTF-8';
    }

    const response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers,
    });
    const text = await response.text();
    const body = parseJsonMaybe(text) ?? text;

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body).slice(0, 1000)}`);
    }

    return body;
  }

  async function runQuixQuery(query, { engineId = 1, limit = 1000 } = {}) {
    const submitted = await quixFetch(`${QUERYBOOK_BASE}/query_execution/`, {
      method: 'POST',
      body: JSON.stringify({
        query,
        engine_id: engineId,
        originator: 'mcp-bi-session-viewer',
      }),
    });
    const queryExecutionId = submitted.data.id;
    let execution = submitted;

    for (let attempt = 0; attempt < 90; attempt += 1) {
      execution = await quixFetch(`${QUERYBOOK_BASE}/query_execution/${queryExecutionId}/`, {
        method: 'GET',
      });

      const statements = execution.data.statement_executions || [];
      const unfinished = statements.some((statement) => ![3, 4, 5].includes(statement.status));
      if (statements.length && !unfinished) {
        break;
      }

      await sleep(1000);
    }

    const statement = execution.data.statement_executions?.[0];
    if (!statement) {
      throw new Error('No statement execution found in Querybook response.');
    }
    if (statement.status !== 3) {
      throw new Error(`Statement did not finish successfully: status=${statement.status}; meta=${JSON.stringify(statement.meta || {})}`);
    }

    const result = await quixFetch(
      `${QUERYBOOK_BASE}/statement_execution/${statement.id}/result/?params=${encodeURIComponent(JSON.stringify({ limit }))}`,
      { method: 'GET' },
    );

    return { queryExecutionId, statementExecutionId: statement.id, execution, result };
  }

  function buildSessionSql(sessionId) {
    const escapedSessionId = sessionId.replaceAll("'", "''");
    return `
SELECT
  date_created,
  uuid,
  session_id,
  tool_invocation_id,
  client_name,
  tool_name,
  execution_result,
  duration,
  substr(params, 1, 8000) AS params,
  substr(result, 1, 12000) AS result,
  substr(additional_fields, 1, 12000) AS additional_fields,
  substr(error_body, 1, 8000) AS error_body,
  ai_conversation_id,
  conversation_id
FROM events.dbo.users_39
WHERE evid = 1607
  AND session_id = '${escapedSessionId}'
ORDER BY date_created ASC
`;
  }

  async function loadSession(sessionId) {
    try {
      assertQuixPage();
      if (!sessionId) {
        throw new Error('Missing session id.');
      }

      state.sessionId = sessionId;
      localStorage.setItem('mcpBiSessionViewerSessionId', sessionId);
      ensureUi().querySelector('.session-input').value = sessionId;
      setLoading(true);
      setContent(`<div class="status">Loading session ${esc(sessionId)} from Quix...</div>`);

      const query = buildSessionSql(sessionId);
      const result = await runQuixQuery(query, { limit: 1000 });
      const rows = normalizeResultRows(result.result);
      const sessionExport = buildSessionExport(sessionId, rows, result);
      state.lastExport = sessionExport;
      setContent(renderSession(sessionExport));
      ensureUi().querySelectorAll('details.code-block').forEach((details) => {
        details.open = true;
      });
    } catch (error) {
      console.error(error);
      renderError(error);
    } finally {
      setLoading(false);
    }
  }

  function normalizeResultRows(result) {
    const rows = result?.data?.rows || [];
    return rows
      .filter((row) => !isHeaderRow(row))
      .map((row) => Object.fromEntries(ROW_COLUMNS.map((column, index) => [column, row[index]])));
  }

  function isHeaderRow(row) {
    return Array.isArray(row) &&
      row[5] === 'tool_name' &&
      row[6] === 'execution_result';
  }

  function buildSessionExport(sessionId, rows, querybookResult) {
    const toolCounts = countBy(rows.map((row) => row.tool_name));
    const errors = rows.filter((row) => row.execution_result === 'Error').length;
    const targetToolCalls = rows.filter((row) => ['ExecuteWixAPI', 'CallWixSiteAPI'].includes(row.tool_name)).length;
    const payloadChars = rows.reduce((total, row) => total + ['params', 'additional_fields', 'error_body'].reduce((sum, field) => sum + String(row[field] || '').length, 0), 0);

    return {
      session: {
        session_id: sessionId,
        uuid: rows[0]?.uuid,
        client_name: rows[0]?.client_name,
        first_seen: rows[0]?.date_created,
        last_seen: rows.at(-1)?.date_created,
        total_tool_calls: rows.length,
        target_tool_calls: targetToolCalls,
        errors,
        distinct_tool_count: Object.keys(toolCounts).length,
        tools: Object.keys(toolCounts).sort().join(', '),
        total_payload_chars: payloadChars,
        query_execution_id: querybookResult.queryExecutionId,
        statement_execution_id: querybookResult.statementExecutionId,
      },
      rows,
      rowCount: rows.length,
      payloadMode: 'inline-from-quix-bookmarklet',
    };
  }

  function renderSession(sessionExport) {
    const { session, rows } = sessionExport;
    const toolCounts = countBy(rows.map((row) => row.tool_name));

    if (rows.length === 0) {
      return `<div class="status">No BI tool-call rows found for session <code>${esc(session.session_id)}</code>.</div>`;
    }

    return `
      <div class="kv">
        <div><span>Session</span><strong>${esc(session.session_id)}</strong></div>
        <div><span>Client</span><strong>${esc(session.client_name || 'unknown')}</strong></div>
        <div><span>Window</span><strong>${esc(session.first_seen)} -> ${esc(session.last_seen)}</strong></div>
        <div><span>Calls</span><strong>${esc(`${session.total_tool_calls} total / ${session.errors} errors`)}</strong></div>
        <div><span>Tools</span><strong>${esc(Object.entries(toolCounts).map(([tool, count]) => `${tool} x${count}`).join(', '))}</strong></div>
        <div><span>Querybook</span><strong>${esc(`query ${session.query_execution_id}, statement ${session.statement_execution_id}`)}</strong></div>
      </div>
      <section>
        ${rows.map((row, index) => renderToolCall(row, index + 1)).join('\n')}
      </section>
    `;
  }

  function renderToolCall(row, index) {
    const params = getCleanParams(row);
    const isExecute = row.tool_name === 'ExecuteWixAPI';
    const response = getResponseInfo(row);
    const statusClass = row.execution_result === 'Success' ? 'success' : 'error';
    const toolClass = getToolClass(row.tool_name);

    return `<article class="call ${toolClass}">
      <header class="call-head">
        <div class="title-row">
          <span class="step">${index}</span>
          <h2>${esc(row.tool_name)}</h2>
        </div>
        <div class="badges">
          <span class="badge ${statusClass}">${esc(row.execution_result)}</span>
          ${response?.hasEmbeddedError ? '<span class="badge embedded-error">Has error</span>' : ''}
          ${params.hasMutations == null ? '' : `<span class="badge ${params.hasMutations ? 'mutation' : 'read'}">${params.hasMutations ? 'Mutation' : 'Read-only'}</span>`}
          <span class="badge">${esc(formatDuration(row.duration))}</span>
        </div>
      </header>
      ${params.reason ? `<p class="reason"><strong>Reason:</strong> ${esc(params.reason)}</p>` : ''}
      ${params.searchTerm ? `<div class="kv"><div><span>Search</span><strong>${esc(params.searchTerm)}</strong></div></div>` : ''}
      ${renderDocs(params.sourceDocUrls)}
      ${isExecute && params.code ? renderCode(params.code) : ''}
      ${renderResponse(response)}
      ${hasVisibleErrorBody(row.error_body) ? renderErrorBlock(row.error_body) : ''}
    </article>`;
  }

  function getToolClass(toolName) {
    if (toolName === 'ExecuteWixAPI') return 'api-tool';
    if (toolName === 'CallWixSiteAPI') return 'api-tool call-api-tool';
    return '';
  }

  function renderDocs(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return '';
    return `<div class="docs">
      <span>Source docs</span>
      <ul>${urls.map((url) => `<li><a href="${esc(url)}" target="_blank" rel="noreferrer noopener">${esc(url)}</a></li>`).join('')}</ul>
    </div>`;
  }

  function renderCode(code) {
    return `<details class="code-block" open>
      <summary>Script</summary>
      <pre><code>${highlightJavaScript(code)}</code></pre>
    </details>`;
  }

  function renderResponse(response) {
    if (!response) return '';
    return `<details class="response${response.hasEmbeddedError ? ' embedded-error-response' : ''}">
      <summary>Response preview${response.hasEmbeddedError ? ' - has error' : ''} - ${esc(response.lengthText)}${response.truncated ? ' - truncated' : ''}</summary>
      <div class="meta">${esc(response.shape)}</div>
      <pre><code>${esc(response.rendered)}</code></pre>
    </details>`;
  }

  function renderErrorBlock(value) {
    return `<details class="response embedded-error-response">
      <summary>Error body</summary>
      <pre><code>${esc(stringifyMaybeJson(value))}</code></pre>
    </details>`;
  }

  function hasVisibleErrorBody(value) {
    if (value == null) return false;
    if (typeof value !== 'string') return hasMeaningfulErrorValue(value);

    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return false;

    const parsed = parseJsonMaybe(trimmed);
    if (parsed !== undefined) return hasMeaningfulErrorValue(parsed);

    return true;
  }

  function getCleanParams(row) {
    const parsed = parseJsonMaybe(row.params);
    const params = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!params || typeof params !== 'object') return {};

    return {
      reason: params.reason,
      code: params.code,
      hasMutations: params.hasMutations,
      sourceDocUrls: params.sourceDocUrls,
      searchTerm: params.searchTerm,
      maxResults: params.maxResults,
    };
  }

  function getResponseInfo(row) {
    const additionalFields = parseJsonMaybe(row.additional_fields);
    const additionalFieldsPreview = additionalFields?.resultPreview;
    const rawResult = typeof row.result === 'string' ? row.result.trim() : row.result;
    const rawAdditionalFields = typeof row.additional_fields === 'string' ? row.additional_fields.trim() : row.additional_fields;
    const preview = typeof additionalFieldsPreview === 'string' && additionalFieldsPreview.length > 0
      ? additionalFieldsPreview
      : rawResult || rawAdditionalFields;
    if (typeof preview !== 'string' || preview.length === 0 || preview === 'null' || preview === 'undefined') return undefined;

    const parsedPreview = parseJsonMaybe(preview);
    const rendered = parsedPreview === undefined ? preview : JSON.stringify(parsedPreview, null, 2);

    return {
      rendered,
      shape: describeResponseShape(parsedPreview, preview),
      lengthText: formatResponseLength(preview, additionalFields?.resultTextLength),
      truncated: Boolean(additionalFields?.resultPreviewTruncated),
      hasEmbeddedError: containsErrorLikeValue(parsedPreview) || hasRuntimeErrorText(preview),
    };
  }

  function describeResponseShape(parsedPreview, preview) {
    if (Array.isArray(parsedPreview)) return `JSON array, ${parsedPreview.length} item${parsedPreview.length === 1 ? '' : 's'}`;
    if (parsedPreview && typeof parsedPreview === 'object') return 'JSON object';
    const lineCount = preview.split('\n').length;
    return lineCount > 1 ? `Text response, ${lineCount} lines` : 'Text response';
  }

  function formatResponseLength(preview, resultTextLength) {
    if (typeof resultTextLength === 'number' && Number.isFinite(resultTextLength)) {
      return `${preview.length}/${resultTextLength} chars`;
    }
    return `${preview.length} chars`;
  }

  function containsErrorLikeValue(value) {
    if (value == null) return false;
    if (typeof value === 'string') return hasRuntimeErrorText(value);
    if (Array.isArray(value)) return value.some(containsErrorLikeValue);
    if (typeof value === 'object') {
      return Object.entries(value).some(([key, nestedValue]) => {
        const errorLikeKey = /(^|_)(error|errors|exception|failed|failure)(_|$)/i.test(key);
        return (errorLikeKey && hasMeaningfulErrorValue(nestedValue)) || containsErrorLikeValue(nestedValue);
      });
    }
    return false;
  }

  function hasMeaningfulErrorValue(value) {
    if (value == null || value === false) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.some(hasMeaningfulErrorValue);
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  }

  function hasRuntimeErrorText(value) {
    const text = String(value);
    return /^\s*(Error|Exception|Failed|Failure)\b/im.test(text) ||
      /\bWix API error\s*\((?:4|5)\d\d\)/i.test(text) ||
      /\bHTTP\s+(?:4|5)\d\d\b/i.test(text) ||
      /\bstatus(?:Code)?["']?\s*[:=]\s*(?:4|5)\d\d\b/i.test(text) ||
      /"error"\s*:\s*"[^"]+"/i.test(text) ||
      /"errors"\s*:\s*\[[^\]]*\S[^\]]*\]/i.test(text);
  }

  function parseJsonMaybe(value) {
    if (value == null || value === '') return undefined;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  function stringifyMaybeJson(value) {
    const parsed = parseJsonMaybe(value);
    return parsed === undefined ? String(value) : JSON.stringify(parsed, null, 2);
  }

  function highlightJavaScript(code) {
    const parts = [];
    let index = 0;

    while (index < code.length) {
      const char = code[index];
      const next = code[index + 1];

      if (char === '/' && next === '/') {
        const end = code.indexOf('\n', index);
        const token = code.slice(index, end === -1 ? code.length : end);
        parts.push(span('comment', token));
        index += token.length;
        continue;
      }

      if (char === '/' && next === '*') {
        const end = code.indexOf('*/', index + 2);
        const token = code.slice(index, end === -1 ? code.length : end + 2);
        parts.push(span('comment', token));
        index += token.length;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        const quote = char;
        let end = index + 1;
        while (end < code.length) {
          if (code[end] === '\\') {
            end += 2;
            continue;
          }
          if (code[end] === quote) {
            end += 1;
            break;
          }
          end += 1;
        }
        parts.push(span('string', code.slice(index, end)));
        index = end;
        continue;
      }

      let end = index + 1;
      while (end < code.length) {
        const c = code[end];
        const n = code[end + 1];
        if (c === '"' || c === "'" || c === '`' || (c === '/' && (n === '/' || n === '*'))) {
          break;
        }
        end += 1;
      }
      parts.push(highlightPlainJs(code.slice(index, end)));
      index = end;
    }

    return parts.join('');
  }

  function highlightPlainJs(value) {
    const keywords = new Set([
      'async', 'await', 'break', 'catch', 'class', 'const', 'continue', 'else',
      'false', 'finally', 'for', 'function', 'if', 'let', 'new', 'null',
      'return', 'throw', 'true', 'try', 'undefined', 'while',
    ]);
    const builtins = new Set(['Array', 'Boolean', 'Date', 'JSON', 'Map', 'Math', 'Object', 'Promise', 'Set', 'String']);
    const pattern = /\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b/g;
    let output = '';
    let lastIndex = 0;

    for (const match of value.matchAll(pattern)) {
      output += esc(value.slice(lastIndex, match.index));
      const token = match[0];
      if (/^\d/.test(token)) output += span('number', token);
      else if (keywords.has(token)) output += span('keyword', token);
      else if (builtins.has(token)) output += span('builtin', token);
      else output += esc(token);
      lastIndex = match.index + token.length;
    }

    return output + esc(value.slice(lastIndex));
  }

  function span(className, value) {
    return `<span class="tok-${className}">${esc(value)}</span>`;
  }

  function countBy(values) {
    return values.reduce((counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  }

  function formatDuration(ms) {
    if (ms == null) return 'duration unknown';
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function copyJson() {
    if (!state.lastExport) return;
    await navigator.clipboard.writeText(JSON.stringify(state.lastExport, null, 2));
  }

  function uninstall() {
    document.querySelector(`#${LAUNCHER_ID}`)?.remove();
    document.querySelector(`#${MODAL_ID}`)?.remove();
    document.querySelector(`#${STYLE_ID}`)?.remove();
    delete window[GLOBAL_KEY];
  }

  window[GLOBAL_KEY] = {
    open,
    close,
    refresh: () => loadSession(state.sessionId),
    loadSession,
    uninstall,
    version: VERSION,
  };

  ensureUi();
  open();
})();
