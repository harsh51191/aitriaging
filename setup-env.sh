#!/bin/bash

# Environment Setup Script for Jira AI Triage System
# This script helps you set up environment variables for local testing

echo "🔑 Jira AI Triage System - Environment Setup"
echo "============================================="

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "✅ .env.local file found"
    echo "📖 Current environment variables:"
    source .env.local
    echo "   GEMINI_API_KEY: ${GEMINI_API_KEY:0:10}..."
    echo "   CLAUDE_API_KEY: ${CLAUDE_API_KEY:0:10}..."
else
    echo "❌ .env.local file not found"
    echo "💡 Creating .env.local template..."
    
    cat > .env.local << EOF
# Jira AI Triage System Environment Variables
# Replace with your actual API keys

# Google Gemini API Key
# Get from: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Anthropic Claude API Key  
# Get from: https://console.anthropic.com/
CLAUDE_API_KEY=your_claude_api_key_here
EOF

    echo "✅ .env.local template created"
    echo "📝 Please edit .env.local and add your actual API keys"
fi

echo ""
echo "🚀 Next steps:"
echo "1. Edit .env.local with your API keys"
echo "2. Test locally: npm run test-local"
echo "3. Deploy to Vercel: npm run deploy"
echo ""
echo "💡 To load environment variables in current shell:"
echo "   source .env.local"
echo ""
echo "💡 To test if environment is loaded:"
echo "   npm run test-local"
