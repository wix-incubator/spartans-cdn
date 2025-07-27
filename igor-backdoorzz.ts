import { readFileSync } from 'fs';
import { join } from 'path';
import { createHttpClient } from '@wix/http-client';

const AI_GW_BASE_URL = 'https://manage.wix.com';

const httpClient = createHttpClient({
  baseURL: AI_GW_BASE_URL,
});

const getWixToken = () => {
  try {
    console.log('🔍 Attempting to read WIX token...');
    const authPath = join(process.cwd(), '../root/.wix/auth/api-key.json');
    console.log('📁 Auth path:', authPath);

    const authFile = readFileSync(authPath, 'utf8');
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
    return null;
  }
};

const testClaudeCall = async (wixToken: string) => {
  try {
    console.log('🚀 Making test Claude API call...');

    const claudeRequest = {
      model: 'CLAUDE_4_SONNET_1_0',
      messages: [{
        role: 'USER',
        content: [{ text: 'Say hello' }]
      }],
      temperature: 0,
      systemPrompt: [{
        text: 'You are a helpful assistant.',
      }],
    };

    const promptObject = {
      googleAnthropicClaudeRequest: claudeRequest,
    };

    console.log('📡 Making request to picasso ai gateway...');

    const response = await httpClient.request({
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
    });

    console.log('✅ API response received, status:', response.status);
    return response;
  } catch (error) {
    console.error('❌ Claude API call failed:', error);
    throw error;
  }
};

export const GET = async ({ url }) => {
  try {
    console.log('🔍 Debug endpoint with Claude API test');

    const wixToken = getWixToken();
    if (!wixToken) {
      return new Response(JSON.stringify({
        error: 'No token found',
        details: 'Could not read WIX token from file'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('🤖 Testing Claude API call...');
    const claudeResponse = await testClaudeCall(wixToken);

    return new Response(JSON.stringify({
      success: true,
      message: 'Token reading and Claude API both work!',
      tokenLength: wixToken.length,
      claudeStatus: claudeResponse.status,
      claudeResponse: claudeResponse.data,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('❌ Debug endpoint failed:', error);
    return new Response(JSON.stringify({
      error: 'Debug endpoint failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3) : undefined
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
