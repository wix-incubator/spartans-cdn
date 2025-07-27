import type { APIRoute } from 'astro';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
// import { createHttpClient } from '@wix/http-client';

const AI_GW_BASE_URL = 'https://manage.wix.com';

const homeDir = process.env.HOME || '../root/.wix/auth/api-key.json';
const apiKeyPath = join(homeDir, '.wix/auth/api-key.json');

/*const httpClient = createHttpClient({
  baseURL: AI_GW_BASE_URL,
});*/

const getWixToken = () => {
  try {
    console.log('🔍 Attempting to read WIX token...');
    console.log('📁 Auth path:', apiKeyPath);

    const authFile = readFileSync(apiKeyPath, 'utf8');
    console.log('📄 File read successfully, length:', authFile.length);

    const authData = JSON.parse(authFile);
    console.log('✅ JSON parsed successfully');

    if (!authData.token) {
      throw new Error('Token field not found in JSON');
    }

    console.log('🔐 Token found, length:', authData.token.length);
    return authData.token;
  } catch (error) {
    console.error('❌ Failed to read WIX token:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return null;
  }
};

const parseAndWriteFiles = (generatedText: string) => {
  console.log('📝 Parsing generated text for files...');

  // Extract files using regex to match <file path="...">content</file>
  const fileRegex = /<file\s+path="([^"]+)">\s*([\s\S]*?)\s*<\/file>/g;
  const files: Array<{ path: string; content: string }> = [];

  let match;
  while ((match = fileRegex.exec(generatedText)) !== null) {
    const [, filePath, fileContent] = match;
    files.push({
      path: filePath.trim(),
      content: fileContent.trim()
    });
  }

  console.log(`📁 Found ${files.length} files to write`);

  const writtenFiles: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      // Ensure the file path starts with src/ as per the prompt requirements
      const fullPath = file.path.startsWith('src/') ? file.path : `src/${file.path}`;

      console.log(`✍️ Writing file: ${fullPath}`);

      // Create directory if it doesn't exist
      const dir = dirname(fullPath);
      mkdirSync(dir, { recursive: true });

      // Write the file
      writeFileSync(fullPath, file.content, 'utf8');
      writtenFiles.push(fullPath);
      console.log(`✅ Successfully wrote: ${fullPath}`);
    } catch (error) {
      const errorMsg = `Failed to write ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  return {
    filesWritten: writtenFiles,
    errors: errors,
    totalFiles: files.length
  };
};

const completePrompt = async (prompt: string, wixToken: string) => {
  try {
    console.log('🚀 Starting Claude request for prompt:', prompt.substring(0, 50) + '...');

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

    const claudeRequest = {
      model: 'CLAUDE_4_SONNET_1_0',
      messages: [{
        role: 'USER',
        content: [{ text: prompt }]
      }],
      temperature: 0,
      maxTokens: 64000,
      systemPrompt: [{
        text: `

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

        `,
      }],
    };

    const promptObject = {
      googleAnthropicClaudeRequest: claudeRequest,
    };

    console.log('📡 Making request to picasso ai gateway...');
    console.log('🔐 Using token prefix:', wixToken.substring(0, 10) + '...');

    /*const response = await httpClient.request({
      url: 'https://manage.wix.com/_api/picasso-ai-gateway/v1/prompt',
      method: 'POST',
      headers: {
        Authorization: wixToken,
        'x-wix-time-budget': '180000',
        'x-time-budget': '180000',
        'Content-Type': 'application/json',
      },
      data: {
        prompt: promptObject,
      },
    });*/

    const response = await fetch('https://manage.wix.com/_api/picasso-ai-gateway/v1/prompt', {
      method: 'POST',
      headers: {
        Authorization: wixToken,
        'x-wix-time-budget': '180000',
        'x-time-budget': '180000',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: promptObject }),
    });

    const data = await response.json();

    console.log('✅ API response received, status:', response.status);
    console.log('📊 Response data type:', typeof data);

    // Extract the generated text from the nested response structure
    let fileWriteResults: { filesWritten: string[]; errors: string[]; totalFiles: number } | null = null;
    if (data && data.response && data.response.generatedTexts && data.response.generatedTexts.length > 0) {
      const generatedText = data.response.generatedTexts[0];
      console.log('📄 Generated text length:', generatedText.length);
      console.log('📄 Generated text preview:', generatedText.substring(0, 200) + '...');

      // Parse and write files from the generated text
      fileWriteResults = parseAndWriteFiles(generatedText);
    } else {
      console.log('⚠️ No generated texts found in response structure');
    }

    return {
      data,
      fileWriteResults
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
    <title>Igor's Claude Backdoor 🕵️‍♂️</title>
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
            <h1>🕵️‍♂️ Igor's Claude Backdoor</h1>
            <p>Ask Claude to generate and write files to your project</p>
        </div>

        <div class="chat-area" id="chatArea">
            <div class="assistant-message message">
                <strong>Claude:</strong> Hello! I'm ready to help you generate and write files to your project. Just describe what you want me to create, and I'll generate the code and automatically save it to your filesystem.
            </div>
        </div>

        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Claude is thinking and writing files...</p>
        </div>

        <div class="input-area">
            <form class="input-form" id="promptForm">
                <input
                    type="text"
                    class="prompt-input"
                    id="promptInput"
                    placeholder="Ask Claude to create or modify files..."
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
                    let assistantResponse = '<strong>Claude:</strong> ';

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
                addMessage(\`<strong>Error:</strong> Failed to communicate with Claude: \${error.message}\`);
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
  console.log('🌟 === Igor\'s Claude Backdoor Activated ===');

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

    console.log('🔐 Getting WIX token...');
    const wixToken = getWixToken();
    if (!wixToken) {
      console.log('❌ No WIX token found');
      return new Response(JSON.stringify({
        error: 'WIX_TOKEN not found in ' + apiKeyPath,
        timestamp: new Date().toISOString(),
        debugInfo: {
          cwd: process.cwd(),
          expectedPath: apiKeyPath
        }
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    console.log('🤖 Processing Claude prompt...');
    const completion = await completePrompt(prompt, wixToken);

    const duration = Date.now() - startTime;
    console.log('✅ Igor\'s backdoor completed successfully in', duration, 'ms');

    return new Response(JSON.stringify({
      success: true,
      result: completion.data || 'no data',
      fileWriteResults: completion.fileWriteResults,
      backdoor: 'Igor was here 🕵️‍♂️',
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
      } else if (error.message.includes('@wix/http-client')) {
        errorDetails = 'HTTP client package not available - run: npm install @wix/http-client';
        statusCode = 500;
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
