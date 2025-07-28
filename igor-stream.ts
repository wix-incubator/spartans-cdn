import type { APIRoute } from 'astro';
import { readdirSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  baseURL: "https://manage.wix.com/_api/igor-ai-gateway/proxy/anthropic",
  apiKey: 'fake-api-key'
});

class StreamingFileParser {
  private buffer = '';
  private currentFile: { path: string; content: string } | null = null;
  private writtenFiles: string[] = [];
  private errors: string[] = [];
  private isInFile = false;

  processChunk(chunk: string): { filesWritten: string[]; errors: string[]; totalFiles: number } {
    this.buffer += chunk;

    // Process complete file tags
    this.parseCompleteFiles();

    return {
      filesWritten: [...this.writtenFiles],
      errors: [...this.errors],
      totalFiles: this.writtenFiles.length
    };
  }

  private parseCompleteFiles() {
    const fileRegex = /<file\s+path="([^"]+)">\s*([\s\S]*?)\s*<\/file>/g;
    let match;

    while ((match = fileRegex.exec(this.buffer)) !== null) {
      const [fullMatch, filePath, fileContent] = match;

      try {
        this.writeFile(filePath.trim(), fileContent.trim());

        // Remove the processed file from buffer
        this.buffer = this.buffer.replace(fullMatch, '');
        // Reset regex lastIndex since we modified the string
        fileRegex.lastIndex = 0;
      } catch (error) {
        const errorMsg = `Failed to write ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        this.errors.push(errorMsg);
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
    // Process any remaining complete files in buffer
    this.parseCompleteFiles();

    return {
      filesWritten: this.writtenFiles,
      errors: this.errors,
      totalFiles: this.writtenFiles.length
    };
  }
}

const completePrompt = async (prompt: string) => {
  try {
    console.log('🚀 Starting Claude streaming request for prompt:', prompt.substring(0, 50) + '...');

    const importantFiles = [
      'src/components/pages/HomePage.tsx',
      'src/tailwind.config.mjs',
    ]

    const componentsPath = 'src/components/ui';

    const components = readdirSync(componentsPath).map(file => {
      return `
        <file path="${componentsPath}/${file}" readOnly />
      `;
    }).join('\n\n---\n\n');

    const files = importantFiles.map(file => {
      return `
        <file path="${file}">
          the file content
        </file>
      `;
    }).join('\n\n---\n\n');

    const systemPrompt = `
You are the best programmer of a project written over Astro with React router and React components.

The user will give you a prompt and you must change the files in the project to achieve the user's goal.

These are components that you can use but not change:

${components}

The current files in the project are:

${files}

you must only change these files, and nothing else

Your output format must be the following and nothing more:

<file path="src/the/path/to/the/file">
  the new file content
</file>
<file path="src/the/path/to/the/file">
  the new file content
</file>
<file path="src/the/path/to/the/file">
  the new file content
</file>

all files must be in the src folder

you may add new files.

if you fail to write the best code possible, you and I will be fired.
`;

    console.log('📡 Starting streaming request to Claude...');

    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 64000,
    });

    const parser = new StreamingFileParser();
    let fullResponse = '';

    // Process the stream
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      const parseResult = parser.processChunk(chunk);

      // Log progress
      if (parseResult.filesWritten.length > 0) {
        console.log(`📁 Files written so far: ${parseResult.filesWritten.length}`);
      }
    }

    // Finalize parsing
    const finalResult = parser.finalize();

    console.log('✅ Streaming completed');
    console.log(`📄 Full response length: ${fullResponse.length}`);
    console.log(`📁 Total files written: ${finalResult.totalFiles}`);

    return {
      data: { response: { generatedTexts: [fullResponse] } },
      fileWriteResults: finalResult
    };
  } catch (error) {
    console.error('❌ Error in completePrompt:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return { error: 'Error in completePrompt' };
  }
};

const getChatUI = () => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IGOR Backdoor 🕵️‍♂️</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .chat-container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            width: 90%;
            max-width: 800px;
            height: 80vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            color: white;
            padding: 20px;
            text-align: center;
        }

        .header h1 {
            font-size: 24px;
            margin-bottom: 5px;
        }

        .header p {
            opacity: 0.9;
            font-size: 14px;
        }

        .chat-area {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: #f8fafc;
        }

        .input-area {
            padding: 20px;
            background: white;
            border-top: 1px solid #e2e8f0;
        }

        .input-form {
            display: flex;
            gap: 10px;
        }

        .prompt-input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            font-size: 16px;
            outline: none;
            transition: border-color 0.2s;
        }

        .prompt-input:focus {
            border-color: #4f46e5;
        }

        .send-btn {
            padding: 12px 24px;
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }

        .send-btn:hover {
            transform: translateY(-2px);
        }

        .send-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .message {
            margin-bottom: 16px;
            padding: 12px 16px;
            border-radius: 12px;
            max-width: 80%;
        }

        .user-message {
            background: #4f46e5;
            color: white;
            margin-left: auto;
        }

        .assistant-message {
            background: white;
            border: 1px solid #e2e8f0;
        }

        .loading {
            display: none;
            text-align: center;
            padding: 20px;
            color: #6b7280;
        }

        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #f3f4f6;
            border-radius: 50%;
            border-top-color: #4f46e5;
            animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .file-results {
            margin-top: 10px;
            padding: 10px;
            background: #f0f9ff;
            border: 1px solid #0ea5e9;
            border-radius: 8px;
            font-size: 14px;
        }

        .file-list {
            list-style: none;
            margin: 5px 0;
        }

        .file-list li {
            padding: 2px 0;
            color: #0ea5e9;
        }

        .error-list {
            list-style: none;
            margin: 5px 0;
        }

        .error-list li {
            padding: 2px 0;
            color: #dc2626;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="header">
            <h1>🕵️‍♂️ IGOR's Backdoor</h1>
            <p>Ask IGOR to generate and write files to your project</p>
        </div>

        <div class="chat-area" id="chatArea">
            <div class="assistant-message message">
                <strong>IGOR:</strong> Hello! I'm ready to help you generate and write files to your project. Just describe what you want me to create, and I'll generate the code and automatically save it to your filesystem.
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
                    placeholder="Ask IGOR to create or modify files..."
                    required
                >
                <button type="submit" class="send-btn" id="sendBtn">Send</button>
            </form>
        </div>
    </div>

    <script>
        const chatArea = document.getElementById('chatArea');
        const promptForm = document.getElementById('promptForm');
        const promptInput = document.getElementById('promptInput');
        const sendBtn = document.getElementById('sendBtn');
        const loading = document.getElementById('loading');

        function addMessage(content, isUser = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${isUser ? 'user-message' : 'assistant-message'}\`;
            messageDiv.innerHTML = content;
            chatArea.appendChild(messageDiv);
            chatArea.scrollTop = chatArea.scrollHeight;
        }

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

            try {
                const response = await fetch(\`?prompt=\${encodeURIComponent(prompt)}\`);
                const data = await response.json();

                if (data.success) {
                    let assistantResponse = '<strong>IGOR:</strong> ';

                    if (data.fileWriteResults && data.fileWriteResults.totalFiles > 0) {
                        assistantResponse += \`I've generated and written \${data.fileWriteResults.totalFiles} file(s) to your project!\`;
                        assistantResponse += formatFileResults(data.fileWriteResults);
                    } else {
                        assistantResponse += 'Response generated successfully, but no files were found to write.';
                    }

                    addMessage(assistantResponse);
                } else {
                    addMessage(\`<strong>Error:</strong> \${data.error || 'Unknown error occurred'}\`);
                }
            } catch (error) {
                addMessage(\`<strong>Error:</strong> Failed to communicate with IGOR: \${error.message}\`);
            } finally {
                loading.style.display = 'none';
                sendBtn.disabled = false;
                promptInput.focus();
            }
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

    console.log('🤖 Processing IGOR prompt with AI SDK...');
    const completion = await completePrompt(prompt);

    const duration = Date.now() - startTime;
    console.log('✅ Igor\'s backdoor completed successfully in', duration, 'ms');

    return new Response(JSON.stringify({
      success: true,
      result: completion.data || 'no data',
      fileWriteResults: completion.fileWriteResults,
      backdoor: 'Igor was here 🕵️‍♂️ (AI SDK Version)',
      duration: duration,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
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
