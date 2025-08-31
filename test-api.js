#!/usr/bin/env node

/**
 * Test script for the Jira AI Triage API
 * Run with: node test-api.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3000/api/triage';

// Sample test data
const testCases = [
  {
    name: "Enterprise Feature Request",
    data: {
      issue: {
        key: "PROJ-123",
        fields: {
          summary: "Add bulk import feature for customer data",
          description: "Enterprise clients need to import large CSV files with customer data. Current manual entry is too slow for their needs. This feature would significantly improve customer satisfaction and reduce data entry errors.",
          priority: { name: "High" },
          reporter: { displayName: "Sarah Johnson" },
          created: "2024-01-15T10:30:00.000Z",
          components: [{ name: "Data Management" }],
          labels: ["enterprise", "customer-request", "high-priority"],
          status: { name: "Open" }
        }
      },
      webhookEvent: "jira:issue_created"
    }
  },
  {
    name: "Simple UI Enhancement",
    data: {
      issue: {
        key: "PROJ-124",
        fields: {
          summary: "Add dark mode toggle to user preferences",
          description: "Users have requested a dark mode option for better visibility in low-light environments. This would be a simple UI enhancement.",
          priority: { name: "Medium" },
          reporter: { displayName: "John Doe" },
          created: "2024-01-15T11:00:00.000Z",
          components: [{ name: "User Interface" }],
          labels: ["ui", "user-request", "enhancement"],
          status: { name: "Open" }
        }
      },
      webhookEvent: "jira:issue_created"
    }
  },
  {
    name: "Critical Bug Fix",
    data: {
      issue: {
        key: "PROJ-125",
        fields: {
          summary: "Fix critical security vulnerability in authentication",
          description: "Security audit revealed a critical vulnerability in the authentication system that could allow unauthorized access. Immediate fix required.",
          priority: { name: "Critical" },
          reporter: { displayName: "Security Team" },
          created: "2024-01-15T12:00:00.000Z",
          components: [{ name: "Security" }],
          labels: ["security", "critical", "bug"],
          status: { name: "Open" }
        }
      },
      webhookEvent: "jira:issue_created"
    }
  }
];

async function testAPI() {
  console.log('🚀 Testing Jira AI Triage API\n');
  console.log(`API URL: ${API_URL}\n`);
  
  for (const testCase of testCases) {
    console.log(`📋 Test Case: ${testCase.name}`);
    console.log(`Ticket: ${testCase.data.issue.key}`);
    console.log(`Summary: ${testCase.data.issue.fields.summary}`);
    console.log('─'.repeat(80));
    
    try {
      const startTime = Date.now();
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testCase.data)
      });
      
      const responseTime = Date.now() - startTime;
      const result = await response.json();
      
      if (response.ok) {
        console.log('✅ Success!');
        console.log(`⏱️  Response Time: ${responseTime}ms`);
        console.log(`🆔 Request ID: ${result.requestId}`);
        console.log(`🤖 Model Used: ${result.result?.modelUsed || 'Unknown'}`);
        
        if (result.result?.analysis) {
          const analysis = result.result.analysis;
          console.log(`📊 Priority: ${analysis.priority_recommendation}`);
          console.log(`🎯 Overall Score: ${analysis.scores?.overall_priority}/100`);
          console.log(`⚡ Effort: ${analysis.scores?.effort_size}`);
          console.log(`💡 Executive Summary: ${analysis.executive_summary?.substring(0, 100)}...`);
        }
      } else {
        console.log('❌ Failed!');
        console.log(`Status: ${response.status}`);
        console.log(`Error: ${result.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.log('❌ Error!');
      console.log(`Error: ${error.message}`);
    }
    
    console.log('\n' + '─'.repeat(80) + '\n');
  }
  
  // Test health endpoint
  console.log('🏥 Testing Health Endpoint');
  try {
    const healthUrl = API_URL.replace('/triage', '/health');
    const response = await fetch(healthUrl);
    const health = await response.json();
    
    if (response.ok) {
      console.log('✅ Health Check Passed');
      console.log(`Status: ${health.status}`);
      console.log(`Gemini: ${health.services.gemini.available ? '✅' : '❌'}`);
      console.log(`Claude: ${health.services.claude.available ? '✅' : '❌'}`);
    } else {
      console.log('❌ Health Check Failed');
      console.log(`Status: ${health.status}`);
    }
  } catch (error) {
    console.log('❌ Health Check Error:', error.message);
  }
}

// Run tests
if (require.main === module) {
  testAPI().catch(console.error);
}

module.exports = { testAPI, testCases };
