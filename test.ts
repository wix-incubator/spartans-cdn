import type { APIRoute } from 'astro';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHttpClient } from '@wix/http-client';

const AI_GW_BASE_URL = 'https://manage.wix.com';

const httpClient = createHttpClient({
  baseURL: AI_GW_BASE_URL,
});

const getWixToken = () => {
  try {
    const authPath = join(process.cwd(), '../root/.wix/auth/api-key.json');
    const authFile = readFileSync(authPath, 'utf8');
    const authData = JSON.parse(authFile);
    return authData.token;
  } catch (error) {
    console.error('Failed to read WIX token:', error);
    return null;
  }
};

const completePrompt = async (prompt: string, wixToken: string) => {
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

  console.log('making request to picasso ai gateway', promptObject);
  const response = await httpClient.request({
    url: 'https://manage.wix.com/_api/picasso-ai-gateway/v1/prompt',
    method: 'POST',
    headers: {
      Authorization: wixToken,
      'x-wix-time-budget': '180000',
      'x-time-budget': '180000',
    },
    data: {
      prompt: promptObject,
    },
  });

  return response;
};

export const GET: APIRoute = async ({ url }) => {
  try {
    const prompt = url.searchParams.get('prompt');

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt parameter' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const wixToken = getWixToken();
    if (!wixToken) {
      return new Response(JSON.stringify({ error: 'WIX_TOKEN not found in ../root/.wix/auth/api-key.json' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    console.log('Processing prompt:', prompt);
    const completion = await completePrompt(prompt, wixToken);

    return new Response(JSON.stringify({
      success: true,
      result: completion.data
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error processing Claude prompt:', error);
    return new Response(JSON.stringify({
      error: 'Failed to process prompt',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
