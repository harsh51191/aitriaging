import express from 'express';
import triageHandler from './api/triage.js';
import { healthCheck } from './api/triage.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Health endpoint
app.get('/api/health', async (req, res) => {
  try {
    await healthCheck(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Triage endpoint
app.post('/api/triage', async (req, res) => {
  try {
    await triageHandler(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Root endpoint with instructions
app.get('/', (req, res) => {
  res.json({
    message: 'Jira AI Triage API - Local Server',
    endpoints: {
      'GET /api/health': 'Health check and status',
      'POST /api/triage': 'AI triage analysis',
      'GET /': 'This help message'
    },
    testing: {
      'Local URL': `http://localhost:${PORT}`,
      'Health Check': `http://localhost:${PORT}/api/health`,
      'Triage Test': `POST http://localhost:${PORT}/api/triage`
    },
    instructions: 'Use Postman to test the triage endpoint with the sample JSON from the README',
    sampleRequest: {
      method: 'POST',
      url: `/api/triage`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        issue: {
          key: "PROJ-123",
          fields: {
            summary: "Add bulk import feature for customer data",
            description: "Enterprise clients need to import large CSV files...",
            priority: { name: "High" },
            reporter: { displayName: "Sarah Johnson" }
          }
        }
      }
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Jira AI Triage API - Local Server Running');
  console.log('=============================================');
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🤖 Triage Endpoint: POST http://localhost:${PORT}/api/triage`);
  console.log('');
  console.log('💡 Test with Postman using the sample JSON from README.md');
  console.log('💡 Make sure to set GEMINI_API_KEY and CLAUDE_API_KEY environment variables');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
});

export default app;
