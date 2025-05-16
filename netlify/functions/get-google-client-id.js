exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    
    if (!clientId) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Google Client ID not configured'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clientId })
    };
  } catch (error) {
    console.error('Error in get-google-client-id:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error'
      })
    };
  }
}; 