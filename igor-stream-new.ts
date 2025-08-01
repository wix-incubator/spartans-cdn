import type { APIRoute } from 'astro';
// Conditional imports - only import Node.js modules when running in Node.js
// @ts-ignore - Ignore TypeScript errors for dynamic imports
let fs: any = null;
let path: any = null;

// Runtime environment detection
const isNodeJS = typeof process !== 'undefined' && process.versions && process.versions.node;

// Lazy load Node.js modules
const loadNodeModules = async () => {
  if (fs && path) return; // Already loaded

  if (isNodeJS) {
    try {
      // Dynamic imports that won't be bundled for browser/Cloudflare
      fs = await import('fs');
      path = await import('path');
    } catch (error) {
      console.warn('Node.js modules not available:', error);
    }
  }
};

// SSE helper functions
function createSSEResponse() {
  return new Response(new ReadableStream({
    start(controller) {
      // Set up SSE response
      this.controller = controller;
    },
    cancel: () => {
      console.log('SSE stream cancelled by client');
    }
  }), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  });
}

function sendSSEEvent(controller: ReadableStreamDefaultController, eventType: string, data: any) {
  const eventData = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  try {
    controller.enqueue(encoder.encode(eventData));
  } catch (error) {
    console.log('SSE controller closed:', error);
  }
}

const TOKEN_PATH = '../root/.wix/auth/api-key.json';

const readCLIAPIKey = async () => {
  await loadNodeModules();
  if (!fs || !isNodeJS) {
    throw new Error('File system operations not available in this environment');
  }
  const apiKeyJSON = fs.readFileSync(TOKEN_PATH, 'utf8');
  const authJSON = JSON.parse(apiKeyJSON);
  const apiKey = authJSON.token || authJSON.accessToken;
  if (!apiKey) {
    throw new Error('No API key found');
  }
  console.log('[Claude] API key:', apiKey?.substring(0, 10) + '...');
  return apiKey;
}

/*const anthropic = createAnthropic({
  baseURL: "https://manage.wix.com/_api/igor-ai-gateway/proxy/anthropic",
  apiKey: 'fake-api-key',
  headers: {
    Authorization: await readCLIAPIKey()
  }
});*/

async function streamClaudeCompletion(systemPrompt, userMessage) {
  const apiKey = 'fake-api-key';
  const url = 'https://manage.wix.com/_api/igor-ai-gateway/proxy/anthropic/messages';

  let auth = '';
  try {
    auth = await readCLIAPIKey();
  } catch (error) {
    console.error('[Claude] Error:', error);
    throw new Error('Failed to read CLI API key');
  }

  const headers = {
    'Authorization': auth,
    'content-type': 'application/json',
  };

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 64000,
    stream: true,
    system: [
      {
        "text": systemPrompt,
        "type": "text"
      }
    ],
    messages: [
      { role: 'user', content: userMessage }
    ]
  });

  console.log('[Claude] streaming claude completion');

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body
  });

  if (!response.ok) {
    console.error('[Claude] Error:', await response.text());
    return;
  }

  return response.body;
}

class StreamingFileParser {
  private buffer = '';
  private writtenFiles: string[] = [];
  private errors: string[] = [];
  private eventEmitter: (event: string, data: any) => void;
  private currentFileBuffer = '';
  private currentFilePath = '';
  private isInFile = false;

  // Delta tracking for messages
  private lastEmittedMessageContent = '';
  private lastEmittedMessageLength = 0;

  // Delta tracking for files
  private lastEmittedFileContent = '';
  private lastEmittedFileLength = 0;

  constructor(eventEmitter: (event: string, data: any) => void) {
    this.eventEmitter = eventEmitter;
  }

  private LOG_LEVEL = 'info';
  // Helper method to emit both console log and client log
  private log(level: 'info' | 'debug' | 'warn' | 'error', message: string, data?: any) {
    if (level === 'debug' && this.LOG_LEVEL !== 'debug') return;
    if (level === 'info' && this.LOG_LEVEL !== 'debug' && this.LOG_LEVEL !== 'info') return;
    if (level === 'warn' && this.LOG_LEVEL !== 'debug' && this.LOG_LEVEL !== 'info' && this.LOG_LEVEL !== 'warn') return;
    if (level === 'error' && this.LOG_LEVEL !== 'debug' && this.LOG_LEVEL !== 'info' && this.LOG_LEVEL !== 'warn' && this.LOG_LEVEL !== 'error') return;

    console.log(`${level.toUpperCase()}: ${message}`, data || '');
    this.eventEmitter('log', {
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined,
      timestamp: new Date().toISOString()
    });
  }

  processChunk(chunk: string): { filesWritten: string[]; errors: string[]; totalFiles: number } {
    //console.log('[Claude] processChunk', chunk);
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
    //console.log('[Claude] parseMessages', this.buffer);
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

      // Reset message delta tracking after processing complete messages
      this.lastEmittedMessageContent = '';
      this.lastEmittedMessageLength = 0;
    }

    // Also check for streaming message content (incomplete messages)
    if (!found && hasOpenTag && !hasCloseTag) {
      const openMatch = this.buffer.match(/<message>([\s\S]*?)$/);
      if (openMatch) {
        const partialContent = openMatch[1].trim();
        if (partialContent && partialContent.length > this.lastEmittedMessageLength) {
          this.log('debug', `[REFRESH_CW] Found streaming message content: "${partialContent.substring(0, 50)}..."`);

          // Emit only the delta (new content)
          const delta = partialContent.substring(this.lastEmittedMessageLength);
          if (delta.length > 0) {
            this.eventEmitter('claude_message_delta', {
              delta: delta,
              fullMessage: partialContent,
              position: this.lastEmittedMessageLength,
              isPartial: true,
              timestamp: new Date().toISOString()
            });
            this.lastEmittedMessageLength = partialContent.length;
            this.lastEmittedMessageContent = partialContent;
          }
        }
      }
    }
  }

  private async parseStreamingFiles() {
    // Look for opening file tags with both path and description attributes
    const openTagRegex = /<file\s+path="([^"]+)"(?:\s+description="([^"]*)")?>/g;
    let openMatch;

    while ((openMatch = openTagRegex.exec(this.buffer)) !== null) {
      const [fullMatch, filePath, description] = openMatch;

            if (!this.isInFile) {
        this.currentFilePath = filePath.trim();
        this.currentFileBuffer = '';
        this.isInFile = true;

        // Reset file delta tracking for new file
        this.lastEmittedFileContent = '';
        this.lastEmittedFileLength = 0;

        // Debug logs for description parsing
        this.log('info', `📝 Starting to generate file: ${this.currentFilePath}`);
        this.log('debug', `🔍 Parsed description: "${description || 'NO DESCRIPTION'}"`);
        this.log('debug', `🔍 Full match: "${fullMatch}"`);

        // Emit file start event with description if available
        const eventData = {
          path: this.currentFilePath,
          description: description || '',
          message: description
            ? `📝 ${description}`
            : `📝 Starting to generate: ${this.currentFilePath}`
        };

        this.log('debug', `🔍 Emitting file_start event:`, eventData);
        this.eventEmitter('file_start', eventData);

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
          await this.writeFile(this.currentFilePath, fileContent);
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
        if (newContent.length > this.lastEmittedFileLength) {
          // Emit only the delta (new content)
          const delta = newContent.substring(this.lastEmittedFileLength);
          if (delta.length > 0) {
            this.eventEmitter('file_content_delta', {
              path: this.currentFilePath,
              delta: delta,
              fullContent: newContent,
              position: this.lastEmittedFileLength,
              message: `🔄 Streaming: ${this.currentFilePath}...`
            });
            this.lastEmittedFileLength = newContent.length;
            this.lastEmittedFileContent = newContent;
          }
        }
      }
    }
  }

  private async writeFile(filePath: string, content: string) {
    await loadNodeModules();
    if (!fs || !path || !isNodeJS) {
      this.log('error', 'File system operations not available in this environment');
      this.errors.push('File system operations not available');
      return;
    }

    // Ensure the file path starts with src/ as per the prompt requirements
    const fullPath = filePath.startsWith('src/') ? filePath : `src/${filePath}`;

    this.log('info', `✍️ Writing file: ${fullPath}`);

    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });

      // Write the file
      fs.writeFileSync(fullPath, content, 'utf8');
      this.writtenFiles.push(fullPath);
      this.log('info', `✅ Successfully wrote: ${fullPath}`);
    } catch (error) {
      this.log('error', `Failed to write file: ${fullPath}`, error);
      this.errors.push(`Failed to write file: ${fullPath} - ${error.message}`);
    }
  }

  async finalize(): Promise<{ filesWritten: string[]; errors: string[]; totalFiles: number }> {
    this.log('info', '🔄 Finalizing parsing process...');

    // Process any remaining messages in the buffer
    this.parseMessages();

    // Handle any remaining file in progress
    if (this.isInFile && this.currentFileBuffer) {
      try {
        await this.writeFile(this.currentFilePath, this.currentFileBuffer);
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

// Helper function to convert ReadableStream to async iterable of text chunks
async function* createTextStreamFromReadableStream(readableStream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = readableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Helper function to process lines and yield text
  function* processLines(lines: string[]): Generator<string> {
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text;
          }
        } catch (e) {
          // Skip invalid JSON lines
          continue;
        }
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          for (const text of processLines(lines)) {
            yield text;
          }
        }
        break;
      }

      // Add new chunk to buffer
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete lines (those ending with \n)
      const lines = buffer.split('\n');
      // Keep the last line in buffer (it might be incomplete)
      buffer = lines.pop() || '';

      // Process complete lines
      for (const text of processLines(lines)) {
        yield text;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const completePromptWithStreaming = async (prompt: string, sseController: ReadableStreamDefaultController) => {
  const eventEmitter = (event: string, data: any) => {
    sendSSEEvent(sseController, event, data);
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
    const readDirectoryRecursive = async (dirPath: string, basePath: string = ''): Promise<string[]> => {
      await loadNodeModules();
      if (!fs || !path || !isNodeJS) {
        log('warn', 'File system operations not available, returning empty directory listing');
        return [];
      }

      const results: string[] = [];

      try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const relativePath = basePath ? path.join(basePath, item) : item;

          try {
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
              // Recursively read subdirectories
              results.push(...await readDirectoryRecursive(fullPath, relativePath));
            } else if (stat.isFile()) {
              // Add file to results
              results.push(path.join(dirPath, item));
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
    const allComponentFiles = await readDirectoryRecursive(componentsPath);

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
        if (!fs || !isNodeJS) {
          return `<file path="${relativePath}" error="File system not available" />`;
        }
        const content = fs.readFileSync(filePath, 'utf8');
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
        if (!fs || !isNodeJS) {
          return `<file path="${file}" error="File system not available" />`;
        }
        const content = fs.readFileSync(file, 'utf8');
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
<file path="src/the/path/to/the/file" description="a description of what you are doing in high level">
  the new file content
</file>
<file path="src/the/path/to/the/file" description="a description of what you are doing in high level">
  the new file content
</file>
<message>
  another markdown message to the user ...
</message>
<file path="src/the/path/to/the/file" description="a description of what you are doing in high level">
  the new file content
</file>

all files must be in the src folder

you must always write descriptions for the files you are writing / editing.

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
    log('info', '🤖 Initiating Claude request...');

    /*const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 64000,
    });*/

    const result = await streamClaudeCompletion(systemPrompt, prompt);
    const textStream = createTextStreamFromReadableStream(result);

    const parser = new StreamingFileParser(eventEmitter);
    let fullResponse = '';

    eventEmitter('status', { message: '📡 Streaming response...' });
    log('info', '📡 Starting to receive streaming response...');

    // Process the stream
    let chunkCount = 0;
    for await (const chunk of textStream) {
      // console.log('[Claude] chunk', chunk);
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
    const finalResult = await parser.finalize();

    eventEmitter('complete', {
      message: `✅ Generation complete! ${finalResult.totalFiles} files written.`,
      filesWritten: finalResult.filesWritten,
      errors: finalResult.errors,
      totalFiles: finalResult.totalFiles
    });

    log('info', '✅ Streaming completed successfully');

    eventEmitter('complete', {
      message: '✅ Generation completed successfully!',
      totalFiles: finalResult.totalFiles
    });

    return finalResult;
  } catch (error) {
    log('error', '💥 Error in completePrompt', { error: error instanceof Error ? error.message : 'Unknown error' });
    eventEmitter('error', {
      message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;
  } finally {
    // Close the SSE stream
    try {
      sseController.close();
    } catch (error) {
      console.log('SSE controller already closed');
    }
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

        /* Mobile tab system */
        .mobile-tabs {
            display: none;
            background: #21262d;
            border-bottom: 1px solid #30363d;
        }

        .tab-buttons {
            display: flex;
            width: 100%;
        }

        .tab-button {
            flex: 1;
            padding: 12px 16px;
            background: #161b22;
            color: #7d8590;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
            border-bottom: 2px solid transparent;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .tab-badge {
            background: #f85149;
            color: #ffffff;
            border-radius: 10px;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: 600;
            min-width: 16px;
            text-align: center;
            line-height: 1.2;
        }

        .tab-button.active {
            background: #21262d;
            color: #e6edf3;
            border-bottom-color: #58a6ff;
        }

        .tab-button:hover:not(.active) {
            background: #21262d;
            color: #e6edf3;
        }

        /* Responsive design */
        @media (max-width: 1024px) {
            .main-container {
                flex-direction: column;
                height: 100vh;
            }

            .chat-container, .streaming-panel {
                width: 100%;
                min-width: unset;
                border-right: none;
                border-bottom: 1px solid #30363d;
            }

            .chat-container {
                flex: 1;
                min-height: 50vh;
            }

            .streaming-panel {
                flex: 1;
                min-height: 50vh;
                border-bottom: none;
            }
        }

        @media (max-width: 768px) {
            .mobile-tabs {
                display: block;
            }

            .main-container {
                flex-direction: column;
                height: 100vh;
            }

            .chat-container, .streaming-panel {
                width: 100%;
                height: calc(100vh - 50px); /* Subtract tab height */
                border-bottom: none;
                border-right: none;
            }

            .chat-container.hidden, .streaming-panel.hidden {
                display: none;
            }

            .streaming-content {
                height: calc(100vh - 50px - 48px); /* Subtract tab height and header */
                padding: 12px;
            }

            .chat-area {
                height: calc(100vh - 50px - 48px - 80px); /* Subtract tab, header, and input area */
                padding: 12px;
            }
        }

        @media (max-width: 640px) {
            body {
                padding: 0;
            }

            .main-container {
                width: 100%;
                border-radius: 0;
                height: 100vh;
            }

            .header, .streaming-panel-header {
                padding: 10px 12px;
            }

            .header h1, .streaming-panel-header h2 {
                font-size: 13px;
            }

            .header .subtitle, .streaming-panel-header .subtitle {
                font-size: 11px;
            }

            .input-area {
                padding: 10px 12px;
            }

            .tab-button {
                padding: 10px 12px;
                font-size: 12px;
            }
        }
    </style>
  </head>
<body>
    <!-- Mobile tab navigation -->
    <div class="mobile-tabs">
        <div class="tab-buttons">
            <button class="tab-button active" onclick="switchToTab('chat')">
                <i data-lucide="message-circle"></i> Chat
            </button>
            <button class="tab-button" onclick="switchToTab('output')">
                <i data-lucide="terminal"></i> Live Output
                <span class="tab-badge" id="outputBadge" style="display: none;">0</span>
            </button>
        </div>
    </div>

    <div class="main-container">
        <div class="chat-container" id="chatContainer">
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

        <div class="streaming-panel" id="streamingPanel">
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
        // Debug configuration - set to false to disable all debug logs
        const DEBUG_LOGS = false;

        // Debug logging wrapper
        const debugLog = (...args) => {
            if (DEBUG_LOGS) {
                console.log(...args);
            }
        };

        const chatArea = document.getElementById('chatArea');
        const streamingContent = document.getElementById('streamingContent');
        const promptForm = document.getElementById('promptForm');
        const promptInput = document.getElementById('promptInput');
        const sendBtn = document.getElementById('sendBtn');
        const loading = document.getElementById('loading');

        let streamingContainer = null;
        let completedFiles = [];
        let logEntries = [];
        let currentEventSource = null;

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
            console.log('📝 Final Claude message received:', message);

            // If there's already a streaming message, just finalize it instead of creating a new one
            if (currentStreamingMessage) {
                console.log('📝 Finalizing existing streaming message');
                const contentDiv = currentStreamingMessage.querySelector('.message-content');
                const timeDiv = currentStreamingMessage.querySelector('.message-time');

                                if (contentDiv && timeDiv) {
                    // Check if this is a delta-based message (has raw content)
                    const rawContent = contentDiv.getAttribute('data-raw-content');
                    const finalContent = rawContent || message;

                    // Update content with final message (convert to markdown)
                    marked.setOptions({ breaks: true, gfm: true });
                    contentDiv.innerHTML = marked.parse(finalContent);
                    contentDiv.removeAttribute('data-raw-content'); // Clean up

                    // Update timestamp
                    const time = new Date().toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    timeDiv.textContent = time;

                    chatArea.scrollTop = chatArea.scrollHeight;
                    console.log('✅ Streaming message finalized');
                }

                // Clear the streaming message reference
                currentStreamingMessage = null;
                return;
            }

            console.log('📝 Creating new final message');

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
            console.log('✅ New Claude message added to DOM');
        }



        function addOrUpdateStreamingMessage(message, isPartial) {
            console.log('🔄 [STREAM] Adding/updating streaming message');

            // Configure marked for better security and GitHub-flavored markdown
            marked.setOptions({
                breaks: true,
                gfm: true
            });

            if (!currentStreamingMessage) {
                console.log('🔄 [STREAM] Creating NEW streaming message');
                // Create new streaming message
                currentStreamingMessage = document.createElement('div');
                currentStreamingMessage.className = 'message claude-message';

                const time = new Date().toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });

                currentStreamingMessage.innerHTML = \`
                    <div class="message-header">
                        <span>IGOR</span>
                        <span class="message-time">\${time}</span>
                    </div>
                    <div class="message-content">\${marked.parse(message)}</div>
                \`;

                chatArea.appendChild(currentStreamingMessage);
            } else {
                console.log('🔄 [STREAM] Updating EXISTING streaming message');
                // Update existing streaming message content immediately
                const contentDiv = currentStreamingMessage.querySelector('.message-content');
                if (contentDiv) {
                    contentDiv.innerHTML = marked.parse(message);
                }
            }

            chatArea.scrollTop = chatArea.scrollHeight;
        }

        function addOrUpdateStreamingMessageDelta(delta, fullMessage, position, isPartial) {
            console.log('🔄 [DELTA] Adding/updating streaming message delta');

            if (!currentStreamingMessage) {
                console.log('🔄 [DELTA] Creating NEW streaming message for delta');
                // Create new streaming message
                currentStreamingMessage = document.createElement('div');
                currentStreamingMessage.className = 'message claude-message';

                const time = new Date().toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });

                currentStreamingMessage.innerHTML = \`
                    <div class="message-header">
                        <span>IGOR</span>
                        <span class="message-time">\${time}</span>
                    </div>
                    <div class="message-content" data-raw-content=""></div>
                \`;

                chatArea.appendChild(currentStreamingMessage);
            }

            const contentDiv = currentStreamingMessage.querySelector('.message-content');
            if (contentDiv) {
                // Store raw content and append delta
                let rawContent = contentDiv.getAttribute('data-raw-content') || '';
                rawContent += delta;
                contentDiv.setAttribute('data-raw-content', rawContent);

                // For now, show raw text during streaming to avoid constant markdown parsing
                contentDiv.textContent = rawContent;

                chatArea.scrollTop = chatArea.scrollHeight;
            }
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

        function showCurrentFile(path, description = '') {
            console.log('📁 [FILE_START] Starting new file:', path);
            console.log('📁 [FILE_START] Description:', description);

            const currentFileDiv = document.getElementById('currentFile');
            const fileName = document.getElementById('fileName');
            const fileContent = document.getElementById('fileContent');

            if (currentFileDiv && fileName && fileContent) {
                currentFileDiv.style.display = 'block';

                // Show description if available, otherwise show path
                if (description && description.trim()) {
                    fileName.innerHTML = \`<i data-lucide="file-text"></i> \${description}\`;
                } else {
                    fileName.innerHTML = \`<i data-lucide="file-text"></i> \${path}\`;
                }

                fileContent.textContent = '';

                // Re-render Lucide icons
                lucide.createIcons();
            }
        }

        function updateFileContent(content) {
            console.log('📁 [FILE_STREAMING] updateFileContent called');

            const fileContent = document.getElementById('fileContent');
            if (!fileContent) {
                console.log('📁 [FILE_STREAMING] No fileContent element found');
                return;
            }

            // Update content immediately
            fileContent.textContent = content;
            fileContent.scrollTop = fileContent.scrollHeight;
        }

        function updateFileContentDelta(delta, fullContent, position) {
            console.log('📁 [FILE_DELTA] updateFileContentDelta called');

            const fileContent = document.getElementById('fileContent');
            if (!fileContent) {
                console.log('📁 [FILE_DELTA] No fileContent element found');
                return;
            }

            // Append delta to existing content
            const currentContent = fileContent.textContent || '';
            fileContent.textContent = currentContent + delta;
            fileContent.scrollTop = fileContent.scrollHeight;
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
            // Close any existing EventSource
            if (currentEventSource) {
                currentEventSource.close();
                currentEventSource = null;
                console.log('Closed existing EventSource connection');
            }

            // On mobile, automatically switch to output tab when generation starts
            if (window.innerWidth <= 768 && typeof window.switchToTab === 'function') {
                window.switchToTab('output');
            }

            // Clear badge count for new generation
            clearOutputBadge();

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

            // Start SSE streaming
            const streamUrl = \`?stream=true&prompt=\${encodeURIComponent(prompt)}\`;
            console.log('🚀 Starting SSE stream:', streamUrl);

            currentEventSource = new EventSource(streamUrl);

            currentEventSource.onopen = function(event) {
                console.log('✅ SSE connection opened');
                updateStatus('<i data-lucide="radio"></i> Connected - streaming...');
            };

            currentEventSource.onerror = function(event) {
                console.error('❌ SSE connection error:', event);
                updateStatus('<i data-lucide="wifi-off"></i> Connection error');
                sendBtn.disabled = false;
                loading.style.display = 'none';
                currentEventSource = null;
            };

            // Handle specific event types
            currentEventSource.addEventListener('status', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('status', data);
            });

            currentEventSource.addEventListener('system_prompt', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('system_prompt', data);
            });

            currentEventSource.addEventListener('claude_message', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('claude_message', data);
            });

            currentEventSource.addEventListener('claude_message_streaming', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('claude_message_streaming', data);
            });

            currentEventSource.addEventListener('claude_message_delta', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('claude_message_delta', data);
            });

            currentEventSource.addEventListener('log', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('log', data);
            });

            currentEventSource.addEventListener('file_start', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('file_start', data);
            });

            currentEventSource.addEventListener('file_streaming', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('file_streaming', data);
            });

            currentEventSource.addEventListener('file_content_delta', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('file_content_delta', data);
            });

            currentEventSource.addEventListener('file_complete', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('file_complete', data);
            });

            currentEventSource.addEventListener('file_error', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('file_error', data);
            });

            currentEventSource.addEventListener('complete', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('complete', data);
                // Close the connection when complete
                currentEventSource.close();
                currentEventSource = null;
                sendBtn.disabled = false;
                loading.style.display = 'none';
                promptInput.focus();
            });

            currentEventSource.addEventListener('error', function(event) {
                const data = JSON.parse(event.data);
                handleEvent('error', data);
                // Close the connection on error
                currentEventSource.close();
                currentEventSource = null;
                sendBtn.disabled = false;
                loading.style.display = 'none';
                promptInput.focus();
            });

            // Event handler function to process events
            function handleEvent(eventType, eventData) {
                switch (eventType) {
                    case 'status':
                        updateStatus(eventData.message.replace(/🔍/g, '<i data-lucide="search"></i>')
                                               .replace(/🤖/g, '<i data-lucide="bot"></i>')
                                               .replace(/📡/g, '<i data-lucide="radio"></i>')
                                               .replace(/🔄/g, '<i data-lucide="refresh-cw"></i>'));
                        updateOutputBadge(); // Update badge on status changes
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

                    case 'claude_message_delta':
                        console.log('🔄 Received claude_message_delta event:', eventData);
                        addOrUpdateStreamingMessageDelta(eventData.delta, eventData.fullMessage, eventData.position, eventData.isPartial);
                        break;

                    case 'log':
                        addLogEntry(eventData.level, eventData.message, eventData.data, eventData.timestamp);
                        break;

                    case 'file_start':
                        showCurrentFile(eventData.path, eventData.description);
                        updateStatus(eventData.message.replace(/📝/g, '<i data-lucide="file-text"></i>'));
                        lucide.createIcons();
                        break;

                    case 'file_streaming':
                        updateFileContent(eventData.content);
                        updateStatus(\`<i data-lucide="refresh-cw"></i> Streaming: \${eventData.path}...\`);
                        lucide.createIcons();
                        break;

                    case 'file_content_delta':
                        updateFileContentDelta(eventData.delta, eventData.fullContent, eventData.position);
                        updateStatus(\`<i data-lucide="refresh-cw"></i> Streaming: \${eventData.path}...\`);
                        lucide.createIcons();
                        break;

                    case 'file_complete':
                        addCompletedFile(eventData.path, eventData.content);
                        updateStatus(eventData.message.replace(/✅/g, '<i data-lucide="check-circle"></i>'));
                        updateOutputBadge(); // Update badge when files are completed

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

        // Badge management for mobile tabs
        let outputActivityCount = 0;

        function updateOutputBadge(increment = true) {
            const badge = document.getElementById('outputBadge');
            const streamingPanel = document.getElementById('streamingPanel');

            if (!badge) return;

            // Only show badge on mobile when streaming panel is hidden
            if (window.innerWidth <= 768 && streamingPanel && streamingPanel.classList.contains('hidden')) {
                if (increment) outputActivityCount++;

                if (outputActivityCount > 0) {
                    badge.textContent = outputActivityCount > 99 ? '99+' : outputActivityCount.toString();
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
        }

        function clearOutputBadge() {
            const badge = document.getElementById('outputBadge');
            if (badge) {
                outputActivityCount = 0;
                badge.style.display = 'none';
            }
        }

        // Mobile tab switching functionality
        function switchToTab(tabName) {
            const chatContainer = document.getElementById('chatContainer');
            const streamingPanel = document.getElementById('streamingPanel');
            const tabButtons = document.querySelectorAll('.tab-button');

            // Remove active class from all buttons
            tabButtons.forEach(button => button.classList.remove('active'));

            if (tabName === 'chat') {
                chatContainer.classList.remove('hidden');
                streamingPanel.classList.add('hidden');
                tabButtons[0].classList.add('active');
                // Focus input when switching to chat
                promptInput.focus();
            } else if (tabName === 'output') {
                chatContainer.classList.add('hidden');
                streamingPanel.classList.remove('hidden');
                tabButtons[1].classList.add('active');
                // Clear badge when viewing output
                clearOutputBadge();
            }

            // Re-render Lucide icons after tab switch
            lucide.createIcons();
        }

        // Make switchToTab globally accessible
        window.switchToTab = switchToTab;

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

    // Check for SSE stream request
    const stream = url.searchParams.get('stream');
    if (stream === 'true') {
      const prompt = url.searchParams.get('prompt');
      if (!prompt) {
        return new Response(JSON.stringify({
          error: 'Missing prompt parameter for streaming',
          timestamp: new Date().toISOString()
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log('🚀 Starting SSE streaming generation...');
      console.log('📝 Received prompt:', prompt);

      return new Response(new ReadableStream({
        start(controller) {
          // Start generation with SSE controller
          completePromptWithStreaming(prompt, controller).catch((error) => {
            console.error('Generation failed:', error);
            sendSSEEvent(controller, 'error', {
              message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            try {
              controller.close();
            } catch (e) {
              console.log('Controller already closed');
            }
          });
        },
        cancel() {
          console.log('SSE stream cancelled by client');
        }
      }), {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        }
      });
    }

    // Regular UI request
    const prompt = url.searchParams.get('prompt');
    if (prompt) {
      console.log('📝 Non-streaming request - redirecting to streaming');
      return new Response(JSON.stringify({
        error: 'Non-streaming mode deprecated',
        message: 'Please use streaming mode by adding &stream=true',
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
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
