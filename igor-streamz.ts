import type { APIRoute } from 'astro';
import { readdirSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  baseURL: "https://manage.wix.com/_api/igor-ai-gateway/proxy/anthropic",
  apiKey: 'fake-api-key'
});

class StreamingFileParser {
  private buffer = '';
  private writtenFiles: string[] = [];
  private errors: string[] = [];
  private eventEmitter: (event: string, data: any) => void;
  private currentFileBuffer = '';
  private currentFilePath = '';
  private isInFile = false;

  constructor(eventEmitter: (event: string, data: any) => void) {
    this.eventEmitter = eventEmitter;
  }

  processChunk(chunk: string): { filesWritten: string[]; errors: string[]; totalFiles: number } {
    this.buffer += chunk;

    // Process message tags first, then file tags
    this.parseMessages();
    this.parseStreamingFiles();

    return {
      filesWritten: [...this.writtenFiles],
      errors: [...this.errors],
      totalFiles: this.writtenFiles.length
    };
  }

  private parseMessages() {
    // Look for complete message tags
    const messageRegex = /<message>([\s\S]*?)<\/message>/g;
    let messageMatch;

    while ((messageMatch = messageRegex.exec(this.buffer)) !== null) {
      const [fullMatch, messageContent] = messageMatch;
      const trimmedMessage = messageContent.trim();

      if (trimmedMessage) {
        // Emit message event
        this.eventEmitter('claude_message', {
          message: trimmedMessage,
          timestamp: new Date().toISOString()
        });

        console.log(`💬 Claude message: ${trimmedMessage}`);
      }

      // Remove the processed message from buffer
      this.buffer = this.buffer.replace(fullMatch, '');
      messageRegex.lastIndex = 0; // Reset regex index after buffer modification
    }
  }

  private parseStreamingFiles() {
    // Look for opening file tags
    const openTagRegex = /<file\s+path="([^"]+)">/g;
    let openMatch;

    while ((openMatch = openTagRegex.exec(this.buffer)) !== null) {
      const [fullMatch, filePath] = openMatch;

      if (!this.isInFile) {
        this.currentFilePath = filePath.trim();
        this.currentFileBuffer = '';
        this.isInFile = true;

        // Emit file start event
        this.eventEmitter('file_start', {
          path: this.currentFilePath,
          message: `📝 Starting to generate: ${this.currentFilePath}`
        });

        // Remove the opening tag from buffer
        this.buffer = this.buffer.replace(fullMatch, '');
        openTagRegex.lastIndex = 0;
      }
    }

    // If we're in a file, look for content and closing tags
    if (this.isInFile) {
      const closeTagRegex = /<\/file>/;
      const closeMatch = this.buffer.match(closeTagRegex);

      if (closeMatch) {
        // We found the closing tag, extract the complete content
        const contentEndIndex = this.buffer.indexOf('</file>');
        const fileContent = this.buffer.substring(0, contentEndIndex).trim();

        try {
          this.writeFile(this.currentFilePath, fileContent);

          // Emit file complete event
          this.eventEmitter('file_complete', {
            path: this.currentFilePath,
            content: fileContent,
            message: `✅ Completed: ${this.currentFilePath}`
          });

          // Remove processed content from buffer
          this.buffer = this.buffer.substring(contentEndIndex + 7); // 7 = '</file>'.length
          this.isInFile = false;
          this.currentFilePath = '';
          this.currentFileBuffer = '';
        } catch (error) {
          const errorMsg = `Failed to write ${this.currentFilePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          this.errors.push(errorMsg);

          this.eventEmitter('file_error', {
            path: this.currentFilePath,
            error: errorMsg,
            message: `❌ Error: ${errorMsg}`
          });

          this.isInFile = false;
        }
      } else {
        // Still streaming content, show partial updates
        const newContent = this.buffer;
        if (newContent !== this.currentFileBuffer) {
          this.currentFileBuffer = newContent;

          // Emit streaming content event
          this.eventEmitter('file_streaming', {
            path: this.currentFilePath,
            content: newContent,
            message: `🔄 Streaming: ${this.currentFilePath}...`
          });
        }
      }
    }
  }

  private writeFile(filePath: string, content: string) {
    // Ensure the file path starts with src/ as per the prompt requirements
    const fullPath = filePath.startsWith('src/') ? filePath : `src/${filePath}`;

    console.log(`✍️ Writing file: ${fullPath}`);

    // Create directory if it doesn't exist
    const dir = dirname(fullPath);
    mkdirSync(dir, { recursive: true });

    // Write the file
    writeFileSync(fullPath, content, 'utf8');
    this.writtenFiles.push(fullPath);
    console.log(`✅ Successfully wrote: ${fullPath}`);
  }

  finalize(): { filesWritten: string[]; errors: string[]; totalFiles: number } {
    // Process any remaining messages in the buffer
    this.parseMessages();

    // Handle any remaining file in progress
    if (this.isInFile && this.currentFileBuffer) {
      try {
        this.writeFile(this.currentFilePath, this.currentFileBuffer);
        this.eventEmitter('file_complete', {
          path: this.currentFilePath,
          content: this.currentFileBuffer,
          message: `✅ Completed (final): ${this.currentFilePath}`
        });
      } catch (error) {
        const errorMsg = `Failed to write ${this.currentFilePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.errors.push(errorMsg);
        this.eventEmitter('file_error', {
          path: this.currentFilePath,
          error: errorMsg,
          message: `❌ Error: ${errorMsg}`
        });
      }
    }

    return {
      filesWritten: this.writtenFiles,
      errors: this.errors,
      totalFiles: this.writtenFiles.length
    };
  }
}

const completePromptWithStreaming = async (prompt: string, eventEmitter: (event: string, data: any) => void) => {
  try {
    console.log('🚀 Starting Claude streaming request for prompt:', prompt.substring(0, 50) + '...');

    eventEmitter('status', { message: '🔍 Preparing request...' });

    const importantFiles = [
      'src/tailwind.config.mjs',
    ]

    const componentsPath = 'src/components/ui';

    const components = readdirSync(componentsPath)
      .filter(file => {
        try {
          return statSync(join(componentsPath, file)).isFile();
        } catch {
          return false;
        }
      })
      .map(file => {
        return `
          <file path="${componentsPath}/${file}" readOnly />
        `;
      }).join('\n\n---\n\n');

    const nonUiComponentsPath = 'src/components';
    const nonUiComponents = readdirSync(nonUiComponentsPath)
      .filter(file => {
        try {
          return statSync(join(nonUiComponentsPath, file)).isFile();
        } catch {
          return false;
        }
      })
      .map(file => {
        return `
          <file path="${nonUiComponentsPath}/${file}">
            ${readFileSync(join(nonUiComponentsPath, file), 'utf8')}
          </file>
        `;
      }).join('\n\n---\n\n');

    const files = importantFiles.map(file => {
      const content = readFileSync(file, 'utf8');
      return `
        <file path="${file}">
          ${content}
        </file>
      `;
    }).join('\n\n---\n\n');

    const systemPrompt = `
You are the best programmer of a project written over Astro with React router and React components.

The user will give you a prompt and you must change the files in the project to achieve the user's goal.

These are UI components that you can use but not change:

${components}

Other components that you can use / change / add to:

${nonUiComponents}

Other files that you can use:

${files}

you must only change these files, and nothing else

you can write messages to the user regarding what you are doing with the <message> tag.

you dont always have to write or edit files, you can also write messages to the user.

<message>
  a message to the user
</message>
<message>
  another message to the user ...
</message>

Your output format with files and messages must be the following and nothing more:

<message>
  a message to the user
</message>
<file path="src/the/path/to/the/file">
  the new file content
</file>
<file path="src/the/path/to/the/file">
  the new file content
</file>
<message>
  another message to the user ...
</message>
<file path="src/the/path/to/the/file">
  the new file content
</file>

all files must be in the src folder

you may add new files.

if you fail to write the best code possible, you and I will be fired.

make sure you integrate all the components so that the solution is complete and working.

`;

    // Send system prompt to client
    eventEmitter('system_prompt', {
      prompt: systemPrompt,
      message: '📋 System prompt prepared'
    });

    eventEmitter('status', { message: '🤖 Starting Claude request...' });

    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 64000,
    });

    const parser = new StreamingFileParser(eventEmitter);
    let fullResponse = '';

    eventEmitter('status', { message: '📡 Streaming response...' });

    // Process the stream
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      parser.processChunk(chunk);
    }

    // Finalize parsing
    const finalResult = parser.finalize();

    eventEmitter('complete', {
      message: `✅ Generation complete! ${finalResult.totalFiles} files written.`,
      filesWritten: finalResult.filesWritten,
      errors: finalResult.errors,
      totalFiles: finalResult.totalFiles
    });

    console.log('✅ Streaming completed');
    console.log(`📄 Full response length: ${fullResponse.length}`);
    console.log(`📁 Total files written: ${finalResult.totalFiles}`);

    return finalResult;
  } catch (error) {
    console.error('❌ Error in completePrompt:', error);
    eventEmitter('error', {
      message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

const getChatUI = () => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IGOR Code Generator</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            background: #0d1117;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            color: #e6edf3;
        }

        .main-container {
            display: flex;
            gap: 1px;
            width: 98%;
            max-width: 1600px;
            height: 95vh;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #30363d;
        }

        .chat-container {
            background: #161b22;
            flex: 1;
            min-width: 400px;
            max-width: 600px;
            display: flex;
            flex-direction: column;
            border-right: 1px solid #30363d;
        }

        .streaming-panel {
            background: #0d1117;
            flex: 1;
            min-width: 400px;
            display: flex;
            flex-direction: column;
        }

        .streaming-panel-header {
            background: #21262d;
            color: #e6edf3;
            padding: 12px 16px;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .streaming-panel-header h2 {
            font-size: 14px;
            font-weight: 600;
            margin: 0;
        }

        .streaming-panel-header p {
            opacity: 0.7;
            font-size: 12px;
            margin: 0;
        }

        .streaming-content {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            background: #0d1117;
        }

        .header {
            background: #21262d;
            color: #e6edf3;
            padding: 12px 16px;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header h1 {
            font-size: 14px;
            font-weight: 600;
            margin: 0;
        }

        .header p {
            opacity: 0.7;
            font-size: 12px;
            margin: 0;
        }

        .chat-area {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            background: #161b22;
        }

        .input-area {
            padding: 12px 16px;
            background: #21262d;
            border-top: 1px solid #30363d;
        }

        .input-form {
            display: flex;
            gap: 8px;
        }

        .prompt-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #30363d;
            border-radius: 6px;
            font-size: 14px;
            background: #0d1117;
            color: #e6edf3;
            outline: none;
            transition: border-color 0.2s;
            font-family: inherit;
        }

        .prompt-input:focus {
            border-color: #58a6ff;
            box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.1);
        }

        .prompt-input::placeholder {
            color: #7d8590;
        }

        .send-btn {
            padding: 8px 16px;
            background: #238636;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
            font-size: 14px;
            font-family: inherit;
        }

        .send-btn:hover {
            background: #2ea043;
        }

        .send-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            background: #238636;
        }

        .message {
            margin-bottom: 12px;
            padding: 12px;
            border-radius: 6px;
            max-width: 85%;
            font-size: 14px;
            line-height: 1.5;
        }

        .user-message {
            background: #1f2937;
            color: #e6edf3;
            margin-left: auto;
            border: 1px solid #374151;
        }

        .assistant-message {
            background: #21262d;
            color: #e6edf3;
            border: 1px solid #30363d;
        }

        .claude-message {
            background: #0d2818;
            border: 1px solid #238636;
            color: #e6edf3;
            margin: 12px 0;
            position: relative;
        }

        .claude-message::before {
            content: "🤖";
            position: absolute;
            top: -6px;
            left: 12px;
            background: #238636;
            color: white;
            border-radius: 4px;
            width: 20px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
        }

        .loading {
            display: none;
            text-align: center;
            padding: 16px;
            color: #7d8590;
        }

        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #30363d;
            border-radius: 50%;
            border-top-color: #58a6ff;
            animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .file-results {
            margin-top: 8px;
            padding: 12px;
            background: #0d2818;
            border: 1px solid #238636;
            border-radius: 6px;
            font-size: 13px;
        }

        .file-list {
            list-style: none;
            margin: 4px 0;
        }

        .file-list li {
            padding: 1px 0;
            color: #2ea043;
        }

        .error-list {
            list-style: none;
            margin: 4px 0;
        }

        .error-list li {
            padding: 1px 0;
            color: #f85149;
        }

        .streaming-container {
            padding: 12px;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            font-family: inherit;
            margin-bottom: 12px;
        }

        .current-file {
            background: #21262d;
            color: #e6edf3;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 12px;
            border-left: 3px solid #58a6ff;
        }

        .file-header {
            color: #58a6ff;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
        }

        .file-content {
            background: #0d1117;
            color: #e6edf3;
            padding: 12px;
            border-radius: 6px;
            white-space: pre-wrap;
            max-height: 300px;
            overflow-y: auto;
            font-size: 12px;
            line-height: 1.4;
            border: 1px solid #30363d;
        }

        .status-message {
            padding: 6px 10px;
            background: #0d2818;
            border: 1px solid #238636;
            border-radius: 4px;
            color: #2ea043;
            margin-bottom: 6px;
            font-size: 12px;
        }

        .completed-files {
            margin-top: 12px;
            padding: 12px;
            background: #0d2818;
            border: 1px solid #238636;
            border-radius: 6px;
        }

        .completed-files h4 {
            color: #2ea043;
            margin-bottom: 8px;
            font-size: 13px;
            font-weight: 600;
        }

        .completed-file-item {
            margin-bottom: 6px;
            border: 1px solid #30363d;
            border-radius: 6px;
            background: #21262d;
            overflow: hidden;
        }

        .completed-file-header {
            padding: 10px 12px;
            background: #21262d;
            border-bottom: 1px solid #30363d;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background-color 0.2s;
        }

        .completed-file-header:hover {
            background: #30363d;
        }

        .completed-file-info {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .completed-file-path {
            color: #58a6ff;
            font-weight: 500;
            font-size: 12px;
        }

        .completed-file-toggle {
            color: #7d8590;
            font-size: 12px;
            font-weight: bold;
            transition: transform 0.2s;
        }

        .completed-file-toggle.expanded {
            transform: rotate(90deg);
        }

        .completed-file-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }

        .completed-file-content.expanded {
            max-height: 400px;
            overflow-y: auto;
        }

        .completed-file-code {
            background: #0d1117;
            color: #e6edf3;
            padding: 12px;
            font-family: inherit;
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            margin: 0;
            border-top: 1px solid #30363d;
        }

        .pulse {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .system-prompt-container {
            margin: 12px 0;
            border: 1px solid #30363d;
            border-radius: 6px;
            overflow: hidden;
            background: #21262d;
        }

        .system-prompt-header {
            padding: 10px 12px;
            background: #21262d;
            border-bottom: 1px solid #30363d;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background-color 0.2s;
        }

        .system-prompt-header:hover {
            background: #30363d;
        }

        .system-prompt-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
            color: #e6edf3;
            font-size: 13px;
        }

        .system-prompt-toggle {
            color: #7d8590;
            font-size: 12px;
            font-weight: bold;
            transition: transform 0.2s;
        }

        .system-prompt-toggle.expanded {
            transform: rotate(90deg);
        }

        .system-prompt-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }

        .system-prompt-content.expanded {
            max-height: 500px;
            overflow-y: auto;
        }

        .system-prompt-text {
            padding: 12px;
            background: #0d1117;
            color: #e6edf3;
            font-family: inherit;
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            margin: 0;
            border-top: 1px solid #30363d;
        }

        /* Responsive design */
        @media (max-width: 1024px) {
            .main-container {
                flex-direction: column;
                height: auto;
                min-height: 90vh;
                gap: 1px;
            }

            .chat-container, .streaming-panel {
                max-width: none;
                min-width: 300px;
                border-right: none;
                border-bottom: 1px solid #30363d;
            }

            .streaming-panel {
                min-height: 300px;
                border-bottom: none;
            }
        }

        @media (max-width: 640px) {
            body {
                padding: 8px;
            }

            .main-container {
                width: 100%;
                gap: 1px;
                border-radius: 6px;
            }

            .chat-container, .streaming-panel {
                min-width: 280px;
            }

            .header, .streaming-panel-header {
                padding: 10px 12px;
            }

            .header h1, .streaming-panel-header h2 {
                font-size: 13px;
            }

            .header p, .streaming-panel-header p {
                font-size: 11px;
            }

            .input-area {
                padding: 10px 12px;
            }

            .chat-area, .streaming-content {
                padding: 12px;
            }
        }
    </style>
  </head>
<body>
    <div class="main-container">
        <div class="chat-container">
            <div class="header">
                <h1>🤖 IGOR Code Generator</h1>
                <p>AI-powered file generation and code editing</p>
            </div>

            <div class="chat-area" id="chatArea">
                <div class="assistant-message message">
                    <strong>IGOR:</strong> Code generator ready. Describe the components, pages, or features you want to create and I'll generate the implementation files automatically.
                </div>
            </div>

            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p>IGOR is thinking and writing files...</p>
            </div>

            <div class="input-area">
                <form class="input-form" id="promptForm">
                    <input
                        type="text"
                        class="prompt-input"
                        id="promptInput"
                        placeholder="Describe components, pages, or features to generate..."
                        required
                    >
                    <button type="submit" class="send-btn" id="sendBtn">Send</button>
                </form>
            </div>
        </div>

        <div class="streaming-panel">
            <div class="streaming-panel-header">
                <h2>📄 Live Output</h2>
                <p>Real-time code generation and file creation</p>
            </div>

            <div class="streaming-content" id="streamingContent">
                <div class="assistant-message message">
                    <strong>Status:</strong> Awaiting generation request. Real-time output will appear here.
                </div>
            </div>
        </div>
    </div>

    <script>
        const chatArea = document.getElementById('chatArea');
        const streamingContent = document.getElementById('streamingContent');
        const promptForm = document.getElementById('promptForm');
        const promptInput = document.getElementById('promptInput');
        const sendBtn = document.getElementById('sendBtn');
        const loading = document.getElementById('loading');

        let streamingContainer = null;
        let completedFiles = [];

        function addMessage(content, isUser = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${isUser ? 'user-message' : 'assistant-message'}\`;
            messageDiv.innerHTML = content;
            chatArea.appendChild(messageDiv);
            chatArea.scrollTop = chatArea.scrollHeight;
        }

        function createStreamingContainer() {
            if (streamingContainer) {
                streamingContainer.remove();
            }

            // Clear the streaming content area
            streamingContent.innerHTML = '';

            streamingContainer = document.createElement('div');
            streamingContainer.innerHTML = \`
                <div class="streaming-container">
                    <div id="statusMessage" class="status-message">🔍 Initializing...</div>
                    <div id="currentFile" class="current-file" style="display: none;">
                        <div class="file-header">
                            <span id="fileIcon">📝</span>
                            <span id="fileName">Waiting...</span>
                        </div>
                        <div id="fileContent" class="file-content"></div>
                    </div>
                    <div id="completedFiles" class="completed-files" style="display: none;">
                        <h4>✅ Completed Files (<span id="completedCount">0</span>)</h4>
                        <div id="completedFilesList"></div>
                    </div>
                </div>
            \`;
            streamingContent.appendChild(streamingContainer);
        }

        function updateStatus(message) {
            const statusElement = document.getElementById('statusMessage');
            if (statusElement) {
                statusElement.textContent = message;
            }
        }

        function addClaudeMessage(message) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message claude-message';
            messageDiv.innerHTML = \`<strong>IGOR:</strong> \${escapeHtml(message)}\`;
            chatArea.appendChild(messageDiv);
            chatArea.scrollTop = chatArea.scrollHeight;
        }

        function addSystemPrompt(prompt) {
            const systemPromptDiv = document.createElement('div');
            systemPromptDiv.className = 'message assistant-message';

            const promptId = 'system-prompt-' + Date.now();

            systemPromptDiv.innerHTML = \`
                <strong>IGOR:</strong> System prompt prepared
                <div class="system-prompt-container">
                    <div class="system-prompt-header" onclick="toggleSystemPrompt('\${promptId}')">
                        <div class="system-prompt-title">
                            <span>📋</span>
                            <span>System Prompt</span>
                        </div>
                        <span class="system-prompt-toggle" id="toggle-\${promptId}">▶</span>
                    </div>
                    <div class="system-prompt-content" id="content-\${promptId}">
                        <pre class="system-prompt-text">\${escapeHtml(prompt)}</pre>
                    </div>
                </div>
            \`;

            chatArea.appendChild(systemPromptDiv);
            chatArea.scrollTop = chatArea.scrollHeight;
        }

        function toggleSystemPrompt(promptId) {
            const contentElement = document.getElementById('content-' + promptId);
            const toggleElement = document.getElementById('toggle-' + promptId);

            if (contentElement && toggleElement) {
                const isExpanded = contentElement.classList.contains('expanded');

                if (isExpanded) {
                    contentElement.classList.remove('expanded');
                    toggleElement.classList.remove('expanded');
                    toggleElement.textContent = '▶';
                } else {
                    contentElement.classList.add('expanded');
                    toggleElement.classList.add('expanded');
                    toggleElement.textContent = '▼';
                }
            }
        }

        // Make toggleSystemPrompt globally accessible
        window.toggleSystemPrompt = toggleSystemPrompt;

        function showCurrentFile(path, icon = '📝') {
            const currentFileDiv = document.getElementById('currentFile');
            const fileIcon = document.getElementById('fileIcon');
            const fileName = document.getElementById('fileName');
            const fileContent = document.getElementById('fileContent');

            if (currentFileDiv && fileName && fileContent) {
                currentFileDiv.style.display = 'block';
                if (fileIcon) fileIcon.textContent = icon;
                fileName.textContent = path;
                fileContent.textContent = '';
            }
        }

        function updateFileContent(content) {
            const fileContent = document.getElementById('fileContent');
            if (fileContent) {
                fileContent.textContent = content;
                // Auto-scroll to bottom of content
                fileContent.scrollTop = fileContent.scrollHeight;
            }
        }

                function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function addCompletedFile(path, content) {
            const fileId = 'file_' + completedFiles.length;
            completedFiles.push({ path, content, id: fileId });

            const completedDiv = document.getElementById('completedFiles');
            const completedList = document.getElementById('completedFilesList');
            const completedCount = document.getElementById('completedCount');

            if (completedDiv && completedList && completedCount) {
                completedDiv.style.display = 'block';
                completedCount.textContent = completedFiles.length;

                // Create collapsible file element
                const fileElement = document.createElement('div');
                fileElement.className = 'completed-file-item';

                // Create the header
                const headerDiv = document.createElement('div');
                headerDiv.className = 'completed-file-header';
                headerDiv.onclick = () => toggleFileContent(fileId);

                const infoDiv = document.createElement('div');
                infoDiv.className = 'completed-file-info';

                const checkSpan = document.createElement('span');
                checkSpan.textContent = '✅';

                const pathSpan = document.createElement('span');
                pathSpan.className = 'completed-file-path';
                pathSpan.textContent = path;

                infoDiv.appendChild(checkSpan);
                infoDiv.appendChild(pathSpan);

                const toggleSpan = document.createElement('span');
                toggleSpan.className = 'completed-file-toggle';
                toggleSpan.id = 'toggle_' + fileId;
                toggleSpan.textContent = '▶';

                headerDiv.appendChild(infoDiv);
                headerDiv.appendChild(toggleSpan);

                // Create the content container
                const contentDiv = document.createElement('div');
                contentDiv.className = 'completed-file-content';
                contentDiv.id = 'content_' + fileId;

                const codeElement = document.createElement('pre');
                codeElement.className = 'completed-file-code';
                codeElement.textContent = content; // Use textContent to preserve plain text

                contentDiv.appendChild(codeElement);
                fileElement.appendChild(headerDiv);
                fileElement.appendChild(contentDiv);

                completedList.appendChild(fileElement);
            }
        }

        function toggleFileContent(fileId) {
            const contentElement = document.getElementById('content_' + fileId);
            const toggleElement = document.getElementById('toggle_' + fileId);

            if (contentElement && toggleElement) {
                const isExpanded = contentElement.classList.contains('expanded');

                if (isExpanded) {
                    contentElement.classList.remove('expanded');
                    toggleElement.classList.remove('expanded');
                    toggleElement.textContent = '▶';
                } else {
                    contentElement.classList.add('expanded');
                    toggleElement.classList.add('expanded');
                    toggleElement.textContent = '▼';
                }
            }
        }

        // Make toggleFileContent globally accessible
        window.toggleFileContent = toggleFileContent;

        function formatFileResults(fileResults) {
            if (!fileResults) return '';

            let html = '<div class="file-results">';
            html += \`<strong>📁 Files processed: \${fileResults.totalFiles}</strong>\`;

            if (fileResults.filesWritten && fileResults.filesWritten.length > 0) {
                html += '<br><strong>✅ Files written:</strong>';
                html += '<ul class="file-list">';
                fileResults.filesWritten.forEach(file => {
                    html += \`<li>• \${file}</li>\`;
                });
                html += '</ul>';
            }

            if (fileResults.errors && fileResults.errors.length > 0) {
                html += '<br><strong>❌ Errors:</strong>';
                html += '<ul class="error-list">';
                fileResults.errors.forEach(error => {
                    html += \`<li>• \${error}</li>\`;
                });
                html += '</ul>';
            }

            html += '</div>';
            return html;
        }

        function handleStreaming(prompt) {
            createStreamingContainer();
            completedFiles = [];



            // Clear the completed files list from previous generations
            const completedList = document.getElementById('completedFilesList');
            if (completedList) {
                completedList.innerHTML = '';
            }

            const eventSource = new EventSource(\`?prompt=\${encodeURIComponent(prompt)}\`);

            eventSource.addEventListener('status', (e) => {
                const data = JSON.parse(e.data);
                updateStatus(data.message);
            });

            eventSource.addEventListener('system_prompt', (e) => {
                const data = JSON.parse(e.data);
                addSystemPrompt(data.prompt);
            });

            eventSource.addEventListener('claude_message', (e) => {
                const data = JSON.parse(e.data);
                addClaudeMessage(data.message);
            });

            eventSource.addEventListener('file_start', (e) => {
                const data = JSON.parse(e.data);
                showCurrentFile(data.path, '📝');
                updateStatus(data.message);
            });

            eventSource.addEventListener('file_streaming', (e) => {
                const data = JSON.parse(e.data);
                updateFileContent(data.content);
                updateStatus(\`🔄 Streaming: \${data.path}...\`);
            });

            eventSource.addEventListener('file_complete', (e) => {
                const data = JSON.parse(e.data);
                addCompletedFile(data.path, data.content);
                updateStatus(data.message);

                // Reset current file display for next file
                const currentFileDiv = document.getElementById('currentFile');
                const fileName = document.getElementById('fileName');
                const fileContent = document.getElementById('fileContent');
                if (currentFileDiv && fileName && fileContent) {
                    fileName.textContent = 'Ready for next file...';
                    fileContent.textContent = '';
                    // Keep it visible but ready for next file
                }
            });

            eventSource.addEventListener('file_error', (e) => {
                const data = JSON.parse(e.data);
                updateStatus(data.message);

                // Reset current file display on error
                const currentFileDiv = document.getElementById('currentFile');
                if (currentFileDiv) {
                    currentFileDiv.style.display = 'none';
                }
            });

            eventSource.addEventListener('complete', (e) => {
                const data = JSON.parse(e.data);
                updateStatus(data.message);
                eventSource.close();

                // Hide current file display when all done
                const currentFileDiv = document.getElementById('currentFile');
                if (currentFileDiv) {
                    currentFileDiv.style.display = 'none';
                }

                // Re-enable form
                sendBtn.disabled = false;
                loading.style.display = 'none';
                promptInput.focus();
            });

            eventSource.addEventListener('error', (e) => {
                const data = JSON.parse(e.data);
                updateStatus(data.message);
                eventSource.close();

                // Re-enable form
                sendBtn.disabled = false;
                loading.style.display = 'none';
                promptInput.focus();
            });

            eventSource.onerror = (error) => {
                console.error('EventSource failed:', error);
                updateStatus('❌ Connection lost. Please try again.');
                eventSource.close();

                // Re-enable form
                sendBtn.disabled = false;
                loading.style.display = 'none';
                promptInput.focus();
            };
        }

        promptForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const prompt = promptInput.value.trim();
            if (!prompt) return;

            // Add user message
            addMessage(\`<strong>You:</strong> \${prompt}\`, true);

            // Clear input and show loading
            promptInput.value = '';
            sendBtn.disabled = true;
            loading.style.display = 'block';

            // Add initial message to chat
            addMessage(\`<strong>IGOR:</strong> 🚀 Starting file generation for your request. Check the right panel for real-time progress!\`);

            // Use streaming by default
            handleStreaming(prompt);
        });

        // Focus input on load
        promptInput.focus();
    </script>
</body>
</html>
  `;
};

export const GET: APIRoute = async ({ url }) => {
  const startTime = Date.now();
  console.log('🌟 === IGOR\'s Backdoor Activated (AI SDK Version) ===');

  try {
    // Check if UI mode is requested
    const uiMode = url.searchParams.get('ui') === 'true';
    if (uiMode) {
      console.log('🎨 Returning chat UI interface');
      return new Response(getChatUI(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }

        const prompt = url.searchParams.get('prompt');
    console.log('📝 Received prompt:', prompt);

    if (!prompt) {
      console.log('❌ No prompt provided');
      return new Response(JSON.stringify({
        error: 'Missing prompt parameter',
        usage: 'Add ?prompt=your-question-here to the URL',
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Always use streaming response with Server-Sent Events
    console.log('🚀 Starting streaming response...');

    const readable = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (event: string, data: any) => {
          const eventData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(eventData));
        };

        // Start the streaming prompt processing
        completePromptWithStreaming(prompt, sendEvent)
          .then((result) => {
            // Send final completion event
            sendEvent('done', {
              message: '🎉 All done!',
              duration: Date.now() - startTime,
              timestamp: new Date().toISOString()
            });
            controller.close();
          })
          .catch((error) => {
            sendEvent('error', {
              message: `❌ Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            });
            controller.close();
          });
      }
    });

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('💥 ERROR in Igor\'s backdoor after', duration, 'ms:', error);

    let errorDetails = 'Unknown error';
    let statusCode = 500;

    if (error instanceof Error) {
      errorDetails = error.message;
      console.error('Error stack:', error.stack);

      // Handle specific error types
      if (error.message.includes('ENOENT')) {
        errorDetails = 'Auth file not found';
        statusCode = 500;
      } else if (error.message.includes('JSON')) {
        errorDetails = 'Invalid JSON in auth file';
        statusCode = 500;
      } else if (error.message.includes('Network') || error.message.includes('fetch')) {
        errorDetails = 'Network error connecting to AI gateway';
        statusCode = 502;
      }
    }

    return new Response(JSON.stringify({
      error: 'Igor\'s backdoor failed',
      details: errorDetails,
      timestamp: new Date().toISOString(),
      duration: duration,
      debugInfo: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        platform: process.platform
      }
    }), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
