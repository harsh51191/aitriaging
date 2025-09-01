import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

// Initialize AI clients with proper error checking
let genAI = null;
let anthropic = null;

try {
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('✅ Gemini client initialized');
  } else {
    console.log('❌ GEMINI_API_KEY not set');
  }
} catch (error) {
  console.error('❌ Failed to initialize Gemini client:', error.message);
}

try {
  if (process.env.CLAUDE_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    console.log('✅ Claude client initialized');
  } else {
    console.log('❌ CLAUDE_API_KEY not set');
  }
} catch (error) {
  console.error('❌ Failed to initialize Claude client:', error.message);
}

// Simple rate limiting (in-memory, resets on function restart)
const requestCounts = new Map();
const RATE_LIMIT = 10; // Max requests per minute per IP
const RATE_WINDOW = 60000; // 1 minute in milliseconds

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW;
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }
  
  const requests = requestCounts.get(ip);
  const recentRequests = requests.filter(time => time > windowStart);
  
  if (recentRequests.length >= RATE_LIMIT) {
    return false; // Rate limited
  }
  
  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);
  return true; // Allowed
}

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

  // Rate limiting
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60
    });
  }

  const logger = new TriageLogger();
  let issueKey = null;
  
  try {
    // Log the complete request body
    console.log('📥 RECEIVED REQUEST:');
    console.log('Client IP:', clientIP);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Body length:', JSON.stringify(req.body).length);
    console.log('---');
    
    logger.logAction('WEBHOOK_RECEIVED', {
      clientIP: clientIP,
      contentLength: req.body ? JSON.stringify(req.body).length : 0,
      headers: req.headers,
      body: req.body  // Log the actual request body
    });
    
    const data = req.body;
    issueKey = data.issue?.key;
    
    if (!issueKey) {
      throw new Error('No issue key provided in webhook');
    }
    
    logger.logAction('WEBHOOK_PARSED', {
      issueKey: issueKey,
      webhookEvent: data.webhookEvent,
      fullData: data  // Log the complete parsed data
    });
    
    // Process the ticket with full triage logic
    const result = await processTicketWithFullTriage(issueKey, logger, data.issue);
    
    logger.logAction('PROCESSING_COMPLETE', result);
    
    const processingTime = logger.getProcessingTime();
    
    // Prepare Jira-friendly response format
    const recommendation = result.analysis?.priority_recommendation || 'On Hold';
    const importance = result.analysis?.scores?.overall_priority ?? 0;
    const classification = classifyBugOrFeature(data.issue);
    const themes = result.theme ? [result.theme] : [];
    const similarity_group = generateSimilarityGroup(result.analysis, result.theme);
    const confidence = result.analysis ? 0.75 : 0.0;
    const notes = result.analysis?.executive_summary || '';

    return res.status(200).json({
      // Top-level fields for Jira Automation (easy mapping):
      recommendation,                     // "Fast Track" | "Standard" | "On Hold" | "Low"
      classification,                     // "Feature" | "Bug"
      themes,                             // ["Analytics & Reporting - Core Analytics"]
      similarity_group,                   // "SIM-042"
      duplicate_keys: [],                 // [] for now, or fill from your own logic
      importance,                         // 0–100
      confidence,                         // 0.0-1.0
      notes,                              // Executive summary for Jira

      // Keep your original metadata (optional):
      status: 'success',
      requestId: logger.requestId,
      issueKey: issueKey,
      result: {
        // Maintain backward compatibility
        modelUsed: `${result.themeModel || 'Unknown'} (Theme) + ${result.priorityModel || 'Unknown'} (Priority)`,
        responseTime: result.responseTime,
        analysis: result.analysis,
        actions: result.actions,
        
        // New fields (additive, not breaking)
        theme: result.theme,
        themeModel: result.themeModel,
        priorityModel: result.analysis?.modelUsed,
        modelSummary: {
          themeClassification: result.themeModel,
          priorityAnalysis: result.analysis?.modelUsed,
          fallbackUsed: result.themeModel !== result.analysis?.modelUsed
        },
        
        // Detailed analysis (maintaining all original fields)
        scores: result.analysis?.scores || {},
        priority_recommendation: result.analysis?.priority_recommendation || 'Not analyzed',
        key_insights: result.analysis?.key_insights || [],
        risks: result.analysis?.risks || [],
        opportunities: result.analysis?.opportunities || [],
        similar_features: result.analysis?.similar_features || 'Not analyzed',
        recommended_next_steps: result.analysis?.recommended_next_steps || [],
        executive_summary: result.analysis?.executive_summary || 'Not analyzed',
        on_hold_reasoning: result.analysis?.on_hold_reasoning || 'Not applicable'
      },
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
    theme: null,
    themeModel: null,
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
    
    // Step 3: Agent 1 - Theme Classification (Specialized)
    logger.logAction('THEME_CLASSIFICATION_START');
    const themeStartTime = new Date();
    const themeResult = await classifyTheme(issue, logger);
    const theme = themeResult.theme;
    const themeTime = new Date() - themeStartTime;
    result.theme = theme;
    result.themeModel = themeResult.modelUsed;
    result.modelUsed = themeResult.modelUsed;
    result.actions.push(`Theme classified: ${theme} (${themeTime}ms)`);
    logger.logAction('THEME_CLASSIFICATION_COMPLETE', { theme: theme, time: themeTime });
    
    // Step 4: Agent 2 - Priority Analysis (General)
    logger.logAction('PRIORITY_ANALYSIS_START');
    const priorityStartTime = new Date();
    const analysisResult = await analyzePriority(issue, logger);
    const analysis = analysisResult.analysis;
    const priorityTime = new Date() - priorityStartTime;
    
    if (analysis && analysis.scores) {
      result.priorityModel = analysisResult.modelUsed; // Store priority model separately
      result.analysis = analysis;
      result.actions.push(`Priority analysis completed (${priorityTime}ms)`);
      logger.logAction('PRIORITY_ANALYSIS_SUCCESS', {
        recommendation: analysis.priority_recommendation,
        score: analysis.scores.overall_priority,
        model: analysisResult.modelUsed
      });
    } else {
      result.priorityModel = "Failed"; // Mark priority as failed
      result.actions.push('Priority analysis failed - manual review needed');
      logger.logAction('PRIORITY_ANALYSIS_FAILED');
    }
    
    // Calculate total response time
    result.responseTime = themeTime + priorityTime;
    
    return result;
    
  } catch (error) {
    logger.logAction('ERROR', { error: error.toString() });
    result.actions.push(`Error: ${error.toString()}`);
    return result;
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
    // Use REST API like the original Google Apps Script
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
        candidateCount: 1
      }
    };
    
    const startTime = new Date();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const responseTime = new Date() - startTime;
    
    logger.logAction('GEMINI_RESPONSE', {
      responseTime: responseTime,
      statusCode: response.status,
      hasContent: response.ok
    });
    
    if (response.ok) {
      const result = await response.json();
      
      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
        const text = result.candidates[0].content.parts[0].text;
        const parsed = parseAIResponse(text);
        
        if (parsed && parsed.scores) {
          logger.logAction('GEMINI_PARSE_SUCCESS', {
            recommendation: parsed.priority_recommendation,
            score: parsed.scores.overall_priority
          });
          return parsed;
        }
      }
    }
    
    logger.logAction('GEMINI_FAILED', {
      statusCode: response.status,
      response: response.statusText
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
      max_tokens: 10000, // Increased from 1500 to handle full JSON
      temperature: 0.2,
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
    
    // Check if JSON is complete (has closing braces)
    const openBraces = (jsonStr.match(/\{/g) || []).length;
    const closeBraces = (jsonStr.match(/\}/g) || []).length;
    
    if (openBraces > closeBraces) {
      console.log('⚠️ Incomplete JSON detected, attempting to complete...');
      
      // Try to find the last complete object
      let lastCompleteIndex = jsonStr.lastIndexOf('}');
      if (lastCompleteIndex > 0) {
        // Find the matching opening brace
        let braceCount = 1;
        for (let i = lastCompleteIndex - 1; i >= 0; i--) {
          if (jsonStr[i] === '}') braceCount++;
          if (jsonStr[i] === '{') braceCount--;
          if (braceCount === 0) {
            jsonStr = jsonStr.substring(0, lastCompleteIndex + 1);
            console.log('🔧 Completed JSON by finding matching braces');
            break;
          }
        }
      }
    }
    
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

// Effort estimation framework with structured criteria
function estimateEffort(issue, logger) {
  const summary = (issue.fields?.summary || '').toLowerCase();
  const description = (issue.fields?.description || '').toLowerCase();
  const components = (issue.fields?.components || []).map(c => c.name.toLowerCase());
  const labels = (issue.fields?.labels || []).map(l => l.toLowerCase());
  
  // Effort indicators
  const effortIndicators = {
    XS: {
      keywords: ['config', 'setting', 'toggle', 'button', 'styling', 'color', 'text', 'minor', 'small', 'simple'],
      patterns: ['fix.*button', 'change.*color', 'update.*text', 'add.*toggle'],
      score: 100,
      description: '1-2 weeks: Simple config/UI changes, minor bug fixes'
    },
    S: {
      keywords: ['widget', 'component', 'api', 'endpoint', 'integration', 'moderate', 'medium'],
      patterns: ['add.*widget', 'new.*api', 'create.*component', 'integrate.*service'],
      score: 80,
      description: '2-4 weeks: Single service changes, new components, moderate features'
    },
    M: {
      keywords: ['dashboard', 'report', 'workflow', 'complex', 'multiple', 'major'],
      patterns: ['new.*dashboard', 'create.*workflow', 'build.*report', 'multiple.*services'],
      score: 60,
      description: '1-2 months: Multiple service integration, complex features, major UI changes'
    },
    L: {
      keywords: ['architecture', 'migration', 'platform', 'infrastructure', 'large'],
      patterns: ['architectural.*change', 'platform.*migration', 'infrastructure.*update'],
      score: 40,
      description: '2-4 months: Architectural changes, platform migrations, complex integrations'
    },
    XL: {
      keywords: ['rewrite', 'overhaul', 'new product', 'major platform', 'enterprise'],
      patterns: ['rewrite.*system', 'new.*product', 'major.*overhaul', 'enterprise.*feature'],
      score: 20,
      description: '4+ months: Platform rewrites, major infrastructure, new product lines'
    }
  };
  
  // Calculate effort score based on indicators
  let maxScore = 0;
  let estimatedEffort = 'M'; // Default
  let reasoning = [];
  
  for (const [effort, indicators] of Object.entries(effortIndicators)) {
    let score = 0;
    
    // Check keywords
    const keywordMatches = indicators.keywords.filter(keyword => 
      summary.includes(keyword) || description.includes(keyword)
    );
    score += keywordMatches.length * 10;
    
    // Check patterns
    const patternMatches = indicators.patterns.filter(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(summary) || regex.test(description);
    });
    score += patternMatches.length * 15;
    
    // Check components and labels
    const componentMatches = components.filter(comp => 
      indicators.keywords.some(keyword => comp.includes(keyword))
    );
    score += componentMatches.length * 5;
    
    if (score > maxScore) {
      maxScore = score;
      estimatedEffort = effort;
      reasoning = [
        `Keywords matched: ${keywordMatches.join(', ')}`,
        `Patterns matched: ${patternMatches.join(', ')}`,
        `Components: ${componentMatches.join(', ')}`
      ].filter(r => !r.includes('undefined') && !r.includes('matched: '));
    }
  }
  
  // Override based on explicit indicators
  if (summary.includes('bug') || summary.includes('fix')) {
    if (summary.includes('minor') || summary.includes('small')) {
      estimatedEffort = 'XS';
      reasoning.push('Minor bug fix identified');
    } else if (summary.includes('critical') || summary.includes('major')) {
      estimatedEffort = 'M';
      reasoning.push('Critical bug fix - moderate effort');
    }
  }
  
  if (summary.includes('security') || summary.includes('compliance')) {
    estimatedEffort = 'S';
    reasoning.push('Security/compliance items typically S effort');
  }
  
  const effortScore = effortIndicators[estimatedEffort].score;
  
  logger.logAction('EFFORT_ESTIMATION', {
    estimatedEffort,
    effortScore,
    reasoning,
    maxScore
  });
  
  return {
    effort_size: estimatedEffort,
    effort_score: effortScore,
    reasoning: reasoning.join('; '),
    description: effortIndicators[estimatedEffort].description
  };
}

// Dynamic product context with detailed information
function getProductContext(issue) {
  const summary = (issue.fields?.summary || '').toLowerCase();
  const description = (issue.fields?.description || '').toLowerCase();
  const components = (issue.fields?.components || []).map(c => c.name.toLowerCase());
  const labels = (issue.fields?.labels || []).map(l => l.toLowerCase());
  
  // Product detection logic
  let detectedProduct = 'Unknown';
  let confidence = 'Low';
  
  if (summary.includes('community') || description.includes('community') || 
      components.some(c => c.includes('community')) || labels.some(l => l.includes('community'))) {
    if (summary.includes('aurora') || description.includes('aurora') || 
        components.some(c => c.includes('aurora')) || labels.some(l => l.includes('aurora'))) {
      detectedProduct = 'Khoros Aurora Community';
      confidence = 'High';
    } else if (summary.includes('classic') || description.includes('classic') || 
               components.some(c => c.includes('classic')) || labels.some(l => l.includes('classic'))) {
      detectedProduct = 'Khoros Classic Community';
      confidence = 'High';
    } else {
      detectedProduct = 'Khoros Community Platform';
      confidence = 'Medium';
    }
  } else if (summary.includes('care') || description.includes('care') || 
             components.some(c => c.includes('care')) || labels.some(l => l.includes('care'))) {
    detectedProduct = 'Khoros Care';
    confidence = 'High';
  } else if (summary.includes('social') || description.includes('social') || 
             summary.includes('marketing') || description.includes('marketing') ||
             components.some(c => c.includes('social') || c.includes('marketing')) ||
             labels.some(l => l.includes('social') || l.includes('marketing'))) {
    detectedProduct = 'Khoros Social Media & Marketing';
    confidence = 'High';
  }
  
  // Get detailed product context based on detected product
  const productDetails = getProductDetails(detectedProduct, issue);
  
  return {
    product: detectedProduct,
    confidence,
    indicators: {
      summary: summary.substring(0, 100),
      components: components,
      labels: labels
    },
    context: productDetails
  };
}

// Get detailed product information and context
function getProductDetails(productName, issue) {
  const summary = (issue.fields?.summary || '').toLowerCase();
  const description = (issue.fields?.description || '').toLowerCase();
  
  switch (productName) {
    case 'Khoros Aurora Community':
      return {
        overview: "Khoros Aurora is a unified platform for digital engagement, focusing on Community & Knowledge Management (CKM) for enterprise buyers. It represents a strategic shift from siloed tools to an integrated engagement ecosystem.",
        corePillars: [
          "Community Engagement: Peer-to-peer support, product feedback, gamification, loyalty programs",
          "Digital Care: Unified agent workspace with smart routing and AI assistance",
          "Social Media Management: Publishing, moderation, campaign execution, analytics"
        ],
        keyCapabilities: [
          "Unified Platform: Integrates community content, curated knowledge, and agent workflows",
          "Enterprise Architecture: Multi-brand management, role-based access, compliance (SOC 2, GDPR, CCPA)",
          "Aurora AI: Contextual moderation, smart search, knowledge routing, intelligent content surfacing",
          "Community Features: Advanced moderation, structured ideation, gamification, reputation systems",
          "Knowledge Integration: Peer-to-agent escalation, CRM integration, case deflection",
          "Customization: Flexible theming, developer SDK, open APIs, embeddable widgets"
        ],
        relevantFeatures: getRelevantAuroraFeatures(summary, description),
        businessContext: "Enterprise B2B SaaS platform serving Fortune 500 companies, government agencies, and major brands. Focuses on reducing support costs through community-driven self-service and knowledge management.",
        technicalContext: "Built on modern architecture with AI integration, multi-tenant support, and extensive customization options through SDK and APIs."
      };
      
    case 'Khoros Care':
      return {
        overview: "Khoros Care provides unified customer care across messaging, social, and owned channels with AI-powered assistance and workflow automation.",
        corePillars: [
          "Agent Productivity: Unified workspace, smart routing, workflow automation",
          "AI Assistance: Intelligent responses, automated workflows, predictive analytics",
          "Multi-Channel Support: Messaging, social media, email, chat integration"
        ],
        keyCapabilities: [
          "Unified Agent Workspace: Single interface for all customer interactions",
          "Smart Routing: AI-powered ticket assignment and escalation",
          "Workflow Automation: Automated responses and process optimization",
          "AI Assistance: Intelligent suggestions and automated workflows"
        ],
        relevantFeatures: getRelevantCareFeatures(summary, description),
        businessContext: "Enterprise customer care platform focused on reducing response times and improving customer satisfaction through AI and automation.",
        technicalContext: "Modern cloud platform with AI integration, extensive API support, and enterprise-grade security."
      };
      
    case 'Khoros Social Media & Marketing':
      return {
        overview: "Khoros Social Media & Marketing platform provides comprehensive social media management, campaign execution, and analytics across global social footprints.",
        corePillars: [
          "Social Publishing: Multi-platform content creation and scheduling",
          "Campaign Management: Campaign execution, monitoring, and optimization",
          "Analytics & Reporting: Performance metrics and ROI measurement"
        ],
        keyCapabilities: [
          "Multi-Platform Publishing: Support for major social media platforms",
          "Campaign Execution: End-to-end campaign management and optimization",
          "Social Listening: Brand monitoring and crisis response",
          "Analytics: Comprehensive reporting and performance metrics"
        ],
        relevantFeatures: getRelevantSocialFeatures(summary, description),
        businessContext: "Enterprise social media management platform for brands and agencies managing global social presence.",
        technicalContext: "Cloud-based platform with real-time monitoring, extensive API integration, and enterprise security."
      };
      
    default:
      return {
        overview: "Khoros is a B2B SaaS platform serving enterprise customers in social media management, community engagement, and customer care.",
        corePillars: [
          "Community & Knowledge Management",
          "Customer Care & Support",
          "Social Media Management"
        ],
        keyCapabilities: [
          "Enterprise-grade platform with AI integration",
          "Multi-product ecosystem with unified data",
          "Extensive customization and integration options"
        ],
        relevantFeatures: ["Core platform features and capabilities"],
        businessContext: "Enterprise B2B SaaS platform serving Fortune 500 companies and major brands.",
        technicalContext: "Modern cloud architecture with AI capabilities and enterprise security."
      };
  }
}

// Get relevant Aurora features based on ticket content
function getRelevantAuroraFeatures(summary, description) {
  const features = [];
  
  if (summary.includes('moderation') || description.includes('moderation')) {
    features.push("AI-powered contextual moderation with automated flagging and escalation queues");
  }
  
  if (summary.includes('search') || description.includes('search')) {
    features.push("Smart search with intent-aware results and content discovery");
  }
  
  if (summary.includes('knowledge') || description.includes('knowledge')) {
    features.push("Knowledge base integration with AI-powered routing and recommendations");
  }
  
  if (summary.includes('gamification') || description.includes('gamification')) {
    features.push("Over 80 out-of-the-box triggers for badges, ranks, and rewards");
  }
  
  if (summary.includes('theme') || description.includes('theme')) {
    features.push("Multi-theme support with Theme Studio for low-code customization");
  }
  
  if (summary.includes('api') || description.includes('api')) {
    features.push("Open APIs and webhooks for integration with external systems");
  }
  
  if (summary.includes('sdk') || description.includes('sdk')) {
    features.push("Developer SDK for building custom components and extensions");
  }
  
  if (summary.includes('workflow') || description.includes('workflow')) {
    features.push("Content Workflow (CWA) for approval and governance flows");
  }
  
  if (summary.includes('sso') || description.includes('sso')) {
    features.push("Multi-auth SSO options including OpenID Connect/OAuth2 and JWT");
  }
  
  return features.length > 0 ? features : ["Core community engagement and knowledge management features"];
}

// Get relevant Care features based on ticket content
function getRelevantCareFeatures(summary, description) {
  const features = [];
  
  if (summary.includes('routing') || description.includes('routing')) {
    features.push("Smart routing with AI-powered ticket assignment");
  }
  
  if (summary.includes('workflow') || description.includes('workflow')) {
    features.push("Workflow automation for process optimization");
  }
  
  if (summary.includes('ai') || description.includes('ai')) {
    features.push("AI assistance for intelligent responses and automation");
  }
  
  if (summary.includes('integration') || description.includes('integration')) {
    features.push("Multi-channel integration for unified customer experience");
  }
  
  return features.length > 0 ? features : ["Core customer care and support features"];
}

// Get relevant Social features based on ticket content
function getRelevantSocialFeatures(summary, description) {
  const features = [];
  
  if (summary.includes('publishing') || description.includes('publishing')) {
    features.push("Multi-platform social media publishing and scheduling");
  }
  
  if (summary.includes('campaign') || description.includes('campaign')) {
    features.push("Campaign management and execution tools");
  }
  
  if (summary.includes('analytics') || description.includes('analytics')) {
    features.push("Comprehensive social media analytics and reporting");
  }
  
  if (summary.includes('listening') || description.includes('listening')) {
    features.push("Social listening and brand monitoring");
  }
  
  return features.length > 0 ? features : ["Core social media management features"];
}

// Theme classification map
const THEME_MAP = {
  "Khoros Aurora Community": [
    "ANALYTICS & REPORTING - AI-Powered Analytics",
    "ANALYTICS & REPORTING - Core Analytics", 
    "ANALYTICS & REPORTING - REVIEW",
    "ANALYTICS & REPORTING - Reporting Enhancements",
    "COMMUNITY FEATURES & ENGAGEMENT - ACCEPTED",
    "CONTENT MANAGEMENT & MODERATION - Content Controls",
    "CONTENT MANAGEMENT & MODERATION - Moderation Features",
    "CONTENT MANAGEMENT & MODERATION - REVIEW",
    "CONTENT MANAGEMENT & MODERATION - Spam & Security Controls",
    "INTEGRATION & PUBLISHING - Events & Calendar",
    "INTEGRATION & PUBLISHING - Other Integrations",
    "INTEGRATION & PUBLISHING - Social Media Integration",
    "PLATFORM ADMINISTRATION - Admin Tools",
    "PLATFORM ADMINISTRATION - Infrastructure & Security",
    "SEARCH & DISCOVERY - Content Discovery",
    "SEARCH & DISCOVERY - Search Functionality",
    "USER EXPERIENCE & INTERFACE - Communication Customization",
    "USER EXPERIENCE & INTERFACE - Navigation & Layout",
    "USER EXPERIENCE & INTERFACE - UI Components & Widgets",
    "USER EXPERIENCE & INTERFACE - Visual Design"
  ],
  "Khoros Care": [
    "AGENT PRODUCTIVITY & USER EXPERIENCE - Platform Stability (ONE Items)",
    "AI, AUTOMATION & INTELLIGENT FEATURES - ROADMAP REVIEW",
    "ANALYTICS & REPORTING - Permissions - LIKELY CARE",
    "CHANNEL INTEGRATION & EXPANSION - App Store Integrations",
    "CHANNEL INTEGRATION & EXPANSION - Bluesky (Twitter Replacement)",
    "CHANNEL INTEGRATION & EXPANSION - Facebook Updates",
    "CHANNEL INTEGRATION & EXPANSION - LinkedIn Enhancements",
    "CHANNEL INTEGRATION & EXPANSION - SMS & Messaging Platforms",
    "CHANNEL INTEGRATION & EXPANSION - Third-Party Integrations",
    "CHANNEL INTEGRATION & EXPANSION - TikTok Suite",
    "COMPLIANCE, SECURITY & AUTHENTICATION",
    "CONFIGURATION & SYSTEM MANAGEMENT - CARE"
  ],
  "Khoros Classic Community": [
    "UI/UX ENHANCEMENTS - UI/UX ENHANCEMENTS (4 Features)",
    "USER MANAGEMENT & ANALYTICS - User Data & Export",
    "SOCIAL MEDIA & PUBLISHING - Consider exceptions to maintenance mode",
    "SOCIAL MEDIA & PUBLISHING - Phase 1: Immediate (Bugs Only)"
  ],
  "Khoros Social Media & Marketing": [
    "AI & AUTOMATION",
    "ANALYTICS & REPORTING - ROADMAP REVIEW",
    "CHANNEL-SPECIFIC ENHANCEMENTS - LinkedIn Suite",
    "CHANNEL-SPECIFIC ENHANCEMENTS - YouTube Features",
    "PUBLISHING & CONTENT MANAGEMENT - Channel-Specific Publishing",
    "PUBLISHING & CONTENT MANAGEMENT - Core Publishing Capabilities",
    "USER EXPERIENCE & WORKFLOW"
  ]
};

// Agent 1: Theme Classifier (Product-Aware)
async function classifyTheme(issue, logger) {
  // Get dynamic product context
  const productContext = getProductContext(issue);
  
  const prompt = `You are a Khoros Product Theme Specialist. Your job is to classify feature requests and bugs into the appropriate product theme based on the request content and product context.

ABOUT KHOROS PRODUCTS:
======================
${productContext.context.overview}

WHAT "THEME" MEANS:
===================
A "theme" in Khoros represents a functional area or capability within a product. For example:
- "ANALYTICS & REPORTING" covers dashboards, metrics, and data insights
- "COMMUNITY FEATURES & ENGAGEMENT" covers user interaction, gamification, and community tools
- "CONTENT MANAGEMENT & MODERATION" covers content creation, editing, and moderation workflows
- "INTEGRATION & PUBLISHING" covers external system connections and content publishing

AVAILABLE THEMES BY PRODUCT:
============================
${productContext.product === 'Khoros Aurora Community' ? `
Khoros Aurora Community:
- ANALYTICS & REPORTING - AI-Powered Analytics
- ANALYTICS & REPORTING - Core Analytics  
- ANALYTICS & REPORTING - REVIEW
- ANALYTICS & REPORTING - Reporting Enhancements
- COMMUNITY FEATURES & ENGAGEMENT - 
- COMMUNITY FEATURES & ENGAGEMENT - ACCEPTED
- CONTENT MANAGEMENT & MODERATION - Content Controls
- CONTENT MANAGEMENT & MODERATION - Moderation Features
- CONTENT MANAGEMENT & MODERATION - REVIEW
- CONTENT MANAGEMENT & MODERATION - Spam & Security Controls
- INTEGRATION & PUBLISHING - Calendar - IN REVIEW
- INTEGRATION & PUBLISHING - Events & Calendar
- INTEGRATION & PUBLISHING - Other Integrations
- INTEGRATION & PUBLISHING - Social Media Integration
- PLATFORM ADMINISTRATION - - ACCEPTED
- PLATFORM ADMINISTRATION - Admin Tools
- PLATFORM ADMINISTRATION - Infrastructure & Security
- SEARCH & DISCOVERY - Content Discovery
- SEARCH & DISCOVERY - REVIEW
- SEARCH & DISCOVERY - Search Functionality
- USER EXPERIENCE & INTERFACE - - IN REVIEW
- USER EXPERIENCE & INTERFACE - Communication Customization
- USER EXPERIENCE & INTERFACE - Navigation & Layout
- USER EXPERIENCE & INTERFACE - TRANSFERRED
- USER EXPERIENCE & INTERFACE - UI Components & Widgets
- USER EXPERIENCE & INTERFACE - Visual Design
- USER EXPERIENCE & INTERFACE - category nodes - ACCEPTED
- USER EXPERIENCE & INTERFACE - marketplace - IN REVIEW` : 
productContext.product === 'Khoros Care' ? `
Khoros Care:
- AGENT PRODUCTIVITY & USER EXPERIENCE - 
- AGENT PRODUCTIVITY & USER EXPERIENCE - - UNDER REVIEW
- AGENT PRODUCTIVITY & USER EXPERIENCE - Platform Stability (ONE Items)
- AGENT PRODUCTIVITY & USER EXPERIENCE - REVIEW
- AGENT PRODUCTIVITY & USER EXPERIENCE - UNDER REVIEW
- AGENT PRODUCTIVITY & USER EXPERIENCE - items - NEW
- AGENT PRODUCTIVITY & USER EXPERIENCE - panel - UNDER REVIEW
- AI, AUTOMATION & INTELLIGENT FEATURES - 
- AI, AUTOMATION & INTELLIGENT FEATURES - ROADMAP REVIEW
- AI, AUTOMATION & INTELLIGENT FEATURES - UNDER REVIEW
- ANALYTICS & REPORTING - 
- ANALYTICS & REPORTING - Permissions - LIKELY CARE - UNDER REVIEW
- ANALYTICS & REPORTING - UNDER REVIEW
- ANALYTICS & REPORTING - Widget - UNDER REVIEW
- CHANNEL INTEGRATION & EXPANSION - App Store Integrations
- CHANNEL INTEGRATION & EXPANSION - Bluesky (Twitter Replacement)
- CHANNEL INTEGRATION & EXPANSION - CARE - UNDER REVIEW
- CHANNEL INTEGRATION & EXPANSION - Facebook Updates
- CHANNEL INTEGRATION & EXPANSION - LinkedIn Enhancements
- CHANNEL INTEGRATION & EXPANSION - REVIEW
- CHANNEL INTEGRATION & EXPANSION - SMS & Messaging Platforms
- CHANNEL INTEGRATION & EXPANSION - Third-Party Integrations
- CHANNEL INTEGRATION & EXPANSION - TikTok Suite
- COMPLIANCE, SECURITY & AUTHENTICATION - 
- CONFIGURATION & SYSTEM MANAGEMENT - 
- CONFIGURATION & SYSTEM MANAGEMENT - - LIKELY CARE - UNDER REVIEW
- CONFIGURATION & SYSTEM MANAGEMENT - CARE - UNDER REVIEW
- CONFIGURATION & SYSTEM MANAGEMENT - REVIEW
- PLATFORM & COMMUNITY FEATURES - 
- PLATFORM & COMMUNITY FEATURES - REVIEW
- PLATFORM & COMMUNITY FEATURES - UNDER REVIEW` :
productContext.product === 'Khoros Social Media & Marketing' ? `
Khoros Social Media & Marketing:
- AI & AUTOMATION - 
- ANALYTICS & REPORTING - 
- ANALYTICS & REPORTING - ROADMAP REVIEW
- CHANNEL-SPECIFIC ENHANCEMENTS - LinkedIn Suite
- CHANNEL-SPECIFIC ENHANCEMENTS - REVIEW
- CHANNEL-SPECIFIC ENHANCEMENTS - YouTube Features
- COMPLIANCE (DEPRECATED) - 
- PUBLISHING & CONTENT MANAGEMENT - Channel-Specific Publishing
- PUBLISHING & CONTENT MANAGEMENT - Core Publishing Capabilities
- USER EXPERIENCE & WORKFLOW -` : 
`Available themes vary by product. Please classify based on the functional area this request addresses.`}

TICKET DETAILS:
===============
Key: ${issue.key}
Summary: ${issue.fields?.summary || 'No summary'}
Description: ${issue.fields?.description || 'No description'}
Components: ${issue.fields?.components?.map(c => c.name).join(', ') || 'None'}
Labels: ${issue.fields?.labels?.join(', ') || 'None'}

CLASSIFICATION RULES:
====================
1. Read the summary and description carefully
2. Identify the primary functional area being addressed
3. Match it to the most specific theme from the list above
4. If the request spans multiple themes, choose the primary one
5. If no clear match exists, use "THEME NOT IDENTIFIED"

EXAMPLES:
=========
- "Add new analytics dashboard" → "ANALYTICS & REPORTING - Core Analytics"
- "Improve community moderation" → "CONTENT MANAGEMENT & MODERATION - Moderation Features"
- "Fix search functionality" → "SEARCH & DISCOVERY - Search Functionality"
- "Add new API endpoint" → "INTEGRATION & PUBLISHING - Other Integrations"
- "Update button styling" → "USER EXPERIENCE & INTERFACE - UI Components & Widgets"

REQUIRED OUTPUT FORMAT:
======================
Return ONLY the exact theme name from the list above, or "THEME NOT IDENTIFIED" if no clear match exists.

Do not include any other text, explanations, or formatting. Just the theme name.`;

  let modelUsed = null;
  
  try {
    // Try Gemini first for theme classification
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(prompt);
        const theme = result.response.text().trim();
        modelUsed = 'Gemini Flash 2.0';
        logger.logAction('THEME_CLASSIFICATION_SUCCESS', { theme: theme, model: modelUsed });
        return { theme, modelUsed };
      } catch (geminiError) {
        logger.logAction('THEME_GEMINI_FAILED', { error: geminiError.toString() });
      }
    }
    
    // Fallback to Claude
    if (anthropic) {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 150,
          temperature: 0.1,
          messages: [{ role: 'user', content: prompt }]
        });
        const theme = response.content[0].text.trim();
        modelUsed = 'Claude Sonnet 3.5';
        logger.logAction('THEME_CLASSIFICATION_SUCCESS', { theme: theme, model: modelUsed });
        return { theme, modelUsed };
      } catch (claudeError) {
        logger.logAction('THEME_CLAUDE_FAILED', { error: claudeError.toString() });
      }
    }
    
    // Both failed
    logger.logAction('THEME_CLASSIFICATION_BOTH_FAILED');
    return { theme: "THEME NOT IDENTIFIED", modelUsed: "None - Both models failed" };
    
  } catch (error) {
    logger.logAction('THEME_CLASSIFICATION_ERROR', { error: error.toString() });
    return { theme: "THEME NOT IDENTIFIED", modelUsed: "None - Error occurred" };
  }
}

// Agent 2: Priority Analyzer (Product-Aware with Structured Effort)
async function analyzePriority(issue, logger) {
  try {
    // Get structured effort estimation
    const effortEstimation = estimateEffort(issue, logger);
    
    // Get dynamic product context
    const productContext = getProductContext(issue);
    
    // Validate product context
    if (!productContext.context) {
      logger.logAction('PRODUCT_CONTEXT_ERROR', { 
        error: 'Product context is missing',
        product: productContext.product,
        confidence: productContext.confidence
      });
      return { analysis: null, modelUsed: "Error - Product context missing" };
    }
    
    const prompt = `You are a Khoros Product Priority Specialist. Your job is to analyze feature requests and bugs to determine their development priority based on business impact and implementation effort.

PRODUCT CONTEXT:
===============
Detected Product: ${productContext.product} (Confidence: ${productContext.confidence})

${productContext.context.overview || 'Product overview not available'}

Core Product Pillars:
${(productContext.context.corePillars || []).map(pillar => `- ${pillar}`).join('\n')}

Key Capabilities:
${(productContext.context.keyCapabilities || []).map(capability => `- ${capability}`).join('\n')}

Relevant Features for This Request:
${(productContext.context.relevantFeatures || []).map(feature => `- ${feature}`).join('\n')}

Business Context: ${productContext.context.businessContext || 'Business context not available'}
Technical Context: ${productContext.context.technicalContext || 'Technical context not available'}

TICKET DETAILS:
===============
Key: ${issue.key}
Summary: ${issue.fields?.summary || 'No summary'}
Description: ${issue.fields?.description || 'No description'}
Priority: ${issue.fields?.priority?.name || 'Not set'}
Reporter: ${issue.fields?.reporter?.displayName || 'Unknown'}
Created: ${issue.fields?.created || 'Unknown'}
Components: ${issue.fields?.components?.map(c => c.name).join(', ') || 'None'}
Labels: ${issue.fields?.labels?.join(', ') || 'None'}

STRUCTURED EFFORT ESTIMATION:
============================
Effort Size: ${effortEstimation.effort_size}
Effort Score: ${effortEstimation.effort_score}/100
Description: ${effortEstimation.description}
Reasoning: ${effortEstimation.reasoning}

ANALYSIS FRAMEWORK:
==================
1. BUSINESS IMPACT ASSESSMENT (Score 0-100)
   - Customer Impact: How many customers will benefit? (Enterprise = High, Niche = Low)
   - Revenue Impact: Retention risk, expansion opportunity, competitive advantage
   - Strategic Value: Alignment with product roadmap, market positioning
   - Urgency: Security, compliance, critical bugs vs nice-to-have features

2. PRIORITY DECISION MATRIX:
   ==========================
   
   FAST TRACK (80-100):
   - High business impact (70+) + Low effort (XS/S)
   - Critical security/compliance issues
   - High-value features for enterprise customers
   - Competitive differentiators
   
   STANDARD (50-79):
   - Moderate business impact (40-70) + Reasonable effort (S/M)
   - Regular feature requests from multiple customers
   - Platform improvements with clear value
   - Moderate bug fixes affecting user experience
   
   ON HOLD (25-49):
   - Low business impact (20-40) OR High effort (L/XL)
   - Nice-to-have features for few customers
   - Complex requests with unclear ROI
   - Features that can wait without business impact
   
   LOW (0-24):
   - Very low business impact (0-20) OR Very high effort (XL)
   - Edge cases affecting very few users
   - Architectural changes with minimal benefit
   - Features that don't align with product strategy

CRITICAL FACTORS FOR ON HOLD/LOW:
================================
- Customer Count: <5 customers = likely On Hold/Low
- Request Age: >6 months old = consider On Hold
- Effort vs Value: High effort + Low value = Low priority
- Strategic Fit: Doesn't align with roadmap = On Hold
- Competitive Pressure: No competitive disadvantage = Lower priority

REQUIRED OUTPUT FORMAT (JSON):
=============================
{
  "scores": {
    "business_impact": <0-100>,
    "effort_size": "${effortEstimation.effort_size}",
    "effort_score": ${effortEstimation.effort_score},
    "overall_priority": <calculated weighted average>
  },
  "priority_recommendation": "<Fast Track|Standard|On Hold|Low>",
  "key_insights": [
    "<specific insight about business value>",
    "<specific insight about implementation effort>",
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
  "similar_features": "<brief description of related existing features>",
  "recommended_next_steps": [
    "<immediate next step for PM>",
    "<validation or research needed>",
    "<stakeholder alignment required>"
  ],
  "executive_summary": "<2-3 sentence summary with clear recommendation and reasoning>",
  "on_hold_reasoning": "<if On Hold/Low, explain why based on the criteria above>",
  "effort_analysis": {
    "estimated_effort": "${effortEstimation.effort_size}",
    "reasoning": "${effortEstimation.reasoning}",
    "confidence": "High (Structured Analysis)"
  }
}`;

    logger.logAction('PRIORITY_PROMPT_BUILT', { 
      promptLength: prompt.length,
      productContext: productContext.product,
      effortEstimation: effortEstimation.effort_size
    });

    let modelUsed = null;
    
    // Try Gemini first
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const parsed = parseAIResponse(text);
        if (parsed && parsed.scores) {
          modelUsed = 'Gemini Flash 2.0';
          logger.logAction('PRIORITY_ANALYSIS_SUCCESS', { 
            recommendation: parsed.priority_recommendation,
            score: parsed.scores.overall_priority,
            model: modelUsed
          });
          return { analysis: parsed, modelUsed };
        }
      } catch (geminiError) {
        logger.logAction('PRIORITY_GEMINI_FAILED', { error: geminiError.toString() });
      }
    }
    
    // Fallback to Claude
    if (anthropic) {
      try {
        logger.logAction('PRIORITY_CLAUDE_ATTEMPT', { promptLength: prompt.length });
        
        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 3000, // Increased from 1500 to handle full JSON
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }]
        });
        
        const text = response.content[0].text;
        
        logger.logAction('PRIORITY_CLAUDE_RESPONSE', { 
          responseLength: text.length,
          responsePreview: text.substring(0, 200),
          hasContent: !!text
        });
        
        const parsed = parseAIResponse(text);
        
        logger.logAction('PRIORITY_CLAUDE_PARSE_RESULT', { 
          parsed: !!parsed,
          hasScores: !!(parsed && parsed.scores),
          parseResult: parsed ? Object.keys(parsed) : null,
          rawResponse: text.substring(0, 500) // Log the actual response
        });
        
        if (parsed && parsed.scores) {
          modelUsed = 'Claude Sonnet 3.5';
          logger.logAction('PRIORITY_ANALYSIS_SUCCESS', { 
            recommendation: parsed.priority_recommendation,
            score: parsed.scores.overall_priority,
            model: modelUsed
          });
          return { analysis: parsed, modelUsed };
        } else {
          logger.logAction('PRIORITY_CLAUDE_PARSE_FAILED', { 
            reason: 'Parsed result missing scores',
            parsed: parsed,
            rawResponse: text.substring(0, 500)
          });
        }
      } catch (claudeError) {
        logger.logAction('PRIORITY_CLAUDE_FAILED', { error: claudeError.toString() });
      }
    }
    
    // Both failed
    logger.logAction('PRIORITY_ANALYSIS_BOTH_FAILED');
    return { analysis: null, modelUsed: "None - Both models failed" };
    
  } catch (error) {
    logger.logAction('PRIORITY_ANALYSIS_ERROR', { error: error.toString() });
    return { analysis: null, modelUsed: "Error occurred" };
  }
}

// Helper function to classify if it's a bug or feature
function classifyBugOrFeature(issueData) {
  const summary = (issueData?.fields?.summary || '').toLowerCase();
  const description = (issueData?.fields?.description || '').toLowerCase();
  const labels = (issueData?.fields?.labels || []).map(l => l.toLowerCase());
  
  // Bug indicators
  const bugKeywords = ['bug', 'fix', 'error', 'broken', 'issue', 'problem', 'crash', 'fail', 'not working', 'broken'];
  const bugPatterns = ['fix.*', 'broken.*', 'not.*working', 'error.*', 'bug.*'];
  
  // Feature indicators
  const featureKeywords = ['add', 'new', 'implement', 'create', 'build', 'enhance', 'improve', 'upgrade', 'feature'];
  const featurePatterns = ['add.*', 'new.*', 'implement.*', 'create.*', 'build.*'];
  
  let bugScore = 0;
  let featureScore = 0;
  
  // Check keywords
  bugKeywords.forEach(keyword => {
    if (summary.includes(keyword) || description.includes(keyword)) bugScore += 2;
  });
  
  featureKeywords.forEach(keyword => {
    if (summary.includes(keyword) || description.includes(keyword)) featureScore += 2;
  });
  
  // Check patterns
  bugPatterns.forEach(pattern => {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(summary) || regex.test(description)) bugScore += 1;
  });
  
  featurePatterns.forEach(pattern => {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(summary) || regex.test(description)) featureScore += 1;
  });
  
  // Check labels
  if (labels.includes('bug') || labels.includes('defect')) bugScore += 3;
  if (labels.includes('enhancement') || labels.includes('feature')) featureScore += 3;
  
  // Determine classification
  if (bugScore > featureScore) {
    return 'Bug';
  } else if (featureScore > bugScore) {
    return 'Feature';
  } else {
    return 'Feature'; // Default to feature if unclear
  }
}

// Helper function to generate similarity group ID
function generateSimilarityGroup(analysis, theme) {
  if (!analysis?.similar_features) return null;
  
  // Create a simple hash-based ID from theme and similar features
  const base = theme || 'unknown';
  const similar = analysis.similar_features.substring(0, 20);
  const hash = (base + similar).split('').reduce((a, b) => {
    a = ((a << 5) - a + b.charCodeAt(0)) & 0xFFFFFFFF;
    return a;
  }, 0);
  
  return `SIM-${Math.abs(hash).toString().padStart(3, '0')}`;
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