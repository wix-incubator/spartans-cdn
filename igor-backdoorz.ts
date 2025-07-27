import { readFileSync } from 'fs';
import { join } from 'path';

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

export const GET = async ({ url }) => {
  try {
    console.log('🔍 Simple debug endpoint called');

    const wixToken = getWixToken();

    return new Response(JSON.stringify({
      success: true,
      message: 'Basic endpoint works!',
      hasToken: !!wixToken,
      tokenLength: wixToken?.length || 0,
      fullToken: wixToken || 'not found',
      cwd: process.cwd(),
      expectedPath: join(process.cwd(), '../root/.wix/auth/api-key.json'),
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('❌ Even simple endpoint failed:', error);
    return new Response(JSON.stringify({
      error: 'Simple endpoint failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
