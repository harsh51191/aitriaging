#!/usr/bin/env node

/**
 * Test AI APIs directly to debug the issue
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function testGemini() {
  console.log('🧪 Testing Gemini API...');
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const prompt = 'Respond with just "OK" if you receive this message.';
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    console.log('✅ Gemini Response:', text);
    return text;
  } catch (error) {
    console.log('❌ Gemini Error:', error.message);
    return null;
  }
}

async function testClaude() {
  console.log('🧪 Testing Claude API...');
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Respond with just "OK" if you receive this message.' }]
    });
    
    const text = response.content[0].text;
    console.log('✅ Claude Response:', text);
    return text;
  } catch (error) {
    console.log('❌ Claude Error:', error.message);
    return null;
  }
}

async function testTriagePrompt() {
  console.log('🧪 Testing Triage Prompt...');
  
  const testIssue = {
    key: "TEST-123",
    fields: {
      summary: "Test feature request",
      description: "This is a test description for validation",
      priority: { name: "Medium" },
      reporter: { displayName: "Test User" }
    }
  };
  
  try {
    // Test Gemini with triage prompt
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const prompt = `Analyze this feature request and return JSON with scores and recommendations:

Ticket: ${testIssue.key}
Summary: ${testIssue.fields.summary}
Description: ${testIssue.fields.description}

Return JSON with this structure:
{
  "scores": {
    "business_impact": 75,
    "effort_size": "S",
    "effort_score": 80,
    "strategic_fit": 70,
    "cross_client_value": 65,
    "overall_priority": 72
  },
  "priority_recommendation": "Standard",
  "key_insights": ["Test insight"],
  "risks": ["Test risk"],
  "opportunities": ["Test opportunity"],
  "similar_features": "None",
  "recommended_next_steps": ["Test step"],
  "executive_summary": "Test summary"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    console.log('✅ Gemini Triage Response:');
    console.log(text.substring(0, 500) + '...');
    
    // Try to parse JSON
    try {
      const parsed = JSON.parse(text);
      console.log('✅ JSON Parsing Successful');
      console.log('Priority:', parsed.priority_recommendation);
      console.log('Score:', parsed.scores?.overall_priority);
    } catch (parseError) {
      console.log('❌ JSON Parsing Failed:', parseError.message);
      console.log('Raw response preview:', text.substring(0, 200));
    }
    
  } catch (error) {
    console.log('❌ Gemini Triage Error:', error.message);
  }
}

async function main() {
  console.log('🚀 Testing AI APIs for Jira Triage System\n');
  
  // Check environment variables
  console.log('🔑 Environment Variables:');
  console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Not set');
  console.log('CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? '✅ Set' : '❌ Not set');
  console.log('');
  
  if (!process.env.GEMINI_API_KEY || !process.env.CLAUDE_API_KEY) {
    console.log('❌ Please set both API keys as environment variables');
    return;
  }
  
  // Test basic API functionality
  await testGemini();
  console.log('');
  await testClaude();
  console.log('');
  
  // Test triage prompt
  await testTriagePrompt();
}

main().catch(console.error);
