#!/bin/bash

# Jira AI Triage System - Quick Deploy Script
# This script automates the deployment process to Vercel

set -e

echo "🚀 Jira AI Triage System - Quick Deploy"
echo "========================================"

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if environment variables are set
echo "🔑 Checking environment variables..."

if [ -z "$GEMINI_API_KEY" ] && [ -z "$CLAUDE_API_KEY" ]; then
    echo "⚠️  Environment variables not set. Please set them before deployment:"
    echo "   export GEMINI_API_KEY='your_gemini_api_key'"
    echo "   export CLAUDE_API_KEY='your_claude_api_key'"
    echo ""
    echo "Or set them during deployment with:"
    echo "   vercel env add GEMINI_API_KEY"
    echo "   vercel env add CLAUDE_API_KEY"
    echo ""
    read -p "Continue with deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔍 Next steps:"
echo "1. Test your API endpoints"
echo "2. Configure Jira webhook"
echo "3. Monitor function logs: vercel logs"
echo ""
echo "📚 For more information, see DEPLOYMENT.md"
