#!/usr/bin/env node

/**
 * Test Claude API deployment
 */

import Anthropic from '@anthropic-ai/sdk';

async function testClaude() {
  console.log('🧪 Testing Claude API...');
  
  // Check if API key is set
  if (!process.env.CLAUDE_API_KEY) {
    console.log('❌ CLAUDE_API_KEY not set');
    console.log('💡 Set it with: export CLAUDE_API_KEY="your_key"');
    return;
  }
  
  try {
    const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    
    console.log('✅ Claude client created successfully');
    
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Respond with just "OK" if you receive this message.' }]
    });
    
    console.log('✅ Claude API call successful');
    console.log('📝 Response:', response.content[0].text);
    
  } catch (error) {
    console.log('❌ Claude API Error:', error.message);
    console.log('🔍 Full error:', error);
  }
}

// Run test
testClaude().catch(console.error);
