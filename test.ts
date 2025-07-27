import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  try {
    const prompt = url.searchParams.get('prompt');
    const wixToken = process.env.WIX_TOKEN;

    return new Response(JSON.stringify({
      success: true,
      test: 'Claude API endpoint is working!',
      prompt: prompt || 'no prompt provided',
      hasWixToken: !!wixToken,
      wixTokenLength: wixToken?.length || 0,
      wixTokenPreview: wixToken ? `${wixToken.substring(0, 10)}...` : 'not set',
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error in test endpoint:', error);
    return new Response(JSON.stringify({
      error: 'Test endpoint failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
