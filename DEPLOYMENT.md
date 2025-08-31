# Deployment Guide for Vercel

This guide will walk you through deploying your Jira AI Triage System to Vercel.

## Prerequisites

1. **Node.js 18+** installed on your machine
2. **Git** repository set up
3. **Vercel account** (free at [vercel.com](https://vercel.com))
4. **API Keys** for Gemini and Claude

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Install Vercel CLI

```bash
npm install -g vercel
```

## Step 3: Login to Vercel

```bash
vercel login
```

Follow the browser prompts to authenticate.

## Step 4: Set Environment Variables

### Option A: Via Vercel CLI (Recommended)

```bash
# Set Gemini API Key
vercel env add GEMINI_API_KEY

# Set Claude API Key  
vercel env add CLAUDE_API_KEY
```

When prompted, enter your API keys.

### Option B: Via Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable:
   - `GEMINI_API_KEY` = your Gemini API key
   - `CLAUDE_API_KEY` = your Claude API key

## Step 5: Deploy

### First Deployment

```bash
vercel
```

Follow the prompts:
- Set up and deploy? → `Y`
- Which scope? → Select your account
- Link to existing project? → `N`
- Project name? → `jira-triage-api` (or your preferred name)
- Directory? → `./` (current directory)
- Override settings? → `N`

### Subsequent Deployments

```bash
vercel --prod
```

## Step 6: Verify Deployment

1. **Check the deployment URL** (e.g., `https://your-project.vercel.app`)
2. **Test the health endpoint**: `GET /api/health`
3. **Test the triage endpoint**: `POST /api/triage`

## Step 7: Configure Jira Webhook

1. In your Jira instance, go to **System** → **WebHooks**
2. Create a new webhook
3. Set the URL to: `https://your-project.vercel.app/api/triage`
4. Configure events (e.g., Issue Created, Issue Updated)
5. Test the webhook

## Environment Variables Reference

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes | `AIzaSyC...` |
| `CLAUDE_API_KEY` | Anthropic Claude API key | Yes | `sk-ant-...` |

## Testing Your Deployment

### 1. Health Check

```bash
curl https://your-project.vercel.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "services": {
    "gemini": {"available": true, "keyLength": 39},
    "claude": {"available": true, "keyLength": 51}
  }
}
```

### 2. Test Triage Endpoint

```bash
curl -X POST https://your-project.vercel.app/api/triage \
  -H "Content-Type: application/json" \
  -d '{
    "issue": {
      "key": "TEST-123",
      "fields": {
        "summary": "Test feature request",
        "description": "This is a test description",
        "priority": {"name": "Medium"},
        "reporter": {"displayName": "Test User"}
      }
    }
  }'
```

## Monitoring & Debugging

### Vercel Dashboard

- **Functions**: Monitor API performance
- **Logs**: View function execution logs
- **Analytics**: Track usage and performance

### Function Logs

```bash
vercel logs
```

### Real-time Logs

```bash
vercel logs --follow
```

## Troubleshooting

### Common Issues

1. **Environment Variables Not Set**
   - Verify variables are set in Vercel dashboard
   - Check variable names match exactly
   - Redeploy after setting variables

2. **API Key Errors**
   - Verify API keys are valid
   - Check API key permissions
   - Ensure keys are not expired

3. **Function Timeouts**
   - Default timeout is 10 seconds
   - Configure in `vercel.json` if needed
   - Optimize AI API calls

4. **CORS Issues**
   - CORS is enabled by default
   - Check webhook origin in Jira
   - Verify request headers

### Debug Commands

```bash
# Check environment variables
vercel env ls

# View project info
vercel ls

# Remove project
vercel remove

# Redeploy
vercel --prod
```

## Performance Optimization

### Function Configuration

Update `vercel.json` for better performance:

```json
{
  "functions": {
    "api/triage.js": {
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

### Cold Start Optimization

- Keep dependencies minimal
- Use environment variables efficiently
- Consider function warming strategies

## Security Considerations

1. **API Keys**: Never commit to Git
2. **CORS**: Configure allowed origins if needed
3. **Rate Limiting**: Consider implementing rate limits
4. **Input Validation**: Validate all webhook data

## Cost Optimization

- **Vercel Hobby**: Free tier with limitations
- **Vercel Pro**: $20/month for more features
- **Function Execution**: Monitor usage in dashboard
- **AI API Costs**: Track Gemini and Claude usage

## Next Steps

1. **Monitor Performance**: Use Vercel analytics
2. **Set Up Alerts**: Configure error notifications
3. **Scale**: Upgrade plan if needed
4. **Custom Domain**: Add custom domain if desired

## Support

- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Vercel Support**: [vercel.com/support](https://vercel.com/support)
- **GitHub Issues**: Open issue in your repository

## Example Deployment URLs

After deployment, your API will be available at:

- **Production**: `https://your-project.vercel.app/api/triage`
- **Preview**: `https://your-project-git-branch.vercel.app/api/triage`
- **Health**: `https://your-project.vercel.app/api/health`

Replace `your-project` with your actual Vercel project name.
