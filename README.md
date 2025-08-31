# Jira AI Triage System

An intelligent ticket triage system that uses AI (Gemini and Claude) to automatically analyze and prioritize Jira tickets based on business impact, effort estimation, strategic alignment, and cross-client value.

## Features

- 🤖 **Dual AI Models**: Primary Gemini Flash 2.0 with Claude Sonnet fallback
- 📊 **Comprehensive Scoring**: Business impact, effort, strategic fit, and cross-client value
- 🎯 **Smart Prioritization**: Fast Track, Standard, On Hold, or Low priority recommendations
- 📝 **Detailed Analysis**: Executive summary, key insights, risks, and opportunities
- 🔄 **Automatic Fallback**: Seamless switching between AI services
- 📊 **Request Logging**: Complete audit trail with request IDs and processing times
- 🌐 **Vercel Ready**: Optimized for serverless deployment

## Architecture

```
Jira Webhook → Vercel API → AI Analysis → Response
                ↓
        Gemini (Primary) → Claude (Fallback)
                ↓
        Priority Scoring + Recommendations
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file (for local development):

```bash
GEMINI_API_KEY=your_gemini_api_key_here
CLAUDE_API_KEY=your_claude_api_key_here
```

### 3. Get API Keys

- **Gemini API Key**: [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Claude API Key**: [Anthropic Console](https://console.anthropic.com/)

## Local Development

```bash
npm run dev
```

The API will be available at `http://localhost:3000/api/triage`

## Deployment to Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Deploy

```bash
npm run deploy
```

### 3. Set Environment Variables

```bash
vercel env add GEMINI_API_KEY
vercel env add CLAUDE_API_KEY
```

## API Usage

### Endpoint

`POST /api/triage`

### Request Body

```json
{
  "issue": {
    "key": "PROJ-123",
    "fields": {
      "summary": "Add bulk import feature for customer data",
      "description": "Enterprise clients need to import large CSV files with customer data. Current manual entry is too slow for their needs.",
      "priority": { "name": "High" },
      "reporter": { "displayName": "Sarah Johnson" },
      "created": "2024-01-15T10:30:00.000Z",
      "components": [{ "name": "Data Management" }],
      "labels": ["enterprise", "customer-request"],
      "status": { "name": "Open" }
    }
  },
  "webhookEvent": "jira:issue_created"
}
```

### Response Format

```json
{
  "status": "success",
  "requestId": "uuid-here",
  "issueKey": "PROJ-123",
  "processingTime": 2500,
  "result": {
    "modelUsed": "Gemini Flash 2.0",
    "responseTime": 2000,
    "analysis": {
      "scores": {
        "business_impact": 85,
        "effort_size": "M",
        "effort_score": 60,
        "strategic_fit": 75,
        "cross_client_value": 80,
        "overall_priority": 78
      },
      "priority_recommendation": "Standard",
      "key_insights": [
        "High business impact due to enterprise client needs",
        "Moderate effort with clear technical requirements",
        "Aligns with data management platform strategy"
      ],
      "risks": [
        "Complexity in handling large file uploads",
        "Risk of losing enterprise clients to competitors"
      ],
      "opportunities": [
        "Platform improvement for all customers",
        "Competitive advantage in enterprise segment"
      ],
      "similar_features": "Existing CSV export functionality can be extended",
      "recommended_next_steps": [
        "Validate file size limits with engineering",
        "Research competitor bulk import capabilities",
        "Get stakeholder approval for M effort level"
      ],
      "executive_summary": "This enterprise-focused bulk import feature addresses critical customer needs with moderate development effort. The high business impact and strategic alignment make it a strong candidate for the standard development queue."
    },
    "actions": [
      "Started processing",
      "Analysis completed successfully"
    ]
  }
}
```

## Priority Scoring System

### Overall Priority Calculation

- **Business Impact**: 35% weight
- **Strategic Alignment**: 25% weight  
- **Cross-Client Value**: 25% weight
- **Effort (inverse)**: 15% weight

### Priority Recommendations

- **80-100**: Fast Track (Critical priority, immediate action)
- **50-79**: Standard (Normal triage queue)
- **25-49**: On Hold (Low priority, revisit quarterly)
- **0-24**: Low (Decline or defer indefinitely)

### Effort Sizing

- **XS**: 1-2 weeks (simple config/UI change)
- **S**: 2-4 weeks (single service change)
- **M**: 1-2 months (multiple services, moderate complexity)
- **L**: 2-4 months (architectural changes, complex logic)
- **XL**: 4+ months (platform changes, major overhaul)

## Error Handling

The system includes comprehensive error handling:

- **AI Service Failures**: Automatic fallback between Gemini and Claude
- **Invalid Responses**: JSON parsing with fallback calculations
- **Missing Data**: Graceful degradation with default values
- **Request Tracking**: Unique request IDs for debugging

## Logging

All operations are logged with:

- Timestamp
- Request ID
- Action performed
- Processing details
- Response times
- Error information

## Testing

### Test with Mock Data

```bash
curl -X POST http://localhost:3000/api/triage \
  -H "Content-Type: application/json" \
  -d '{
    "issue": {
      "key": "TEST-123",
      "fields": {
        "summary": "Test feature request",
        "description": "This is a test description for validation",
        "priority": {"name": "Medium"},
        "reporter": {"displayName": "Test User"}
      }
    }
  }'
```

## Monitoring

### Health Check

`GET /api/health` - Check service status and API key availability

### Vercel Analytics

Monitor performance and usage through Vercel dashboard:
- Function execution times
- Error rates
- Request volumes
- Cold start performance

## Security

- CORS enabled for webhook integration
- Environment variable protection
- Request validation
- Error message sanitization

## Troubleshooting

### Common Issues

1. **API Key Errors**: Verify environment variables are set correctly
2. **Timeout Issues**: Check Vercel function duration limits
3. **JSON Parsing Errors**: Ensure AI responses are properly formatted
4. **CORS Issues**: Verify webhook origin configuration

### Debug Mode

Enable detailed logging by checking the Vercel function logs:

```bash
vercel logs
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the troubleshooting section
- Review Vercel function logs
- Open a GitHub issue
