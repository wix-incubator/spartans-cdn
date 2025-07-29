import type { APIRoute } from 'astro';
import { readdirSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

// Global state store for polling
interface GenerationState {
  status: 'running' | 'completed' | 'error';
  events: Array<{type: string, data: any, timestamp: number}>;
  error?: string;
  startTime: number;
}

const generationStates = new Map<string, GenerationState>();

// Clean up old generations (older than 10 minutes)
setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [id, state] of generationStates.entries()) {
    if (state.startTime < tenMinutesAgo) {
      generationStates.delete(id);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

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

  // Helper method to emit both console log and client log
  private log(level: 'info' | 'debug' | 'warn' | 'error', message: string, data?: any) {
    console.log(`${level.toUpperCase()}: ${message}`, data || '');
    this.eventEmitter('log', {
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined,
      timestamp: new Date().toISOString()
    });
  }

  processChunk(chunk: string): { filesWritten: string[]; errors: string[]; totalFiles: number } {
    this.buffer += chunk;

    // Debug: Log chunk to see what we're receiving
    this.log('debug', `[DOWNLOAD] Received chunk (${chunk.length} chars): ${chunk.substring(0, 100)}${chunk.length > 100 ? '...' : ''}`);

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
    // Debug: Check if buffer contains message tags
    const hasOpenTag = this.buffer.includes('<message>');
    const hasCloseTag = this.buffer.includes('</message>');

    if (hasOpenTag || hasCloseTag) {
      this.log('debug', `[SEARCH] Buffer contains message tags - Open: ${hasOpenTag}, Close: ${hasCloseTag}`);
      this.log('debug', `[FILE_TEXT] Current buffer (first 200 chars): ${this.buffer.substring(0, 200)}...`);
    }

    // Look for complete message tags first
    const messageRegex = /<message>([\s\S]*?)<\/message>/g;
    let messageMatch;
    let found = false;

    while ((messageMatch = messageRegex.exec(this.buffer)) !== null) {
      const [fullMatch, messageContent] = messageMatch;
      const trimmedMessage = messageContent.trim();

      this.log('info', `[TARGET] Found complete message tag! Content: "${trimmedMessage}"`);

      if (trimmedMessage) {
        // Emit message event
        this.eventEmitter('claude_message', {
          message: trimmedMessage,
          timestamp: new Date().toISOString()
        });

        this.log('info', `[MESSAGE_CIRCLE] Emitted Claude message: ${trimmedMessage}`);
        found = true;
      }
    }

    // Remove all processed complete messages from buffer
    if (found) {
      this.buffer = this.buffer.replace(/<message>[\s\S]*?<\/message>/g, '');
      this.log('debug', `[TRASH_2] Removed processed complete messages from buffer`);
    }

    // Also check for streaming message content (incomplete messages)
    if (!found && hasOpenTag && !hasCloseTag) {
      const openMatch = this.buffer.match(/<message>([\s\S]*?)$/);
      if (openMatch) {
        const partialContent = openMatch[1].trim();
        if (partialContent && partialContent.length > 10) { // Only emit if substantial content
          this.log('debug', `[REFRESH_CW] Found streaming message content: "${partialContent.substring(0, 50)}..."`);

          // Emit streaming message event
          this.eventEmitter('claude_message_streaming', {
            message: partialContent,
            isPartial: true,
            timestamp: new Date().toISOString()
          });
        }
      }
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

        this.log('info', `📝 Starting to generate file: ${this.currentFilePath}`);

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
          this.log('info', `✅ Successfully completed file: ${this.currentFilePath}`);

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
          this.log('error', `❌ File write error: ${errorMsg}`);

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

    this.log('info', `✍️ Writing file: ${fullPath}`);

    // Create directory if it doesn't exist
    const dir = dirname(fullPath);
    mkdirSync(dir, { recursive: true });

    // Write the file
    writeFileSync(fullPath, content, 'utf8');
    this.writtenFiles.push(fullPath);
    this.log('info', `✅ Successfully wrote: ${fullPath}`);
  }

  finalize(): { filesWritten: string[]; errors: string[]; totalFiles: number } {
    this.log('info', '🔄 Finalizing parsing process...');

    // Process any remaining messages in the buffer
    this.parseMessages();

    // Handle any remaining file in progress
    if (this.isInFile && this.currentFileBuffer) {
      try {
        this.writeFile(this.currentFilePath, this.currentFileBuffer);
        this.log('info', `✅ Finalized remaining file: ${this.currentFilePath}`);
        this.eventEmitter('file_complete', {
          path: this.currentFilePath,
          content: this.currentFileBuffer,
          message: `✅ Completed (final): ${this.currentFilePath}`
        });
      } catch (error) {
        const errorMsg = `Failed to write ${this.currentFilePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.errors.push(errorMsg);
        this.log('error', `❌ Final file write error: ${errorMsg}`);
        this.eventEmitter('file_error', {
          path: this.currentFilePath,
          error: errorMsg,
          message: `❌ Error: ${errorMsg}`
        });
      }
    }

    const result = {
      filesWritten: this.writtenFiles,
      errors: this.errors,
      totalFiles: this.writtenFiles.length
    };

    this.log('info', `🎉 Parsing complete - ${result.totalFiles} files written, ${result.errors.length} errors`);
    return result;
  }
}

const completePromptWithStreaming = async (prompt: string, generationId: string) => {
  // Initialize generation state
  generationStates.set(generationId, {
    status: 'running',
    events: [],
    startTime: Date.now()
  });

  const eventEmitter = (event: string, data: any) => {
    const state = generationStates.get(generationId);
    if (state) {
      state.events.push({
        type: event,
        data,
        timestamp: Date.now()
      });
    }
  };
  // Helper method to emit both console log and client log
  const log = (level: 'info' | 'debug' | 'warn' | 'error', message: string, data?: any) => {
    console.log(`${level.toUpperCase()}: ${message}`, data || '');
    eventEmitter('log', {
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined,
      timestamp: new Date().toISOString()
    });
  };

  try {
    log('info', '🚀 Starting Claude streaming request', { promptLength: prompt.length });

    eventEmitter('status', { message: '🔍 Preparing request...' });

    const importantFiles = [
      'src/tailwind.config.mjs',
    ]

    // Recursive function to read all files and directories
    const readDirectoryRecursive = (dirPath: string, basePath: string = ''): string[] => {
      const results: string[] = [];

      try {
        const items = readdirSync(dirPath);

        for (const item of items) {
          const fullPath = join(dirPath, item);
          const relativePath = basePath ? join(basePath, item) : item;

          try {
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
              // Recursively read subdirectories
              results.push(...readDirectoryRecursive(fullPath, relativePath));
            } else if (stat.isFile()) {
              // Add file to results
              results.push(join(dirPath, item));
            }
          } catch (error) {
            console.warn(`Warning: Could not access ${fullPath}:`, error);
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not read directory ${dirPath}:`, error);
      }

      return results;
    };

    const componentsPath = 'src/components';
    const allComponentFiles = readDirectoryRecursive(componentsPath);

    // Separate UI components (read-only) from other components
    const uiComponents: string[] = [];
    const editableComponents: string[] = [];

    allComponentFiles.forEach(filePath => {
      if (filePath.includes('/ui/') || filePath.includes('\\ui\\')) {
        uiComponents.push(filePath);
      } else {
        editableComponents.push(filePath);
      }
    });

    log('info', `📁 Found ${allComponentFiles.length} component files total`);
    log('info', `🎨 UI components (read-only): ${uiComponents.length}`);
    log('info', `✏️ Editable components: ${editableComponents.length}`);

    // Create UI components string (read-only, no content)
    const components = uiComponents.map(filePath => {
      const relativePath = filePath.replace(/\\/g, '/'); // Normalize path separators
      return `<file path="${relativePath}" readOnly="true" />`;
    }).join('\n');

    // Create editable components string (with full content)
    const nonUiComponents = editableComponents.map(filePath => {
      const relativePath = filePath.replace(/\\/g, '/'); // Normalize path separators
      try {
        const content = readFileSync(filePath, 'utf8');
        return `
          <file path="${relativePath}">
            ${content}
          </file>
        `;
      } catch (error) {
        console.warn(`Warning: Could not read file ${filePath}:`, error);
        return `<file path="${relativePath}" error="Could not read file" />`;
      }
    }).join('\n\n---\n\n');

    const files = importantFiles.map(file => {
      try {
        const content = readFileSync(file, 'utf8');
        return `
        <file path="${file}">
          ${content}
        </file>
      `;
      } catch (error) {
        console.warn(`Warning: Could not read file ${file}:`, error);
        return `<file path="${file}" error="Could not read file" />`;
      }
    }).join('\n\n---\n\n');

    const systemPrompt = `
You are the best programmer of a project written over Astro with React router and React components.

The user will give you a prompt and you must change the files in the project to achieve the user's goal.

These are UI components that you can use but not change:

${components}

Components you can edit or add to:

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

message content output should be markdown.

Your output format with files and messages must be the following and nothing more:

<message>
  markdown message content
</message>
<file path="src/the/path/to/the/file">
  the new file content
</file>
<file path="src/the/path/to/the/file">
  the new file content
</file>
<message>
  another markdown message to the user ...
</message>
<file path="src/the/path/to/the/file">
  the new file content
</file>

all files must be in the src folder

you may add new files.

if you fail to write the best code possible, you and I will be fired.

make sure you integrate all the components so that the solution is complete and working.

`;

    log('info', '📋 System prompt prepared', { systemPromptLength: systemPrompt.length });

    // Send system prompt to client
    eventEmitter('system_prompt', {
      prompt: systemPrompt,
      message: '📋 System prompt prepared'
    });

    eventEmitter('status', { message: '🤖 Starting Claude request...' });
    log('info', '🤖 Initiating Claude API request...');

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
    log('info', '📡 Starting to receive streaming response...');

    // Process the stream
    let chunkCount = 0;
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      chunkCount++;
      parser.processChunk(chunk);

      // Log every 50 chunks to avoid spam
      if (chunkCount % 50 === 0) {
        log('debug', `📊 Processed ${chunkCount} chunks, total response length: ${fullResponse.length}`);
      }
    }

    log('info', `📊 Stream complete - processed ${chunkCount} chunks, total response length: ${fullResponse.length}`);

    // Finalize parsing
    const finalResult = parser.finalize();

    eventEmitter('complete', {
      message: `✅ Generation complete! ${finalResult.totalFiles} files written.`,
      filesWritten: finalResult.filesWritten,
      errors: finalResult.errors,
      totalFiles: finalResult.totalFiles
    });

    log('info', '✅ Streaming completed successfully');

    // Mark generation as completed
    const state = generationStates.get(generationId);
    if (state) {
      state.status = 'completed';
    }

    return finalResult;
  } catch (error) {
    log('error', '💥 Error in completePrompt', { error: error instanceof Error ? error.message : 'Unknown error' });
    eventEmitter('error', {
      message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    // Mark generation as failed
    const state = generationStates.get(generationId);
    if (state) {
      state.status = 'error';
      state.error = error instanceof Error ? error.message : 'Unknown error';
    }

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
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            height: 100vh;
            margin: 0;
            padding: 0;
            color: #e6edf3;
            overflow: hidden;
        }

        .main-container {
            display: flex;
            height: 100vh;
            overflow: hidden;
        }

        .chat-container {
            background: #161b22;
            width: 450px;
            min-width: 400px;
            height: 100vh;
            display: flex;
            flex-direction: column;
            border-right: 1px solid #21262d;
        }

        .streaming-panel {
            background: #0d1117;
            flex: 1;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .streaming-panel-header {
            background: #21262d;
            color: #e6edf3;
            padding: 14px 16px;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 48px;
            box-sizing: border-box;
        }

        .streaming-panel-header .header-info {
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 2px;
        }

        .streaming-panel-header h2 {
            font-size: 13px;
            font-weight: 500;
            margin: 0;
            color: #f0f6fc;
        }

        .streaming-panel-header .subtitle {
            opacity: 0.6;
            font-size: 11px;
            margin: 0;
            color: #8b949e;
        }

        .streaming-content {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            background: #0d1117;
            /* Account for the input area height in chat panel */
            height: calc(100vh - 48px - 80px);
        }

        .header {
            background: #21262d;
            color: #e6edf3;
            padding: 14px 16px;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 48px;
            box-sizing: border-box;
        }

        .header .header-info {
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 2px;
        }

        .header h1 {
            font-size: 13px;
            font-weight: 500;
            margin: 0;
            color: #f0f6fc;
        }

        .header .subtitle {
            opacity: 0.6;
            font-size: 11px;
            margin: 0;
            color: #8b949e;
        }

        .header-status {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #238636;
        }

        .status-text {
            font-size: 11px;
            color: #7d8590;
            font-weight: 500;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .file-count {
            font-size: 11px;
            color: #7d8590;
            padding: 2px 8px;
            background: #21262d;
            border-radius: 12px;
            border: 1px solid #30363d;
        }

        .chat-area {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            background: #161b22;
        }

        .input-area {
            padding: 16px;
            background: #21262d;
            border-top: 1px solid #30363d;
            min-height: 80px;
            box-sizing: border-box;
        }

        .input-form {
            display: flex;
            gap: 12px;
            align-items: center;
        }

        .prompt-input {
            flex: 1;
            padding: 10px 12px;
            border: 1px solid #30363d;
            border-radius: 6px;
            font-size: 13px;
            background: #0d1117;
            color: #e6edf3;
            outline: none;
            transition: all 0.2s;
            font-family: inherit;
        }

        .prompt-input:focus {
            border-color: #58a6ff;
            box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.12);
        }

        .prompt-input::placeholder {
            color: #7d8590;
        }

        .send-btn {
            padding: 10px 16px;
            background: #238636;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 13px;
            font-family: inherit;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .send-btn:hover:not(:disabled) {
            background: #2ea043;
            transform: translateY(-1px);
        }

        .send-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            background: #238636;
            transform: none;
        }

        .message {
            margin-bottom: 16px;
            padding: 12px 16px;
            border-radius: 6px;
            max-width: 90%;
            font-size: 13px;
            line-height: 1.5;
            border: 1px solid #30363d;
        }

        .user-message {
            background: #0d2818;
            color: #e6edf3;
            margin-left: auto;
            border-color: #238636;
        }

        .assistant-message {
            background: #21262d;
            color: #e6edf3;
            border-color: #30363d;
        }

        .claude-message {
            background: #1c2128;
            border: 1px solid #373e47;
            color: #e6edf3;
            margin: 16px 0;
            position: relative;
            border-left: 3px solid #58a6ff;
        }

        .streaming-message {
            border-left: 3px solid #f0883e !important;
            opacity: 0.9;
        }

        .streaming-message .message-content {
            position: relative;
        }

        .streaming-message .message-content::after {
            content: '▋';
            color: #f0883e;
            animation: blink 1s infinite;
            margin-left: 2px;
        }

        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
            font-weight: 500;
            font-size: 12px;
            color: #f0f6fc;
        }

        /* Lucide icon alignment */
        .message-header svg,
        .message-time svg,
        .file-header svg,
        .status-message svg,
        .logs-title svg,
        .logs-toggle svg,
        .completed-file-toggle svg,
        .send-btn svg {
            width: 14px;
            height: 14px;
            vertical-align: middle;
        }

        .message-header span {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .message-time {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .file-header {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-message {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .logs-title {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .logs-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
        }

        .completed-file-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
        }

        .send-btn {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .message-content {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            line-height: 1.5;
        }

        /* Markdown content styling */
        .message-content h1, .message-content h2, .message-content h3,
        .message-content h4, .message-content h5, .message-content h6 {
            color: #f0f6fc;
            margin: 16px 0 8px 0;
            font-weight: 600;
        }

        .message-content h1 { font-size: 18px; }
        .message-content h2 { font-size: 16px; }
        .message-content h3 { font-size: 14px; }
        .message-content h4 { font-size: 13px; }

        .message-content p {
            margin: 8px 0;
            color: #e6edf3;
        }

        .message-content ul, .message-content ol {
            margin: 8px 0;
            padding-left: 20px;
            color: #e6edf3;
        }

        .message-content li {
            margin: 4px 0;
        }

        .message-content code {
            background: #161b22;
            color: #f0883e;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
        }

        .message-content pre {
            background: #161b22;
            color: #e6edf3;
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;
            border: 1px solid #30363d;
        }

        .message-content pre code {
            background: none;
            color: #e6edf3;
            padding: 0;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
        }

        .message-content blockquote {
            border-left: 3px solid #58a6ff;
            padding-left: 12px;
            margin: 8px 0;
            color: #8b949e;
            font-style: italic;
        }

        .message-content a {
            color: #58a6ff;
            text-decoration: none;
        }

        .message-content a:hover {
            text-decoration: underline;
        }

        .message-content strong {
            color: #f0f6fc;
            font-weight: 600;
        }

        .message-content em {
            color: #f0f6fc;
            font-style: italic;
        }

        .message-content hr {
            border: none;
            border-top: 1px solid #30363d;
            margin: 16px 0;
        }

        .message-content table {
            border-collapse: collapse;
            margin: 8px 0;
            width: 100%;
        }

        .message-content th, .message-content td {
            border: 1px solid #30363d;
            padding: 6px 8px;
            text-align: left;
        }

        .message-content th {
            background: #21262d;
            color: #f0f6fc;
            font-weight: 600;
        }

        .message-time {
            font-size: 10px;
            color: #7d8590;
            opacity: 0.8;
            margin-left: auto;
        }

        .system-technical-message {
            margin: 8px 0;
            padding: 4px 0;
            text-align: center;
            font-size: 11px;
            color: #7d8590;
            opacity: 0.7;
            font-family: 'JetBrains Mono', monospace;
            transition: opacity 0.2s;
        }

        .system-technical-message:hover {
            opacity: 1;
        }

        .technical-time {
            margin-right: 8px;
            color: #6e7681;
        }

        .technical-text {
            color: #7d8590;
        }

        .system-prompt-container {
            margin: 8px 0;
            border: 1px solid #30363d;
            border-radius: 6px;
            overflow: hidden;
            background: #21262d;
            width: 100%;
            box-sizing: border-box;
        }

        .system-prompt-content {
            background: #0d1117;
            max-height: 400px;
            overflow-y: auto;
            width: 100%;
        }

        .system-prompt-text {
            padding: 12px;
            background: #0d1117;
            color: #7d8590;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 10px;
            line-height: 1.4;
            white-space: pre-wrap;
            margin: 0;
            border: none;
            width: 100%;
            box-sizing: border-box;
            display: block;
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
            margin: 0 0 16px 0;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            font-family: inherit;
            overflow: hidden;
        }

        .current-file {
            background: #21262d;
            color: #e6edf3;
            border-bottom: 1px solid #30363d;
        }

        .file-header {
            color: #f0f6fc;
            font-weight: 500;
            padding: 12px 16px;
            background: #30363d;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            border-bottom: 1px solid #21262d;
        }

        .file-content {
            background: #0d1117;
            color: #e6edf3;
            padding: 16px;
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
            font-size: 12px;
            line-height: 1.4;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
        }

        .status-message {
            padding: 8px 16px;
            background: #21262d;
            border-bottom: 1px solid #30363d;
            color: #58a6ff;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .completed-files {
            margin: 0 0 16px 0;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            overflow: hidden;
        }

        .completed-files h4 {
            color: #f0f6fc;
            margin: 0;
            padding: 12px 16px;
            font-size: 12px;
            font-weight: 500;
            background: #21262d;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .completed-file-item {
            border-bottom: 1px solid #30363d;
            background: #161b22;
        }

        .completed-file-item:last-child {
            border-bottom: none;
        }

        .completed-file-header {
            padding: 12px 16px;
            background: #161b22;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background-color 0.2s;
        }

        .completed-file-header:hover {
            background: #21262d;
        }

        .completed-file-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .completed-file-path {
            color: #58a6ff;
            font-weight: 500;
            font-size: 12px;
            font-family: 'JetBrains Mono', monospace;
        }

        .completed-file-toggle {
            color: #7d8590;
            font-size: 12px;
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
            max-height: 500px;
            overflow-y: auto;
        }

        .completed-file-code {
            background: #0d1117;
            color: #e6edf3;
            padding: 16px;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
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

        .logs-container {
            margin: 16px 0;
            border: 1px solid #30363d;
            border-radius: 6px;
            overflow: hidden;
            background: #21262d;
        }

        .logs-header {
            padding: 10px 12px;
            background: #21262d;
            border-bottom: 1px solid #30363d;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background-color 0.2s;
        }

        .logs-header:hover {
            background: #30363d;
        }

        .logs-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
            color: #e6edf3;
            font-size: 13px;
        }

        .log-count {
            color: #7d8590;
            font-size: 11px;
            font-weight: normal;
        }

        .logs-toggle {
            color: #7d8590;
            font-size: 12px;
            font-weight: bold;
            transition: transform 0.2s;
        }

        .logs-toggle.expanded {
            transform: rotate(90deg);
        }

        .logs-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }

        .logs-content.expanded {
            max-height: 400px;
            overflow-y: auto;
        }

        .logs-list {
            background: #0d1117;
            max-height: 400px;
            overflow-y: auto;
        }

        .log-entry {
            padding: 8px 12px;
            border-bottom: 1px solid #30363d;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 11px;
            line-height: 1.4;
            word-break: break-word;
        }

        .log-entry:last-child {
            border-bottom: none;
        }

        .log-entry.log-info {
            color: #58a6ff;
        }

        .log-entry.log-debug {
            color: #7d8590;
        }

        .log-entry.log-warn {
            color: #f0883e;
        }

        .log-entry.log-error {
            color: #f85149;
        }

        .log-timestamp {
            color: #7d8590;
            font-size: 10px;
            margin-right: 8px;
        }

        .log-message {
            white-space: pre-wrap;
        }

        .log-data {
            margin-top: 4px;
            padding: 4px 8px;
            background: #161b22;
            border-left: 2px solid #30363d;
            font-size: 10px;
            color: #8b949e;
            white-space: pre-wrap;
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
                <div class="header-info">
                    <h1>IGOR Code Generator</h1>
                    <span class="subtitle">AI-powered file generation and code editing</span>
                </div>
                <div class="header-status">
                    <span class="status-dot"></span>
                    <span class="status-text">Ready</span>
                </div>
            </div>

            <div class="chat-area" id="chatArea">
                <div class="assistant-message message">
                    <div class="message-header">
                        <span><i data-lucide="bot"></i> IGOR</span>
                        <span class="message-time"><i data-lucide="check-circle"></i> Ready</span>
                    </div>
                    <div class="message-content">Code generator ready. Describe the components, pages, or features you want to create and I'll generate the implementation files automatically.</div>
                </div>
            </div>

            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p>Generating code and writing files...</p>
            </div>

            <div class="input-area">
                <form class="input-form" id="promptForm">
                    <input
                        type="text"
                        class="prompt-input"
                        id="promptInput"
                        placeholder="Describe components, pages, or features to generate..."
                        autocomplete="off"
                        required
                    >
                    <button type="submit" class="send-btn" id="sendBtn">
                        <i data-lucide="send"></i>
                        <span>Generate</span>
                    </button>
                </form>
            </div>
        </div>

        <div class="streaming-panel">
            <div class="streaming-panel-header">
                <div class="header-info">
                    <h2>Live Output</h2>
                    <span class="subtitle">Real-time code generation and file creation</span>
                </div>
                <div class="header-actions">
                    <span class="file-count">0 files</span>
                </div>
            </div>

            <div class="streaming-content" id="streamingContent">
                <div class="assistant-message message">
                    <div class="message-header">
                        <span><i data-lucide="settings"></i> System</span>
                        <span class="message-time"><i data-lucide="pause-circle"></i> Idle</span>
                    </div>
                    <div class="message-content">Awaiting generation request. Real-time output will appear here.</div>
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
        let logEntries = [];
        let activePollingTimeout = null;

        function addMessage(content, isUser = false, sender = 'IGOR') {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${isUser ? 'user-message' : 'assistant-message'}\`;

            const time = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });

            messageDiv.innerHTML = \`
                <div class="message-header">
                    <span>\${isUser ? 'You' : sender}</span>
                    <span class="message-time">\${time}</span>
                </div>
                <div class="message-content">\${content}</div>
            \`;

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
                            <div id="statusMessage" class="status-message">Initializing...</div>
                            <div id="currentFile" class="current-file" style="display: none;">
                                <div class="file-header">
                                    <span id="fileName">Waiting...</span>
                                </div>
                                <div id="fileContent" class="file-content"></div>
                            </div>
                            <div id="completedFiles" class="completed-files" style="display: none;">
                                <h4><i data-lucide="folder-check"></i> Completed Files (<span id="completedCount">0</span>)</h4>
                                <div id="completedFilesList"></div>
                            </div>
                            <!-- Logs Section -->
                            <div class="logs-container" id="logsContainer" style="display: none;">
                                <div class="logs-header" onclick="toggleLogs()">
                                    <div class="logs-title">
                                        <span><i data-lucide="activity"></i> System Logs</span>
                                        <span class="log-count" id="logCount">(0)</span>
                                    </div>
                                    <span class="logs-toggle" id="logsToggle"><i data-lucide="chevron-right"></i></span>
                                </div>
                                <div class="logs-content" id="logsContent">
                                    <div class="logs-list" id="logsList"></div>
                                </div>
                            </div>
                        </div>
                    \`;
                        streamingContent.appendChild(streamingContainer);

                        // Render Lucide icons
                        lucide.createIcons();
        }

        function updateStatus(message) {
            const statusElement = document.getElementById('statusMessage');
            if (statusElement) {
                statusElement.innerHTML = message;
            }
        }

        let currentStreamingMessage = null;

        function addClaudeMessage(message) {
            console.log('📝 Adding Claude message to chat:', message);

            // If there's a streaming message, replace it with the final message
            if (currentStreamingMessage) {
                currentStreamingMessage.remove();
                currentStreamingMessage = null;
            }

            const messageDiv = document.createElement('div');
            messageDiv.className = 'message claude-message';

            const time = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });

            // Configure marked for better security and GitHub-flavored markdown
            marked.setOptions({
                breaks: true,
                gfm: true
            });

            messageDiv.innerHTML = \`
                <div class="message-header">
                    <span>IGOR</span>
                    <span class="message-time">\${time}</span>
                </div>
                <div class="message-content">\${marked.parse(message)}</div>
            \`;

            chatArea.appendChild(messageDiv);
            chatArea.scrollTop = chatArea.scrollHeight;
            console.log('✅ Claude message added to DOM');
        }

        function addOrUpdateStreamingMessage(message, isPartial) {
            console.log('🔄 Adding/updating streaming message:', message.substring(0, 50) + '...');

            // Configure marked for better security and GitHub-flavored markdown
            marked.setOptions({
                breaks: true,
                gfm: true
            });

            if (!currentStreamingMessage) {
                // Create new streaming message
                currentStreamingMessage = document.createElement('div');
                currentStreamingMessage.className = 'message claude-message streaming-message';

                const time = new Date().toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });

                currentStreamingMessage.innerHTML = \`
                    <div class="message-header">
                        <span>IGOR</span>
                        <span class="message-time">\${time} \${isPartial ? '(streaming...)' : ''}</span>
                    </div>
                    <div class="message-content">\${marked.parse(message)}</div>
                \`;

                chatArea.appendChild(currentStreamingMessage);
            } else {
                // Update existing streaming message
                const contentDiv = currentStreamingMessage.querySelector('.message-content');
                const timeSpan = currentStreamingMessage.querySelector('.message-time');

                if (contentDiv) {
                    contentDiv.innerHTML = marked.parse(message);
                }
                if (timeSpan && isPartial) {
                    const time = new Date().toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    timeSpan.textContent = \`\${time} (streaming...)\`;
                }
            }

            chatArea.scrollTop = chatArea.scrollHeight;
        }

        function addSystemPrompt(prompt) {
            const promptId = 'prompt_' + Date.now();

            const systemPromptDiv = document.createElement('div');
            systemPromptDiv.className = 'system-technical-message';
            systemPromptDiv.style.cursor = 'pointer';
            systemPromptDiv.onclick = () => toggleSystemPrompt(promptId);

            const time = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });

            systemPromptDiv.innerHTML = \`
                <span class="technical-time">\${time}</span>
                <span class="technical-text">System prompt prepared (\${Math.round(prompt.length / 1000)}k chars) - click to expand</span>
            \`;

            const systemPromptContainer = document.createElement('div');
            systemPromptContainer.className = 'system-prompt-container';
            systemPromptContainer.style.display = 'none';
            systemPromptContainer.id = 'container_' + promptId;
            systemPromptContainer.setAttribute('data-visible', 'false');

            const contentDiv = document.createElement('div');
            contentDiv.className = 'system-prompt-content';
            contentDiv.id = 'content_' + promptId;

            const preElement = document.createElement('pre');
            preElement.className = 'system-prompt-text';
            preElement.textContent = prompt;

            contentDiv.appendChild(preElement);
            systemPromptContainer.appendChild(contentDiv);



            chatArea.appendChild(systemPromptDiv);
            chatArea.appendChild(systemPromptContainer);
            chatArea.scrollTop = chatArea.scrollHeight;
        }

                        function toggleSystemPrompt(promptId) {
            const containerElement = document.getElementById('container_' + promptId);

            if (containerElement) {
                // Check if it has a data attribute to track state instead of style.display
                const isVisible = containerElement.getAttribute('data-visible') === 'true';

                if (isVisible) {
                    containerElement.style.display = 'none';
                    containerElement.setAttribute('data-visible', 'false');
                } else {
                    containerElement.style.display = 'block';
                    containerElement.style.visibility = 'visible';
                    containerElement.style.opacity = '1';
                    containerElement.setAttribute('data-visible', 'true');

                    // Auto-scroll to show the expanded content
                    setTimeout(() => {
                        containerElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);
                }
            }
        }

        // Make toggleSystemPrompt globally accessible
        window.toggleSystemPrompt = toggleSystemPrompt;

                function addLogEntry(level, message, data, timestamp) {
            const logsList = document.getElementById('logsList');
            const logsContainer = document.getElementById('logsContainer');
            const logCount = document.getElementById('logCount');

            if (!logsList || !logsContainer || !logCount) return;

            // Show logs container
            logsContainer.style.display = 'block';

            // Create log entry
            const logEntry = document.createElement('div');
            logEntry.className = \`log-entry log-\${level}\`;

            const time = new Date(timestamp).toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            let logHtml = \`
                <span class="log-timestamp">\${time}</span>
                <span class="log-message">\${escapeHtml(message)}</span>
            \`;

            if (data) {
                logHtml += \`<div class="log-data">\${escapeHtml(data)}</div>\`;
            }

            logEntry.innerHTML = logHtml;
            logsList.appendChild(logEntry);

            // Keep only last 100 log entries
            const entries = logsList.children;
            while (entries.length > 100) {
                logsList.removeChild(entries[0]);
            }

            // Auto-scroll to bottom if expanded
            const logsContent = document.getElementById('logsContent');
            if (logsContent && logsContent.classList.contains('expanded')) {
                logsList.scrollTop = logsList.scrollHeight;
            }

            // Update log count
            logEntries.push({ level, message, data, timestamp });
            logCount.textContent = \`(\${logEntries.length})\`;
        }

        function toggleLogs() {
            const logsContent = document.getElementById('logsContent');
            const logsToggle = document.getElementById('logsToggle');

            if (logsContent && logsToggle) {
                const isExpanded = logsContent.classList.contains('expanded');

                if (isExpanded) {
                    logsContent.classList.remove('expanded');
                    logsToggle.classList.remove('expanded');
                    logsToggle.innerHTML = '<i data-lucide="chevron-right"></i>';
                } else {
                    logsContent.classList.add('expanded');
                    logsToggle.classList.add('expanded');
                    logsToggle.innerHTML = '<i data-lucide="chevron-down"></i>';

                    // Auto-scroll to bottom when opening
                    const logsList = document.getElementById('logsList');
                    if (logsList) {
                        setTimeout(() => {
                            logsList.scrollTop = logsList.scrollHeight;
                        }, 300); // Wait for animation to complete
                    }
                }

                // Re-render Lucide icons
                lucide.createIcons();
            }
        }

        // Make toggleLogs globally accessible
        window.toggleLogs = toggleLogs;

        function showCurrentFile(path) {
            const currentFileDiv = document.getElementById('currentFile');
            const fileName = document.getElementById('fileName');
            const fileContent = document.getElementById('fileContent');

            if (currentFileDiv && fileName && fileContent) {
                currentFileDiv.style.display = 'block';
                fileName.innerHTML = \`<i data-lucide="file-text"></i> \${path}\`;
                fileContent.textContent = '';
                // Re-render Lucide icons
                lucide.createIcons();
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
                checkSpan.innerHTML = '<i data-lucide="check-circle" style="color: #238636; width: 14px; height: 14px;"></i>';
                checkSpan.style.display = 'flex';
                checkSpan.style.alignItems = 'center';

                const pathSpan = document.createElement('span');
                pathSpan.className = 'completed-file-path';
                pathSpan.textContent = path;

                infoDiv.appendChild(checkSpan);
                infoDiv.appendChild(pathSpan);

                const toggleSpan = document.createElement('span');
                toggleSpan.className = 'completed-file-toggle';
                toggleSpan.id = 'toggle_' + fileId;
                toggleSpan.innerHTML = '<i data-lucide="chevron-right"></i>';

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

                // Re-render Lucide icons
                lucide.createIcons();
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
                    toggleElement.innerHTML = '<i data-lucide="chevron-right"></i>';
                } else {
                    contentElement.classList.add('expanded');
                    toggleElement.classList.add('expanded');
                    toggleElement.innerHTML = '<i data-lucide="chevron-down"></i>';
                }

                // Re-render Lucide icons
                lucide.createIcons();
            }
        }

        // Make toggleFileContent globally accessible
        window.toggleFileContent = toggleFileContent;

        function formatFileResults(fileResults) {
            if (!fileResults) return '';

            let html = '<div class="file-results">';
            html += \`<strong><i data-lucide="folder"></i> Files processed: \${fileResults.totalFiles}</strong>\`;

            if (fileResults.filesWritten && fileResults.filesWritten.length > 0) {
                html += '<br><strong><i data-lucide="check-circle"></i> Files written:</strong>';
                html += '<ul class="file-list">';
                fileResults.filesWritten.forEach(file => {
                    html += \`<li><i data-lucide="file"></i> \${file}</li>\`;
                });
                html += '</ul>';
            }

            if (fileResults.errors && fileResults.errors.length > 0) {
                html += '<br><strong><i data-lucide="x-circle"></i> Errors:</strong>';
                html += '<ul class="error-list">';
                fileResults.errors.forEach(error => {
                    html += \`<li><i data-lucide="alert-circle"></i> \${error}</li>\`;
                });
                html += '</ul>';
            }

            html += '</div>';
            return html;
        }

        function handleStreaming(prompt) {
            // Cancel any existing polling
            if (activePollingTimeout) {
                clearTimeout(activePollingTimeout);
                activePollingTimeout = null;
                console.log('Cancelled existing polling operation');
            }

            createStreamingContainer();
            completedFiles = [];
            logEntries = [];

            // Clear any existing streaming message
            if (currentStreamingMessage) {
                currentStreamingMessage.remove();
                currentStreamingMessage = null;
            }

            // Clear the completed files list from previous generations
            const completedList = document.getElementById('completedFilesList');
            if (completedList) {
                completedList.innerHTML = '';
            }

            // Clear and hide logs for new generation
            const logsList = document.getElementById('logsList');
            const logsContainer = document.getElementById('logsContainer');
            const logCount = document.getElementById('logCount');
            if (logsList) logsList.innerHTML = '';
            if (logsContainer) logsContainer.style.display = 'none';
            if (logCount) logCount.textContent = '(0)';

            // Start generation and get generation ID
            fetch(\`?prompt=\${encodeURIComponent(prompt)}\`)
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        updateStatus(\`<i data-lucide="x-circle"></i> Error: \${data.error}\`);
                        sendBtn.disabled = false;
                        loading.style.display = 'none';
                        return;
                    }

                    const generationId = data.generationId;
                    let processedEventCount = 0;
                    let retryCount = 0;
                    let pollInterval = 200; // Start with 1 second
                    const maxRetries = 10;
                    const maxPollInterval = 5000; // Max 5 seconds between polls
                    const startTime = Date.now();
                    const maxGenerationTime = 10 * 60 * 1000; // 10 minutes max

                    // Poll for updates with exponential backoff
                    const poll = () => {
                        // Check if we've exceeded maximum generation time
                        if (Date.now() - startTime > maxGenerationTime) {
                            console.log('Generation timeout reached');
                            activePollingTimeout = null; // Clear the reference
                            updateStatus('<i data-lucide="clock"></i> Generation timeout. Please try again.');
                            sendBtn.disabled = false;
                            loading.style.display = 'none';
                            promptInput.focus();
                            return;
                        }

                        fetch(\`?poll=\${generationId}\`)
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
                                }
                                return response.json();
                            })
                            .then(pollData => {
                                // Reset retry count on successful response
                                retryCount = 0;
                                pollInterval = 1000; // Reset to 1 second on success

                                if (pollData.error) {
                                    activePollingTimeout = null; // Clear the reference
                                    updateStatus(\`<i data-lucide="x-circle"></i> Error: \${pollData.error}\`);
                                    sendBtn.disabled = false;
                                    loading.style.display = 'none';
                                    return;
                                }

                                // Process new events
                                const newEvents = pollData.events.slice(processedEventCount);
                                processedEventCount = pollData.events.length;

                                newEvents.forEach(event => {
                                    handleEvent(event.type, event.data);
                                });

                                // Check if generation is complete
                                if (pollData.status === 'completed' || pollData.status === 'error') {
                                    activePollingTimeout = null; // Clear the reference
                                    sendBtn.disabled = false;
                                    loading.style.display = 'none';
                                    promptInput.focus();
                                    return;
                                }

                                // Schedule next poll
                                activePollingTimeout = setTimeout(poll, pollInterval);
                            })
                            .catch(error => {
                                console.error('Polling error:', error);
                                retryCount++;

                                // If we've exceeded max retries, give up
                                if (retryCount >= maxRetries) {
                                    console.log(\`Max retries (\${maxRetries}) reached, stopping polling\`);
                                    activePollingTimeout = null; // Clear the reference
                                    updateStatus('<i data-lucide="wifi-off"></i> Connection failed after multiple retries. Please try again.');
                                    sendBtn.disabled = false;
                                    loading.style.display = 'none';
                                    promptInput.focus();
                                    return;
                                }

                                // Exponential backoff with jitter
                                pollInterval = Math.min(
                                    pollInterval * 1.5 + Math.random() * 1000,
                                    maxPollInterval
                                );

                                console.log(\`Retry \${retryCount}/\${maxRetries} in \${Math.round(pollInterval)}ms\`);
                                updateStatus(\`<i data-lucide="wifi-off"></i> Connection error (retry \${retryCount}/\${maxRetries})...\`);

                                // Schedule retry
                                activePollingTimeout = setTimeout(poll, pollInterval);
                            });
                    };

                    // Start polling
                    poll();
                })
                .catch(error => {
                    console.error('Generation start error:', error);
                    if (activePollingTimeout) {
                        clearTimeout(activePollingTimeout);
                        activePollingTimeout = null;
                    }
                    updateStatus('<i data-lucide="x-circle"></i> Failed to start generation.');
                    sendBtn.disabled = false;
                    loading.style.display = 'none';
                });

            // Event handler function to process events (same as before)
            function handleEvent(eventType, eventData) {
                switch (eventType) {
                    case 'status':
                        updateStatus(eventData.message.replace(/🔍/g, '<i data-lucide="search"></i>')
                                               .replace(/🤖/g, '<i data-lucide="bot"></i>')
                                               .replace(/📡/g, '<i data-lucide="radio"></i>')
                                               .replace(/🔄/g, '<i data-lucide="refresh-cw"></i>'));
                        lucide.createIcons();
                        break;

                    case 'system_prompt':
                        addSystemPrompt(eventData.prompt);
                        break;

                    case 'claude_message':
                        console.log('🎯 Received claude_message event:', eventData);
                        addClaudeMessage(eventData.message);
                        break;

                    case 'claude_message_streaming':
                        console.log('🔄 Received streaming claude_message event:', eventData);
                        addOrUpdateStreamingMessage(eventData.message, eventData.isPartial);
                        break;

                    case 'log':
                        addLogEntry(eventData.level, eventData.message, eventData.data, eventData.timestamp);
                        break;

                    case 'file_start':
                        showCurrentFile(eventData.path);
                        updateStatus(eventData.message.replace(/📝/g, '<i data-lucide="file-text"></i>'));
                        lucide.createIcons();
                        break;

                    case 'file_streaming':
                        updateFileContent(eventData.content);
                        updateStatus(\`<i data-lucide="refresh-cw"></i> Streaming: \${eventData.path}...\`);
                        lucide.createIcons();
                        break;

                    case 'file_complete':
                        addCompletedFile(eventData.path, eventData.content);
                        updateStatus(eventData.message.replace(/✅/g, '<i data-lucide="check-circle"></i>'));

                        // Reset current file display for next file
                        const currentFileDiv = document.getElementById('currentFile');
                        const fileName = document.getElementById('fileName');
                        const fileContent = document.getElementById('fileContent');
                        if (currentFileDiv && fileName && fileContent) {
                            fileName.innerHTML = '<i data-lucide="clock"></i> Ready for next file...';
                            fileContent.textContent = '';
                            // Keep it visible but ready for next file
                        }
                        lucide.createIcons();
                        break;

                    case 'file_error':
                        updateStatus(eventData.message.replace(/❌/g, '<i data-lucide="x-circle"></i>'));

                        // Reset current file display on error
                        const currentFileDiv2 = document.getElementById('currentFile');
                        if (currentFileDiv2) {
                            currentFileDiv2.style.display = 'none';
                        }
                        lucide.createIcons();
                        break;

                    case 'complete':
                        updateStatus(eventData.message.replace(/✅/g, '<i data-lucide="check-circle"></i>'));

                        // Hide current file display when all done
                        const currentFileDiv3 = document.getElementById('currentFile');
                        if (currentFileDiv3) {
                            currentFileDiv3.style.display = 'none';
                        }

                        lucide.createIcons();
                        break;

                    case 'error':
                        updateStatus(eventData.message.replace(/❌/g, '<i data-lucide="x-circle"></i>'));
                        lucide.createIcons();
                        break;

                    default:
                        console.log('Unknown event type:', eventType, eventData);
                }
            }
        }

        promptForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const prompt = promptInput.value.trim();
            if (!prompt) return;

            // Add user message
            addMessage(prompt, true);

            // Clear input and show loading
            promptInput.value = '';
            sendBtn.disabled = true;
            loading.style.display = 'block';

            // Use streaming by default
            handleStreaming(prompt);
        });

        // Focus input on load
        promptInput.focus();

        // Initialize Lucide icons on page load
        document.addEventListener('DOMContentLoaded', function() {
            lucide.createIcons();
        });

        // Also create icons immediately if DOM is already loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', lucide.createIcons);
        } else {
            lucide.createIcons();
        }
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

    // Check if this is a poll request for existing generation FIRST
    const pollId = url.searchParams.get('poll');
    if (pollId) {
      const state = generationStates.get(pollId);
      if (!state) {
        return new Response(JSON.stringify({
          error: 'Generation not found or expired',
          timestamp: new Date().toISOString()
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        status: state.status,
        events: state.events,
        error: state.error,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // If not polling, check for prompt parameter
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

    // Start new generation with polling
    console.log('🚀 Starting new generation with polling...');
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    // Start generation asynchronously (don't await)
    completePromptWithStreaming(prompt, generationId).catch((error) => {
      console.error('Generation failed:', error);
    });

    // Return generation ID immediately
    return new Response(JSON.stringify({
      generationId,
      status: 'started',
      message: 'Generation started, use the generationId to poll for updates',
      pollUrl: `${url.pathname}?poll=${generationId}`,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
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
