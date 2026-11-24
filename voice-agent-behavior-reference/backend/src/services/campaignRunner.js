const twilio = require('twilio');
const logger = require('../utils/logger');
const { getTwilioSettingsByUserId, decryptSettings } = require('../repositories/twilioSettingsRepository');
const { createAiCall, getAiCallById, findAiCallByCallSid } = require('../repositories/aiCallRepository');
const { addActiveCall, getActiveCalls } = require('./aiVoiceHandler');
const {
  listAllActiveOrScheduledCampaigns,
  updateCampaign,
} = require('../repositories/campaignRepository');

let running = false;
let runnerInterval = null;

// Normalizes to E.164
function toE164Number(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (phone.startsWith('+')) {
    return `+${cleaned}`;
  }
  // Fallback default
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  return `+${cleaned}`;
}

async function triggerOutboundCall({ userId, campaignId, contactId, toNumber: rawToNumber, fromNumber: rawFromNumber }) {
  const toNumber = toE164Number(rawToNumber);
  const fromNumber = toE164Number(rawFromNumber);

  if (!toNumber) {
    throw new Error('Invalid target phone number format.');
  }

  // Fetch Twilio credentials
  const twilioSettingsDoc = await getTwilioSettingsByUserId(userId);
  if (!twilioSettingsDoc || !twilioSettingsDoc.isConfigured) {
    throw new Error('Twilio credentials not configured for user.');
  }
  const twilioSettings = decryptSettings(twilioSettingsDoc);

  const client = twilio(twilioSettings.accountSid, twilioSettings.authToken);

  const baseUrl = process.env.BASE_URL || 'https://twiliowebdialer-desire.azurewebsites.net';

  const twimlUrl = `${baseUrl}/api/ai/voice/twiml?userId=${encodeURIComponent(userId)}&to=${encodeURIComponent(toNumber)}&from=${encodeURIComponent(fromNumber)}`;
  const statusCallbackUrl = `${baseUrl}/api/ai/voice/status`;

  logger.info(`Campaign Outbound AI Call Initiating: To=${toNumber}, From=${fromNumber}, Webhook=${twimlUrl}`);

  const call = await client.calls.create({
    url: twimlUrl,
    to: toNumber,
    from: fromNumber,
    statusCallback: statusCallbackUrl,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });

  // Register in-memory active call
  try {
    addActiveCall(call.sid, {
      callSid: call.sid,
      toNumber,
      fromNumber,
      userId,
      status: 'initiated',
      startedAt: new Date().toISOString(),
    });
  } catch (trackErr) {
    logger.error('Failed to track initiated campaign call in memory:', trackErr);
  }

  // Pre-create the call log in Cosmos DB
  await createAiCall({
    userId,
    callSid: call.sid,
    toNumber,
    fromNumber,
    status: 'initiated',
    campaignId,         // link to campaign
    campaignContactId: contactId,
  });

  return call.sid;
}

async function runCampaignTick() {
  if (running) return;
  running = true;

  try {
    const campaigns = await listAllActiveOrScheduledCampaigns();
    const now = new Date();

    for (const campaign of campaigns) {
      let changed = false;

      // 1. Process "scheduled" campaigns whose start time has arrived
      if (campaign.status === 'scheduled') {
        const scheduledTime = new Date(campaign.scheduledTime);
        if (scheduledTime <= now) {
          campaign.status = 'active';
          campaign.triggeredAt = now.toISOString();
          changed = true;
          logger.info(`Campaign '${campaign.name}' (${campaign.id}) transitioned from scheduled to active at ${campaign.triggeredAt}.`);
        } else {
          continue; // Not time yet
        }
      }

      if (campaign.status !== 'active') continue;

      // 2. Sync outcomes of already initiated calls
      const inProgressContacts = campaign.contacts.filter(
        c => ['Dialing', 'Talking', 'Processing'].includes(c.status)
      );

      for (const contact of inProgressContacts) {
        if (!contact.callSid) continue;

        try {
          const aiCall = await findAiCallByCallSid(contact.callSid, campaign.userId);
          if (aiCall) {
            // Update contact status according to the call log status in DB
            if (aiCall.status === 'completed' || aiCall.status === 'failed') {
              const isEndedInstantly = aiCall.duration > 0 && aiCall.duration <= 12 && 
                (aiCall.interestLevel === 'Wrong Number' || aiCall.interestLevel === 'Not Interested');

              contact.status = isEndedInstantly ? 'Ended Instantly' : 'Completed';
              contact.result = aiCall.interestLevel || 'Neutral';
              contact.duration = aiCall.duration;
              contact.leadScore = aiCall.leadScore;
              contact.summary = aiCall.summary || '';
              contact.transcript = aiCall.transcript || [];
              changed = true;

              logger.info(`Contact ${contact.name} in campaign '${campaign.name}' updated to completed/ended-instantly. Result: ${contact.result}`);
            } else if (aiCall.status === 'in-progress') {
              if (contact.status === 'Dialing') {
                contact.status = 'Talking';
                changed = true;
              }
              // Add a timeout check (5 minutes) for talking calls in case of webhook failure
              const startedTime = new Date(aiCall.startedAt || campaign.updatedAt).getTime();
              const elapsedMs = Date.now() - startedTime;
              if (elapsedMs > 5 * 60 * 1000) {
                contact.status = 'Completed';
                contact.result = 'Completed (Max Talk Time)';
                changed = true;
                logger.warn(`Contact ${contact.name} in campaign '${campaign.name}' reached maximum talk time limit.`);
              }
            } else if (aiCall.status === 'initiated' || aiCall.status === 'ringing') {
              // Add a timeout check (90 seconds) in case of webhook/tunnel failure
              const startedTime = new Date(aiCall.startedAt || campaign.updatedAt).getTime();
              const elapsedMs = Date.now() - startedTime;
              if (elapsedMs > 90 * 1000) {
                contact.status = 'Failed';
                contact.result = 'Call Timeout (Webhook Offline)';
                changed = true;
                logger.warn(`Contact ${contact.name} in campaign '${campaign.name}' timed out in ${aiCall.status} state.`);
              }
            }
          } else {
            // If the call is not found and has been Dialing/Processing for over 5 minutes, mark as failed
            const elapsed = Date.now() - new Date(campaign.updatedAt).getTime();
            if (elapsed > 5 * 60 * 1000) {
              contact.status = 'Failed';
              contact.result = 'Timeout / Lost Session';
              changed = true;
              logger.warn(`Contact ${contact.name} in campaign '${campaign.name}' timed out waiting for call log.`);
            }
          }
        } catch (syncErr) {
          logger.error(`Error syncing contact ${contact.name} call log:`, syncErr);
        }
      }

      // 3. Dial next pending contacts up to the concurrency limit
      const currentActiveCount = campaign.contacts.filter(
        c => ['Dialing', 'Talking', 'Processing'].includes(c.status)
      ).length;

      const pendingContacts = campaign.contacts.filter(c => c.status === 'Pending');

      if (currentActiveCount < campaign.concurrencyLimit && pendingContacts.length > 0) {
        const slotsAvailable = campaign.concurrencyLimit - currentActiveCount;
        const contactsToLaunch = pendingContacts.slice(0, slotsAvailable);

        for (const contact of contactsToLaunch) {
          try {
            // Mark contact as Dialing first to prevent duplicate dial attempts on next ticks
            contact.status = 'Dialing';
            changed = true;

            const callSid = await triggerOutboundCall({
              userId: campaign.userId,
              campaignId: campaign.id,
              contactId: contact.id,
              toNumber: contact.phoneNumber,
              fromNumber: campaign.fromNumber,
            });

            contact.callSid = callSid;
          } catch (dialErr) {
            logger.error(`Failed to trigger campaign dial for contact ${contact.name}:`, dialErr);
            let errText = dialErr.message || 'Dial Error';
            if (errText.toUpperCase().includes('NOT AUTHORIZED') || errText.toUpperCase().includes('INTERNATIONAL PERMISSIONS')) {
              errText = 'Not Authorized';
            }
            contact.result = errText;
          }
        }
      }

      // 4. Check if campaign is finished
      const unfinished = campaign.contacts.some(
        c => ['Pending', 'Dialing', 'Talking', 'Processing'].includes(c.status)
      );

      if (!unfinished && campaign.contacts.length > 0 && campaign.status === 'active') {
        campaign.status = 'completed';
        changed = true;
        logger.info(`Campaign '${campaign.name}' (${campaign.id}) finished processing all contacts.`);
      }

      // 5. Persist updates if anything changed
      if (changed) {
        await updateCampaign(campaign.userId, campaign.id, {
          status: campaign.status,
          contacts: campaign.contacts,
        });
      }
    }
  } catch (err) {
    logger.error('Error running campaign runner tick:', err);
  } finally {
    running = false;
  }
}

function initCampaignRunner() {
  if (runnerInterval) return;

  logger.info('Initializing Background AI Campaigns Runner Poller (every 10s)...');
  runnerInterval = setInterval(runCampaignTick, 10000);
}

module.exports = {
  initCampaignRunner,
  runCampaignTick,
};
