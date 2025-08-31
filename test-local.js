#!/usr/bin/env node

/**
 * Local Testing Script for Jira AI Triage Logic
 * This script tests the triage functions directly without HTTP requests
 * Run with: node test-local.js
 */

// Import the triage functions directly
import { buildComprehensiveTriagePrompt, parseAIResponse, calculateOverallPriority } from './api/triage.js';

// Mock test data
const testCases = [
  {
    name: "Enterprise Feature Request",
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
    }
  },
  {
    name: "Simple UI Enhancement",
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
    }
  },
  {
    name: "Critical Bug Fix",
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
    }
  }
];

// Test prompt building
function testPromptBuilding() {
  console.log('🧪 Testing Prompt Building\n');
  
  for (const testCase of testCases) {
    console.log(`📋 Test Case: ${testCase.name}`);
    console.log(`Ticket: ${testCase.issue.key}`);
    console.log(`Summary: ${testCase.issue.fields.summary}`);
    
    try {
      const prompt = buildComprehensiveTriagePrompt(testCase.issue, []);
      console.log(`✅ Prompt generated successfully`);
      console.log(`📏 Prompt length: ${prompt.length} characters`);
      console.log(`🔍 Contains ticket details: ${prompt.includes(testCase.issue.key) ? '✅' : '❌'}`);
      console.log(`🔍 Contains summary: ${prompt.includes(testCase.issue.fields.summary) ? '✅' : '❌'}`);
      console.log(`🔍 Contains analysis framework: ${prompt.includes('ANALYSIS FRAMEWORK') ? '✅' : '❌'}`);
      console.log(`🔍 Contains JSON format: ${prompt.includes('REQUIRED OUTPUT FORMAT') ? '✅' : '❌'}`);
    } catch (error) {
      console.log(`❌ Prompt generation failed: ${error.message}`);
    }
    
    console.log('─'.repeat(80) + '\n');
  }
}

// Test response parsing
function testResponseParsing() {
  console.log('🧪 Testing Response Parsing\n');
  
  const mockResponses = [
    {
      name: "Valid JSON Response",
      text: `Here's my analysis:

\`\`\`json
{
  "scores": {
    "business_impact": 85,
    "effort_size": "M",
    "effort_score": 60,
    "strategic_fit": 75,
    "cross_client_value": 80,
    "overall_priority": 78
  },
  "priority_recommendation": "Standard",
  "key_insights": ["High business impact", "Moderate effort"],
  "risks": ["Complexity in implementation"],
  "opportunities": ["Platform improvement"],
  "similar_features": "Existing CSV export",
  "recommended_next_steps": ["Validate requirements"],
  "executive_summary": "This feature addresses critical needs."
}
\`\`\``
    },
    {
      name: "Response with Markdown",
      text: `Analysis complete:

\`\`\`json
{"scores":{"business_impact":90,"effort_size":"S","effort_score":80,"strategic_fit":85,"cross_client_value":70,"overall_priority":82},"priority_recommendation":"Fast Track","key_insights":["Critical business need"],"risks":["None identified"],"opportunities":["Market advantage"],"similar_features":"None","recommended_next_steps":["Immediate development"],"executive_summary":"High priority feature."}
\`\`\``
    },
    {
      name: "Invalid Response",
      text: "Sorry, I couldn't analyze this properly."
    }
  ];
  
  for (const mockResponse of mockResponses) {
    console.log(`📋 Test Case: ${mockResponse.name}`);
    
    try {
      const parsed = parseAIResponse(mockResponse.text);
      
      if (parsed && parsed.scores) {
        console.log(`✅ Parsing successful`);
        console.log(`📊 Priority: ${parsed.priority_recommendation}`);
        console.log(`🎯 Overall Score: ${parsed.scores.overall_priority}/100`);
        console.log(`⚡ Effort: ${parsed.scores.effort_size}`);
      } else {
        console.log(`❌ Parsing failed - missing required fields`);
      }
    } catch (error) {
      console.log(`❌ Parsing error: ${error.message}`);
    }
    
    console.log('─'.repeat(80) + '\n');
  }
}

// Test priority calculation
function testPriorityCalculation() {
  console.log('🧪 Testing Priority Calculation\n');
  
  const testScores = [
    {
      name: "High Priority Case",
      scores: {
        business_impact: 90,
        effort_size: "S",
        strategic_fit: 85,
        cross_client_value: 80
      }
    },
    {
      name: "Medium Priority Case", 
      scores: {
        business_impact: 60,
        effort_size: "M",
        strategic_fit: 70,
        cross_client_value: 65
      }
    },
    {
      name: "Low Priority Case",
      scores: {
        business_impact: 30,
        effort_size: "L",
        strategic_fit: 40,
        cross_client_value: 35
      }
    }
  ];
  
  for (const testCase of testScores) {
    console.log(`📋 Test Case: ${testCase.name}`);
    console.log(`📊 Scores:`, testCase.scores);
    
    try {
      const overallPriority = calculateOverallPriority(testCase.scores);
      console.log(`🎯 Calculated Priority: ${overallPriority}/100`);
      
      // Determine recommendation
      let recommendation = "Low";
      if (overallPriority >= 80) recommendation = "Fast Track";
      else if (overallPriority >= 50) recommendation = "Standard";
      else if (overallPriority >= 25) recommendation = "On Hold";
      
      console.log(`📋 Recommendation: ${recommendation}`);
    } catch (error) {
      console.log(`❌ Calculation error: ${error.message}`);
    }
    
    console.log('─'.repeat(80) + '\n');
  }
}

// Test environment variables
function testEnvironmentVariables() {
  console.log('🧪 Testing Environment Variables\n');
  
  const requiredVars = [
    'GEMINI_API_KEY',
    'CLAUDE_API_KEY'
  ];
  
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (value) {
      console.log(`✅ ${varName}: Set (${value.length} characters)`);
      console.log(`   Preview: ${value.substring(0, 10)}...`);
    } else {
      console.log(`❌ ${varName}: Not set`);
    }
  }
  
  console.log('\n💡 To set environment variables:');
  console.log('   export GEMINI_API_KEY="your_key_here"');
  console.log('   export CLAUDE_API_KEY="your_key_here"');
  console.log('─'.repeat(80) + '\n');
}

// Main test function
async function runLocalTests() {
  console.log('🚀 Jira AI Triage System - Local Testing');
  console.log('==========================================\n');
  
  try {
    // Test environment variables first
    testEnvironmentVariables();
    
    // Test core functions
    testPromptBuilding();
    testResponseParsing();
    testPriorityCalculation();
    
    console.log('✅ All local tests completed!');
    console.log('\n💡 Next steps:');
    console.log('1. Set your API keys as environment variables');
    console.log('2. Deploy to Vercel: npm run deploy');
    console.log('3. Test the live endpoints');
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runLocalTests().catch(console.error);
}

export { runLocalTests };
