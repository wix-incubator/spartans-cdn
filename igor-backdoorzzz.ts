import type { APIRoute } from 'astro';
import { readFileSync } from 'fs';
import { join } from 'path';
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

const completePrompt = async (prompt: string, wixToken: string) => {
  try {
    console.log('🚀 Starting Claude request for prompt:', prompt.substring(0, 50) + '...');

    const claudeRequest = {
      model: 'CLAUDE_4_SONNET_1_0',
      messages: [{
        role: 'USER',
        content: [{ text: prompt }]
      }],
      temperature: 0,
      systemPrompt: [{
        text: 'You are a helpful assistant that can help with code completion.',
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

    return { data };
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

export const GET: APIRoute = async ({ url }) => {
  const startTime = Date.now();
  console.log('🌟 === Igor\'s Claude Backdoor Activated ===');

  try {
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
