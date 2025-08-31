export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        gemini: {
          available: !!process.env.GEMINI_API_KEY,
          keyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0
        },
        claude: {
          available: !!process.env.CLAUDE_API_KEY,
          keyLength: process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.length : 0
        }
      },
      version: '1.0.0'
    };

    // Check if all required services are available
    const allServicesAvailable = healthStatus.services.gemini.available && 
                                healthStatus.services.claude.available;
    
    healthStatus.status = allServicesAvailable ? 'healthy' : 'degraded';
    
    const statusCode = allServicesAvailable ? 200 : 503;
    
    return res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    return res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}
