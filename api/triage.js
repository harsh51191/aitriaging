import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

// Initialize AI clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Configuration
const CONFIG = {
  AI_TRIAGE_STATUS_FIELD: 'customfield_10100',
  AI_TRIAGE_OUTCOME_FIELD: 'customfield_10101',
  AI_TRIAGE_NOTES_FIELD: 'customfield_10102'
};

// Logger class for tracking operations
class TriageLogger {
  constructor() {
    this.requestId = generateUUID();
    this.startTime = new Date();
    this.logs = [];
  }
  
  logAction(action, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      action: action,
      details: details
    };
    this.logs.push(logEntry);
    console.log(JSON.stringify(logEntry));
  }
  
  getProcessingTime() {
    const endTime = new Date();
    return endTime - this.startTime;
  }
}

// Generate UUID for request tracking
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Main API handler
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const logger = new TriageLogger();
  let issueKey = null;
  
  try {
    logger.logAction('WEBHOOK_RECEIVED', {
      contentLength: req.body ? JSON.stringify(req.body).length : 0,
      headers: req.headers
    });
    
    const data = req.body;
    issueKey = data.issue?.key;
    
    if (!issueKey) {
      throw new Error('No issue key provided in webhook');
    }
    
    logger.logAction('WEBHOOK_PARSED', {
      issueKey: issueKey,
      webhookEvent: data.webhookEvent
    });
    
    // Process the ticket with full triage logic
    const result = await processTicketWithFullTriage(issueKey, logger, data.issue);
    
    logger.logAction('PROCESSING_COMPLETE', result);
    
    const processingTime = logger.getProcessingTime();
    
    return res.status(200).json({
      status: 'success',
      requestId: logger.requestId,
      issueKey: issueKey,
      result: result,
      processingTime: processingTime
    });
      
  } catch (error) {
    logger.logAction('ERROR', { error: error.toString() });
    
    return res.status(500).json({
      status: 'error',
      requestId: logger.requestId,
      error: error.toString()
    });
  }
}

// Full triage processing function
async function processTicketWithFullTriage(issueKey, logger, issueData = null) {
  const result = {
    modelUsed: null,
    responseTime: 0,
    analysis: null,
    actions: []
  };
  
  try {
    // Step 1: Start processing
    logger.logAction('PROCESSING_START', { status: 'Starting' });
    result.actions.push('Started processing');
    
    // Step 2: Use provided issue data
    logger.logAction('USING_PROVIDED_DATA');
    const issue = issueData || { 
      key: issueKey,
      fields: {
        summary: "Test ticket",
        description: "Test description"
      }
    };
    
    logger.logAction('ISSUE_DATA_READY', {
      summary: issue.fields?.summary,
      reporter: issue.fields?.reporter?.displayName
    });
    
    // Step 3: Build comprehensive triage prompt
    const triagePrompt = buildComprehensiveTriagePrompt(issue, []);
    logger.logAction('PROMPT_BUILT', { promptLength: triagePrompt.length });
    
    // Step 4: Try Gemini first
    const aiStartTime = new Date();
    logger.logAction('TRYING_GEMINI');
    
    let analysis = await callGeminiWithTriage(triagePrompt, logger);
    
    if (analysis && analysis.scores) {
      result.modelUsed = 'Gemini Flash 2.0';
      logger.logAction('GEMINI_SUCCESS');
    } else {
      // Step 5: Fallback to Claude if Gemini fails
      logger.logAction('GEMINI_FAILED_TRYING_CLAUDE');
      analysis = await callClaudeWithTriage(triagePrompt, logger);
      
      if (analysis && analysis.scores) {
        result.modelUsed = 'Claude Sonnet';
        logger.logAction('CLAUDE_SUCCESS');
      } else {
        logger.logAction('BOTH_MODELS_FAILED');
      }
    }
    
    const aiEndTime = new Date();
    result.responseTime = aiEndTime - aiStartTime;
    result.analysis = analysis;
    
    // Step 6: Process results
    if (analysis && analysis.scores) {
      logger.logAction('ANALYSIS_COMPLETE', {
        modelUsed: result.modelUsed,
        responseTime: result.responseTime,
        recommendation: analysis.priority_recommendation,
        score: analysis.scores.overall_priority
      });
      result.actions.push('Analysis completed successfully');
    } else {
      logger.logAction('ANALYSIS_FAILED');
      result.actions.push('Analysis failed - manual review needed');
    }
    
    return result;
    
  } catch (error) {
    logger.logAction('PROCESS_ERROR', { error: error.toString() });
    throw error;
  }
}

// Comprehensive triage prompt builder
export function buildComprehensiveTriagePrompt(issue, similarTickets) {
  const similarText = similarTickets.length > 0
    ? similarTickets.map(t => 
        `- ${t.key}: ${t.fields.summary} (Status: ${t.fields.status.name})`
      ).join('\n')
    : 'No similar tickets found';
  
  return `You are a Product Triage Specialist analyzing feature requests for prioritization.
Your goal is to provide actionable recommendations for Product Managers.

TICKET DETAILS:
===============
Ticket Key: ${issue.key}
Title: ${issue.fields?.summary || 'No title provided'}
Description: ${issue.fields?.description || 'No description provided'}
Reporter: ${issue.fields?.reporter?.displayName || 'Unknown'}
Created: ${issue.fields?.created || 'Unknown'}
Priority: ${issue.fields?.priority?.name || 'Not set'}
Components: ${issue.fields?.components?.map(c => c.name).join(', ') || 'None'}
Labels: ${issue.fields?.labels?.join(', ') || 'None'}

SIMILAR TICKETS FOUND:
=====================
${similarText}

ANALYSIS FRAMEWORK:
==================

1. BUSINESS IMPACT ASSESSMENT (Score 0-100)
   Evaluate:
   - Number of clients affected (consider reporter's organization)
   - Revenue impact (retention risk, expansion opportunity)
   - Urgency indicators in description
   - Competitive disadvantage if not addressed
   - Strategic client importance

2. EFFORT ESTIMATION
   Classify as:
   - XS: 1-2 weeks (simple config/UI change)
   - S: 2-4 weeks (single service change)
   - M: 1-2 months (multiple services, moderate complexity)
   - L: 2-4 months (architectural changes, complex logic)
   - XL: 4+ months (platform changes, major overhaul)
   
   Consider:
   - Technical complexity described
   - Integration requirements
   - Testing complexity
   - Rollout complexity

3. STRATEGIC ALIGNMENT (Score 0-100)
   Assess:
   - Alignment with product direction
   - Technical debt implications
   - Platform capability enhancement
   - Market positioning improvement
   - Innovation vs optimization

4. CROSS-CLIENT VALUE (Score 0-100)
   Determine:
   - Client-specific vs broadly applicable
   - Potential adoption across customer base
   - Industry vertical applicability
   - Universal platform improvement

5. OVERALL PRIORITY CALCULATION
   Weighted average:
   - Business Impact: 35%
   - Strategic Alignment: 25%
   - Cross-Client Value: 25%
   - Effort (inverse): 15%

PRIORITY RECOMMENDATION RULES:
==============================
- Overall Priority 80-100: "Fast Track" (Critical priority, immediate action)
- Overall Priority 50-79: "Standard" (Normal triage queue)
- Overall Priority 25-49: "On Hold" (Low priority, revisit quarterly)
- Overall Priority 0-24: "Low" (Decline or defer indefinitely)

REQUIRED OUTPUT FORMAT (JSON):
=============================
Provide your analysis in this EXACT JSON structure:
{
  "scores": {
    "business_impact": <0-100>,
    "effort_size": "<XS|S|M|L|XL>",
    "effort_score": <0-100, where XS=100, S=80, M=60, L=40, XL=20>,
    "strategic_fit": <0-100>,
    "cross_client_value": <0-100>,
    "overall_priority": <calculated weighted average>
  },
  "priority_recommendation": "<Fast Track|Standard|On Hold|Low>",
  "key_insights": [
    "<specific insight about business value>",
    "<specific insight about implementation>",
    "<specific insight about strategic fit>"
  ],
  "risks": [
    "<primary risk if we build this>",
    "<primary risk if we don't build this>"
  ],
  "opportunities": [
    "<primary opportunity this enables>",
    "<secondary opportunity or benefit>"
  ],
  "similar_features": "<brief description of related existing features or similar tickets>",
  "recommended_next_steps": [
    "<immediate next step for PM>",
    "<validation or research needed>",
    "<stakeholder alignment required>"
  ],
  "executive_summary": "<2-3 sentence summary capturing the essence of this request and your recommendation>"
}

Ensure all JSON fields are populated. Be specific and actionable in your insights and recommendations.`;
}

// Gemini API call with triage
async function callGeminiWithTriage(prompt, logger) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const startTime = new Date();
    const result = await model.generateContent(prompt);
    const responseTime = new Date() - startTime;
    
    logger.logAction('GEMINI_RESPONSE', {
      responseTime: responseTime,
      hasContent: !!result.response
    });
    
    if (result.response) {
      const text = result.response.text();
      const parsed = parseAIResponse(text);
      
      if (parsed && parsed.scores) {
        logger.logAction('GEMINI_PARSE_SUCCESS', {
          recommendation: parsed.priority_recommendation,
          score: parsed.scores.overall_priority
        });
        return parsed;
      }
    }
    
    logger.logAction('GEMINI_FAILED', {
      response: result.response ? 'No valid content' : 'No response'
    });
    return null;
    
  } catch (error) {
    logger.logAction('GEMINI_ERROR', { error: error.toString() });
    return null;
  }
}

// Claude API call with triage (fallback)
async function callClaudeWithTriage(prompt, logger) {
  try {
    // Check if anthropic is properly imported
    if (!anthropic || !anthropic.messages) {
      logger.logAction('CLAUDE_IMPORT_ERROR', { 
        error: 'Anthropic SDK not properly imported',
        anthropicType: typeof anthropic,
        hasMessages: !!anthropic?.messages
      });
      return null;
    }
    
    const startTime = new Date();
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    });
    const responseTime = new Date() - startTime;
    
    logger.logAction('CLAUDE_RESPONSE', {
      responseTime: responseTime,
      hasContent: !!response.content
    });
    
    if (response.content && response.content[0] && response.content[0].text) {
      const parsed = parseAIResponse(response.content[0].text);
      
      if (parsed && parsed.scores) {
        logger.logAction('CLAUDE_PARSE_SUCCESS', {
          recommendation: parsed.priority_recommendation,
          score: parsed.scores.overall_priority
        });
        return parsed;
      }
    }
    
    logger.logAction('CLAUDE_FAILED', {
      response: response.content ? 'No valid content' : 'No response'
    });
    return null;
    
  } catch (error) {
    logger.logAction('CLAUDE_ERROR', { error: error.toString() });
    return null;
  }
}

// Parse AI response
export function parseAIResponse(text) {
  try {
    console.log('🔍 Raw AI Response:', text.substring(0, 500));
    
    // Extract JSON from response (handles markdown code blocks)
    let jsonStr = text;
    
    if (text.includes('```json')) {
      jsonStr = text.split('```json')[1].split('```')[0];
      console.log('📝 Extracted JSON from markdown code block');
    } else if (text.includes('```')) {
      jsonStr = text.split('```')[1].split('```')[0];
      console.log('📝 Extracted JSON from code block');
    } else {
      console.log('📝 Using raw text as JSON');
    }
    
    // Clean up the string
    jsonStr = jsonStr.trim();
    console.log('🧹 Cleaned JSON string:', jsonStr.substring(0, 200));
    
    // Parse JSON
    const parsed = JSON.parse(jsonStr);
    console.log('✅ JSON parsing successful');
    
    // Validate required fields
    if (!parsed.scores || !parsed.priority_recommendation) {
      console.error('❌ Missing required fields in AI response');
      console.error('Available fields:', Object.keys(parsed));
      return null;
    }
    
    // Calculate overall priority if missing
    if (!parsed.scores.overall_priority) {
      parsed.scores.overall_priority = calculateOverallPriority(parsed.scores);
      console.log('🧮 Calculated missing overall priority:', parsed.scores.overall_priority);
    }
    
    return parsed;
    
  } catch (error) {
    console.error('❌ Error parsing AI response:', error.message);
    console.error('🔍 Raw text that failed to parse:', text.substring(0, 1000));
    return null;
  }
}

// Calculate overall priority
export function calculateOverallPriority(scores) {
  // Weighted calculation
  const businessWeight = 0.35;
  const strategicWeight = 0.25;
  const crossClientWeight = 0.25;
  const effortWeight = 0.15;
  
  // Convert effort size to score
  const effortScores = {
    'XS': 100,
    'S': 80,
    'M': 60,
    'L': 40,
    'XL': 20
  };
  
  const effortScore = scores.effort_score || effortScores[scores.effort_size] || 50;
  
  const overall = 
    (scores.business_impact || 0) * businessWeight +
    (scores.strategic_fit || 0) * strategicWeight +
    (scores.cross_client_value || 0) * crossClientWeight +
    effortScore * effortWeight;
  
  return Math.round(overall);
}

// Health check endpoint
export async function healthCheck(req, res) {
  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      gemini: !!process.env.GEMINI_API_KEY,
      claude: !!process.env.CLAUDE_API_KEY
    }
  });
}