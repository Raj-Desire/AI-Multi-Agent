const express = require('express');
const { body, param, query } = require('express-validator');
const twilio = require('twilio');
const { v4: uuidv4 } = require('uuid');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const logger = require('../utils/logger');

let pdf;
try {
  pdf = require('pdf-parse');
} catch (err) {
  logger.warn('pdf-parse module not found. PDF indexing will be disabled until "npm install" is run.');
}

const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { getAiSettings, upsertAiSettings, addKnowledgeBaseDoc, removeKnowledgeBaseDoc } = require('../repositories/aiSettingsRepository');
const { createAiCall, getAiCallById, getAiCallByIdGlobal, updateAiCallById, listAiCalls, getAiCallAnalytics, findAiCallByCallSid } = require('../repositories/aiCallRepository');
const { getTwilioSettingsByUserId, decryptSettings } = require('../repositories/twilioSettingsRepository');
const { getGlobalNumberById } = require('../repositories/globalTwilioNumberRepository');
const { uploadRecordingBuffer } = require('../services/blobStorageService');
const { getEmbedding } = require('../services/openaiService');
const { getContainer } = require('../database/cosmosClient');

const router = express.Router();

function toE164Number(numStr) {
  if (!numStr) return null;
  const normalized = String(numStr).trim();
  const parsed = parsePhoneNumberFromString(normalized.startsWith('+') ? normalized : `+${normalized.replace(/\D/g, '')}`);
  if (parsed && parsed.isValid()) {
    return parsed.number;
  }
  return normalized;
}

// ─── POST /api/ai/calls/start ───────────────────────────────────────────────
// Start an outbound AI call
router.post('/calls/start', authenticate, [
  body('toNumber').trim().notEmpty().withMessage('Target phone number is required'),
  body('fromNumber').trim().notEmpty().withMessage('Twilio outbound number is required'),
  validate,
], async (req, res) => {
  try {
    const { toNumber: rawToNumber, fromNumber: rawFromNumber } = req.body;
    const userId = req.user.id;

    const toNumber = toE164Number(rawToNumber);
    const fromNumber = toE164Number(rawFromNumber);

    if (!toNumber) {
      return res.status(400).json({ error: 'A valid target phone number is required.' });
    }

    // Fetch Twilio credentials
    const twilioSettingsDoc = await getTwilioSettingsByUserId(userId);
    if (!twilioSettingsDoc || !twilioSettingsDoc.isConfigured) {
      return res.status(400).json({ error: 'Twilio credentials not configured. Please set them up in settings.' });
    }
    const twilioSettings = decryptSettings(twilioSettingsDoc);

    const client = twilio(twilioSettings.accountSid, twilioSettings.authToken);

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    // Construct webhook URL for Twilio to request TwiML on connect
    const twimlUrl = `${baseUrl}/api/ai/voice/twiml?userId=${encodeURIComponent(userId)}&to=${encodeURIComponent(toNumber)}&from=${encodeURIComponent(fromNumber)}`;

    logger.info(`Starting Outbound AI Call: To=${toNumber}, From=${fromNumber}, Webhook=${twimlUrl}`);

    const statusCallbackUrl = `${baseUrl}/api/ai/voice/status`;

    const call = await client.calls.create({
      url: twimlUrl,
      to: toNumber,
      from: fromNumber,
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    // Register call in memory for real-time tracking
    try {
      const { addActiveCall } = require('../services/aiVoiceHandler');
      addActiveCall(call.sid, {
        callSid: call.sid,
        toNumber,
        fromNumber,
        userId,
        status: 'initiated',
        startedAt: new Date().toISOString(),
      });
    } catch (trackErr) {
      logger.error('Failed to track initiated call in memory:', trackErr);
    }

    // Pre-create the call log entry in Cosmos DB in the background without blocking the response!
    createAiCall({
      userId,
      callSid: call.sid,
      toNumber,
      fromNumber,
      status: 'initiated',
    }).catch((err) => {
      logger.error('Failed to pre-create AI call log in Cosmos DB:', err);
    });

    res.json({
      message: 'AI call initiated successfully.',
      callSid: call.sid,
      status: call.status,
    });
  } catch (error) {
    logger.error('Failed to initiate AI call:', error);
    res.status(500).json({ error: error.message || 'Failed to start AI call.' });
  }
});

async function generateTwiml(req, res) {
  try {
    const to = req.query.to || req.body.to || 'Unknown';
    const from = req.query.from || req.body.from || 'Unknown';
    const userId = req.query.userId || req.body.userId;

    let wsHost = req.get('host');
    let wsProtocol = 'wss';

    if (process.env.BASE_URL) {
      try {
        const parsedBase = new URL(process.env.BASE_URL);
        wsHost = parsedBase.host;
        wsProtocol = parsedBase.protocol === 'https:' ? 'wss' : 'ws';
      } catch (e) {
        // Fallback
      }
    } else {
      wsProtocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
    }

    const streamUrl = `${wsProtocol}://${wsHost}/media-stream?userId=${encodeURIComponent(userId || '')}&to=${encodeURIComponent(to)}&from=${encodeURIComponent(from)}`;

    logger.info(`Generating TwiML connect stream: ${streamUrl}`);

    const response = new twilio.twiml.VoiceResponse();
    const connect = response.connect();
    const stream = connect.stream({ url: streamUrl });
    stream.parameter({ name: 'userId', value: userId || '' });
    stream.parameter({ name: 'to', value: to || '' });
    stream.parameter({ name: 'from', value: from || '' });

    res.type('text/xml');
    res.send(response.toString());
  } catch (err) {
    logger.error('Error generating TwiML for AI call:', err);
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Error connecting to AI outbound system.</Say><Hangup/></Response>`);
  }
}

// ─── POST /api/ai/voice/twiml ────────────────────────────────────────────────
// Webhook for Twilio to request TwiML
router.post('/voice/twiml', generateTwiml);
router.get('/voice/twiml', generateTwiml);

// ─── POST /api/ai/voice/status ────────────────────────────────────────────────
// Webhook for Twilio to update call status
router.post('/voice/status', async (req, res) => {
  try {
    const { CallSid, CallStatus } = req.body;
    logger.info(`Twilio AI Voice Status Callback: callSid=${CallSid}, status=${CallStatus}`);

    const endingStatuses = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
    if (endingStatuses.includes(CallStatus)) {
      const { removeActiveCall } = require('../services/aiVoiceHandler');
      removeActiveCall(CallSid);
      logger.info(`Removed active call ${CallSid} from memory due to status: ${CallStatus}`);

      // Sync the database call log if it is not already finalized
      try {
        const aiCall = await findAiCallByCallSid(CallSid);
        if (aiCall && aiCall.status !== 'completed' && aiCall.status !== 'failed' && aiCall.status !== 'in-progress') {
          const finalStatus = CallStatus === 'completed' ? 'completed' : 'failed';
          await updateAiCallById(aiCall.userId, aiCall.id, {
            status: finalStatus,
            endedAt: new Date().toISOString()
          });
          logger.info(`Updated database call log ${CallSid} status to: ${finalStatus}`);
        }
      } catch (dbErr) {
        logger.error(`Failed to update status callback for ${CallSid}:`, dbErr);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    logger.error('Failed to handle Twilio AI status callback:', err);
    res.sendStatus(500);
  }
});

// ─── GET /api/ai/calls/active ───────────────────────────────────────────────
// Get active calls list for current user
router.get('/calls/active', authenticate, (req, res) => {
  try {
    const { getActiveCalls } = require('../services/aiVoiceHandler');
    const allActive = getActiveCalls();
    // Filter to only return calls initiated by this user
    const userActive = allActive.filter(c => c.userId === req.user.id);
    res.json(userActive);
  } catch (error) {
    logger.error('Failed to get active calls:', error);
    res.status(500).json({ error: 'Failed to retrieve active calls.' });
  }
});

// ─── POST /api/ai/calls/active/:callSid/hangup ───────────────────────────────
// Manually terminate a specific active call
router.post('/calls/active/:callSid/hangup', authenticate, async (req, res) => {
  try {
    const { callSid } = req.params;
    const userId = req.user.id;

    logger.info(`Requested manual hangup for active call Sid: ${callSid} by userId: ${userId}`);

    // Verify ownership of the active call or check if the user is an admin
    const { getActiveCalls } = require('../services/aiVoiceHandler');
    const activeCall = getActiveCalls().find(c => c.callSid === callSid);

    const isAdmin = ['superadmin', 'admin'].includes(req.user.role);
    if (activeCall && activeCall.userId !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied. You do not own this call.' });
    }

    // Call Twilio to complete/hangup the call
    const { getTwilioClient } = require('../utils/twilioClient');
    const { client } = await getTwilioClient(userId);

    await client.calls(callSid).update({ status: 'completed' });

    // Instantly remove it from in-memory tracking
    const { removeActiveCall } = require('../services/aiVoiceHandler');
    removeActiveCall(callSid);

    res.json({ message: 'Call terminated successfully.' });
  } catch (error) {
    logger.error('Failed to manually terminate call:', error);
    res.status(500).json({ error: error.message || 'Failed to terminate call.' });
  }
});

// ─── GET /api/ai/calls ───────────────────────────────────────────────────────
// List call logs
router.get('/calls', authenticate, async (req, res) => {
  try {
    const filters = {
      userId: req.user.id,
      role: req.user.role,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      search: req.query.search || '',
      country: req.query.country || '',
      interestLevel: req.query.interestLevel || '',
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      minLeadScore: req.query.minLeadScore !== undefined ? parseInt(req.query.minLeadScore) : undefined,
      maxLeadScore: req.query.maxLeadScore !== undefined ? parseInt(req.query.maxLeadScore) : undefined,
      filterUserId: req.query.filterUserId || null,
      receivedStatus: req.query.receivedStatus || '',
    };

    const data = await listAiCalls(filters);
    res.json(data);
  } catch (error) {
    logger.error('Failed to list AI calls:', error);
    res.status(500).json({ error: 'Failed to retrieve AI calls history.' });
  }
});

// ─── GET /api/ai/calls/analytics ──────────────────────────────────────────────
// Fetch dashboard analytics
router.get('/calls/analytics', authenticate, async (req, res) => {
  try {
    const data = await getAiCallAnalytics({
      userId: req.user.id,
      role: req.user.role,
      filterUserId: req.query.filterUserId || null,
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      receivedStatus: req.query.receivedStatus || '',
    });
    res.json(data);
  } catch (error) {
    logger.error('Failed to get AI analytics:', error);
    res.status(500).json({ error: 'Failed to retrieve AI analytics.' });
  }
});

// ─── GET /api/ai/calls/sid/:callSid ──────────────────────────────────────────
// Fetch call log details by Twilio callSid
router.get('/calls/sid/:callSid', authenticate, async (req, res) => {
  try {
    const { findAiCallByCallSid } = require('../repositories/aiCallRepository');
    const call = await findAiCallByCallSid(req.params.callSid);
    if (!call) {
      return res.status(404).json({ error: 'AI Call log not found for SID.' });
    }
    res.json(call);
  } catch (error) {
    logger.error('Failed to fetch AI call details by SID:', error);
    res.status(500).json({ error: 'Failed to retrieve AI call details by SID.' });
  }
});

// ─── GET /api/ai/calls/:id ───────────────────────────────────────────────────
// Fetch single call log
router.get('/calls/:id', authenticate, async (req, res) => {
  try {
    const call = await getAiCallByIdGlobal(req.params.id);
    if (!call) {
      return res.status(404).json({ error: 'AI Call log not found.' });
    }
    // Allow all team members to view call log details
    res.json(call);
  } catch (error) {
    logger.error('Failed to fetch AI call details:', error);
    res.status(500).json({ error: 'Failed to retrieve AI call details.' });
  }
});

// ─── GET /api/ai/settings ────────────────────────────────────────────────────
// Get Prompt configuration settings
router.get('/settings', authenticate, async (req, res) => {
  try {
    const settings = await getAiSettings(req.user.id);
    res.json(settings);
  } catch (error) {
    logger.error('Failed to get AI settings:', error);
    res.status(500).json({ error: 'Failed to retrieve AI settings.' });
  }
});

// ─── PUT /api/ai/settings ────────────────────────────────────────────────────
// Update settings
router.put('/settings', authenticate, async (req, res) => {
  try {
    const updated = await upsertAiSettings(req.user.id, req.body);
    res.json({ message: 'AI settings updated successfully.', settings: updated });
  } catch (error) {
    logger.error('Failed to update AI settings:', error);
    res.status(500).json({ error: 'Failed to save AI settings.' });
  }
});

// ─── POST /api/ai/settings/upload ────────────────────────────────────────────
// RAG document upload & embedding indexing
router.post('/settings/upload', authenticate, [
  body('name').trim().notEmpty(),
  body('base64').notEmpty(),
  validate,
], async (req, res) => {
  try {
    const { name, base64, type = 'text/plain', size = 0 } = req.body;
    const userId = req.user.id;

    // Decode file content
    const buffer = Buffer.from(base64, 'base64');
    let textContent = '';

    if (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
      const pdfData = await pdf(buffer);
      textContent = pdfData.text;
    } else {
      textContent = buffer.toString('utf-8');
    }

    if (!textContent.trim()) {
      return res.status(400).json({ error: 'Document appears to be empty.' });
    }

    // Upload raw file to Blob Storage
    const blobName = `knowledge/${userId}/${Date.now()}-${name}`;
    const uploadRes = await uploadRecordingBuffer({
      blobName,
      buffer,
      contentType: type,
    });

    const fileId = uuidv4();
    const fileMeta = {
      id: fileId,
      name,
      type,
      size,
      uploadedAt: new Date().toISOString(),
      blobName,
      blobUrl: uploadRes.blobUrl,
    };

    // Split text into chunks (~1000 characters with 100 character overlap)
    const chunkSize = 1000;
    const overlap = 100;
    const chunks = [];
    let index = 0;

    while (index < textContent.length) {
      const chunkText = textContent.substring(index, index + chunkSize).trim();
      if (chunkText) {
        chunks.push(chunkText);
      }
      index += chunkSize - overlap;
    }

    // Save chunks with embeddings to Cosmos DB
    const container = getContainer('aiSettings');
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const embedding = await getEmbedding(chunkText);
      
      if (embedding) {
        await container.items.create({
          id: uuidv4(),
          userId,
          docType: 'knowledgeChunk',
          fileId,
          text: chunkText,
          embedding,
          chunkIndex: i,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Update settings knowledgeBase listing
    const settings = await addKnowledgeBaseDoc(userId, fileMeta);

    res.json({
      message: 'Knowledge base file processed and indexed successfully.',
      file: fileMeta,
      settings,
    });
  } catch (error) {
    logger.error('Failed to process and index knowledge document:', error);
    res.status(500).json({ error: error.message || 'Failed to upload knowledge document.' });
  }
});

// ─── DELETE /api/ai/settings/files/:fileId ────────────────────────────────────
// Remove document and delete associated embeddings
router.delete('/settings/files/:fileId', authenticate, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    // Remove file entry from settings
    const docRemoved = await removeKnowledgeBaseDoc(userId, fileId);
    if (!docRemoved) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Delete knowledge chunks from Cosmos DB
    const container = getContainer('aiSettings');
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType AND c.fileId = @fileId',
      parameters: [
        { name: '@userId', value: userId },
        { name: '@docType', value: 'knowledgeChunk' },
        { name: '@fileId', value: fileId },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    for (const chunk of resources) {
      await container.item(chunk.id, userId).delete();
    }

    res.json({ message: 'Knowledge document and indexed embeddings removed successfully.' });
  } catch (error) {
    logger.error('Failed to delete knowledge document:', error);
    res.status(500).json({ error: 'Failed to delete knowledge document.' });
  }
});

module.exports = router;
