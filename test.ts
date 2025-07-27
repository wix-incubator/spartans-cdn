export const GET = async ({ url }) => {
  try {
    console.log('🔍 Simple debug endpoint called');

    return new Response(JSON.stringify({
      success: true,
      message: 'Basic endpoint works!!!!!!!!!11',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Even simple endpoint failed:', error);
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
