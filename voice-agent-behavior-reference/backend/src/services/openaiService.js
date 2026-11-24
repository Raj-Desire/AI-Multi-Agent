const logger = require('../utils/logger');

const endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const apiKey = process.env.AZURE_OPENAI_KEY || '';
const chatDeployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o';
const embeddingDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small';
const apiVersion = '2024-02-15-preview';

/**
 * Make a direct REST call to Azure OpenAI
 */
async function callAzureOpenAI(path, body) {
  if (!endpoint || !apiKey) {
    logger.warn('Azure OpenAI config is missing. Skipping LLM logic.');
    return null;
  }

  const url = `${endpoint.replace(/\/+$/, '')}/openai/deployments/${path}?api-version=${apiVersion}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI HTTP error! status=${response.status}, details=${errorText}`);
    }

    return await response.json();
  } catch (error) {
    logger.error('Azure OpenAI API call failed:', error);
    throw error;
  }
}

/**
 * Get embedding for a text chunk
 */
async function getEmbedding(text) {
  try {
    const res = await callAzureOpenAI(`${embeddingDeployment}/embeddings`, {
      input: text,
    });
    return res?.data?.[0]?.embedding || null;
  } catch (error) {
    logger.error('Failed to generate embedding:', error);
    return null;
  }
}

/**
 * Analyze call transcript to extract lead information, summary, sentiment, score, etc.
 */
async function analyzeCallTranscript(transcriptArray) {
  const customerMessages = (transcriptArray || []).filter(
    (t) => (t.role === 'user' || t.role === 'customer') && t.text && t.text.trim().length > 0
  );
  const customerSpoke = customerMessages.length > 0;

  if (!transcriptArray || transcriptArray.length === 0 || !customerSpoke) {
    return {
      summary: '',
      keyInsights: [],
      intent: 'No Answer / Machine',
      sentiment: 'Neutral',
      leadScore: 0,
      interestLevel: 'Not Answered',
      classification: 'Cold',
      customerName: null,
      companyName: null,
      country: null,
      businessRequirements: null,
      budgetInformation: null,
      preferredContactMethod: null,
      followUpRequest: null,
      callbackDateTime: null,
    };
  }

  const formattedTranscript = transcriptArray
    .map((t) => `${t.role === 'agent' ? 'Agent (Desire Infoweb)' : 'Customer'}: ${t.text}`)
    .join('\n');

  const systemPrompt = `You are a professional sales lead analyst. Analyze the following transcript of an outbound call from Desire Infoweb's AI voice assistant (Aria) to a prospect.
Analyze the conversation and extract lead details in JSON format. Do not include markdown code block styling, just output raw JSON.

CRITICAL RULE FOR SUMMARY:
If the customer/prospect did NOT reply, discuss, or speak meaningfully in the call (e.g. call was answered by a voicemail greeting, IVR phone menu, automated machine, or ended without human discussion), set "summary" to "" (empty string).
ONLY provide a non-empty summary if there was an actual conversation or discussion with a human prospect.

STRICT INTEREST LEVEL RULES (DO NOT HALLUCINATE):
- "Not Answered": Set if answered by voicemail, IVR phone menu, answering machine, AI screener, operator announcement, machine disconnect, silence, or if the customer did not engage in real discussion.
- "Wants Callback": ONLY set if the customer EXPLICITLY requested a callback or stated a better day/time for us to call back (e.g. "call me back later", "busy right now, call tomorrow").
- "Needs Follow-up": ONLY set if the customer EXPLICITLY asked questions about services, requested info via email/WhatsApp, or showed genuine interest needing follow-up action.
- "Not Interested": Set if the customer explicitly rejected, said no, hung up, or refused.
- "Highly Interested" / "Interested": Set ONLY if the customer expressed clear interest in services or agreed to a consultant chat.
NEVER assign "Needs Follow-up" or "Wants Callback" if the customer said nothing, if voicemail answered, or if there is no explicit customer request.

The classification MUST be one of:
- "Hot" (for Highly Interested or clear business requirement)
- "Warm" (for Interested, Needs Follow-up, or Wants Callback)
- "Cold" (for Not Interested, Not Answered, or no interest)

The leadScore should be a number from 0 to 100 based on interest level, willingness to talk, and request for a follow-up/consultation.

Extract these fields:
1. summary (short 2-3 sentence overview of the call. Set to "" if no real human conversation took place)
2. keyInsights (array of 2-3 bullet points about the interaction)
3. intent (what the user wanted, e.g. "automation services", "callback", "reject")
4. sentiment ("Positive", "Neutral", or "Negative")
5. leadScore (0 to 100)
6. interestLevel (from the allowed values above)
7. classification (from the allowed values above)
8. customerName (name if mentioned, null otherwise)
9. companyName (company name if mentioned, null otherwise)
10. country (country if mentioned or inferred, null otherwise)
11. businessRequirements (what they need, e.g. web development, automation, custom software, null otherwise)
12. budgetInformation (any budget details mentioned, null otherwise)
13. preferredContactMethod (e.g. phone, email, WhatsApp, null otherwise)
14. followUpRequest (follow up instructions, next action, or callback instructions, null otherwise)
15. callbackDateTime (if the customer specifies a date and/or time to call them back, parse it into an ISO format or clear descriptive string, null otherwise)

Ensure the output is valid JSON matching these keys.`;

  try {
    const res = await callAzureOpenAI(`${chatDeployment}/chat/completions`, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `TRANSCRIPT:\n${formattedTranscript}` },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = res?.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);

      // Programmatic transcript check for machine / no-response indicators
      const agentTranscriptText = (transcriptArray || []).filter(t => t.role === 'agent').map(t => (t.text || '').toLowerCase()).join(' ');
      const customerTranscriptText = (transcriptArray || []).filter(t => t.role === 'user' || t.role === 'customer').map(t => (t.text || '').toLowerCase()).join(' ');
      const customerWords = customerTranscriptText.trim().split(/\s+/).filter(w => w.length > 0);

      const isVoicemailOrMachine = 
        agentTranscriptText.includes('voicemail detected') ||
        agentTranscriptText.includes('automated system detected') ||
        agentTranscriptText.includes('seems you might be busy') ||
        customerTranscriptText.includes('leave a message') ||
        customerTranscriptText.includes('leave your message') ||
        customerTranscriptText.includes('record your message') ||
        customerTranscriptText.includes('after the tone') ||
        customerTranscriptText.includes('after the beep') ||
        customerTranscriptText.includes('press 1') ||
        customerTranscriptText.includes('press 2') ||
        customerTranscriptText.includes('call assistant') ||
        customerTranscriptText.includes('automated screening') ||
        customerTranscriptText.includes('not reachable') ||
        customerTranscriptText.includes('currently unavailable');

      const hasExplicitCallbackRequest = 
        customerTranscriptText.includes('call me back') ||
        customerTranscriptText.includes('call back') ||
        customerTranscriptText.includes('call me later') ||
        customerTranscriptText.includes('busy right now') ||
        customerTranscriptText.includes('call tomorrow') ||
        customerTranscriptText.includes('call later') ||
        customerTranscriptText.includes('another time');

      const hasExplicitInterest = 
        customerTranscriptText.includes('interested') ||
        customerTranscriptText.includes('tell me more') ||
        customerTranscriptText.includes('send details') ||
        customerTranscriptText.includes('send email') ||
        customerTranscriptText.includes('email address') ||
        customerTranscriptText.includes('contact') ||
        customerTranscriptText.includes('how to reach') ||
        customerTranscriptText.includes('how much') ||
        customerTranscriptText.includes('pricing') ||
        customerTranscriptText.includes('schedule');

      const summaryLower = (parsed.summary || '').toLowerCase();
      const isGenericSummary = 
        summaryLower.includes('not provided in the transcript') ||
        summaryLower.includes('prospect\'s response is not provided') ||
        summaryLower.includes('no conversation recorded') ||
        summaryLower.includes('prospect did not respond') ||
        summaryLower.includes('concluded without connecting to a person') ||
        summaryLower.includes('encountered an automated') ||
        summaryLower.includes('failed to analyze');

      const isAskingInfo = 
        customerTranscriptText.includes('contact') ||
        customerTranscriptText.includes('email') ||
        customerTranscriptText.includes('info') ||
        customerTranscriptText.includes('details') ||
        customerTranscriptText.includes('how to reach') ||
        customerTranscriptText.includes('what do you do') ||
        summaryLower.includes('contact details') ||
        summaryLower.includes('requested info') ||
        summaryLower.includes('requested contact');

      if (isVoicemailOrMachine || customerWords.length === 0 || isGenericSummary) {
        parsed.interestLevel = 'Not Answered';
        parsed.classification = 'Cold';
        parsed.leadScore = 0;
        parsed.summary = '';
      } else if (isAskingInfo) {
        // Customer asked for contact info or company details -> Needs Follow-up
        parsed.interestLevel = 'Needs Follow-up';
        parsed.classification = 'Warm';
        if (parsed.leadScore < 50) parsed.leadScore = 60;
      } else if (parsed.interestLevel === 'Needs Follow-up' || parsed.interestLevel === 'Wants Callback') {
        if (!hasExplicitCallbackRequest && !hasExplicitInterest) {
          parsed.interestLevel = customerWords.length < 5 ? 'Not Answered' : 'Not Interested';
          parsed.classification = 'Cold';
          parsed.leadScore = customerWords.length < 5 ? 0 : 10;
        }
      }

      return parsed;
    }
  } catch (error) {
    logger.error('Failed to analyze call transcript:', error);
  }

  // Fallback defaults
  return {
    summary: '',
    keyInsights: [],
    intent: 'Unknown',
    sentiment: 'Neutral',
    leadScore: 0,
    interestLevel: 'Not Answered',
    classification: 'Cold',
    callbackDateTime: null,
  };
}

/**
 * Retrieve relevant knowledge snippets using cosine similarity RAG
 */
async function searchKnowledgeBase(userId, queryText, settings) {
  if (!settings || !settings.knowledgeBase || settings.knowledgeBase.length === 0) {
    return '';
  }

  const queryEmbedding = await getEmbedding(queryText);
  if (!queryEmbedding) return '';

  const container = getContainer('aiSettings');
  const querySpec = {
    query: 'SELECT c.text, c.embedding FROM c WHERE c.userId = @userId AND c.docType = @docType',
    parameters: [
      { name: '@userId', value: userId },
      { name: '@docType', value: 'knowledgeChunk' },
    ],
  };

  try {
    const { resources } = await container.items.query(querySpec).fetchAll();
    if (!resources || resources.length === 0) return '';

    // Calculate similarity in JS (fast for <= 1000 chunks)
    const matches = resources.map((chunk) => {
      const similarity = dotProduct(queryEmbedding, chunk.embedding);
      return { text: chunk.text, similarity };
    });

    // Sort and take top 3
    matches.sort((a, b) => b.similarity - a.similarity);
    const topMatches = matches.slice(0, 3).filter((m) => m.similarity > 0.6);

    return topMatches.map((m) => m.text).join('\n\n');
  } catch (err) {
    logger.error('Error during RAG search:', err);
    return '';
  }
}

function dotProduct(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    mA += a[i] * a[i];
    mB += b[i] * b[i];
  }
  return dot / (Math.sqrt(mA) * Math.sqrt(mB));
}

module.exports = {
  getEmbedding,
  analyzeCallTranscript,
  searchKnowledgeBase,
};
