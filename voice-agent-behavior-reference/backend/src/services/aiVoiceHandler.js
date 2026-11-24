const WebSocket = require('ws');
const twilio = require('twilio');
const { getAiSettings } = require('../repositories/aiSettingsRepository');
const { createAiCall, updateAiCallById, findAiCallByCallSid } = require('../repositories/aiCallRepository');
const { getTwilioSettingsByUserId, decryptSettings } = require('../repositories/twilioSettingsRepository');
const { uploadRecordingBuffer } = require('./blobStorageService');
const { analyzeCallTranscript } = require('./openaiService');
const logger = require('../utils/logger');

// WAV header utility for mono 8000Hz G.711 mulaw audio
function createWavHeader(dataLength) {
  const buffer = Buffer.alloc(46);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4); // File size - 8
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(18, 16);             // Subchunk1Size (18 for non-PCM)
  buffer.writeUInt16LE(7, 20);              // AudioFormat (0x0007 = mu-law)
  buffer.writeUInt16LE(1, 22);              // NumChannels (1 = Mono)
  buffer.writeUInt32LE(8000, 24);           // SampleRate (8000 Hz)
  buffer.writeUInt32LE(8000, 28);           // ByteRate (8000 * 1 * 1)
  buffer.writeUInt16LE(1, 32);              // BlockAlign
  buffer.writeUInt16LE(8, 34);              // BitsPerSample (8 bits)
  buffer.writeUInt16LE(0, 36);              // cbSize
  buffer.write('data', 38);
  buffer.writeUInt32LE(dataLength, 42);     // Subchunk2Size
  return buffer;
}

// In-memory active calls lookup
const activeCalls = new Map();

function addActiveCall(callSid, data) {
  activeCalls.set(callSid, {
    callSid,
    toNumber: data.toNumber,
    fromNumber: data.fromNumber,
    userId: data.userId,
    status: data.status || 'initiated',
    userSpoke: false,
    startedAt: data.startedAt || new Date().toISOString()
  });
}

function removeActiveCall(callSid) {
  activeCalls.delete(callSid);
}

function getActiveCalls() {
  return Array.from(activeCalls.values());
}

// Periodically clean up initiated calls stuck for more than 45 seconds
setInterval(() => {
  const now = Date.now();
  for (const [callSid, call] of activeCalls.entries()) {
    if (call.status === 'initiated' && (now - new Date(call.startedAt).getTime() > 45000)) {
      activeCalls.delete(callSid);
      logger.info(`Cleaned up stale initiated call Sid: ${callSid}`);
    }
  }
}, 10000);

function handleTwilioMediaConnection(twilioWs, req) {
  logger.info('Twilio Media Stream connection established.');

  let streamSid = null;
  let callSid = null;
  let userId = null;
  let deepgramWs = null;
  let decryptedTwilio = null;
  let toNumber = 'Unknown';
  let fromNumber = 'Unknown';
  let settings = null;
  let settingsSent = false;
  let firstMessageInjected = false;
  let isCleanedUp = false;
  
  // Audio accumulation buffers
  const audioChunks = [];
  const transcript = [];
  let durationTimer = null;
  let durationSeconds = 0;
  let timeLimitTriggered = false;

  // Silence & activity detection
  let userSpoke = false;
  let silenceAlertTimer = null;
  let silenceHangupTimer = null;
  let keepAliveTimer = null;
  let inactivityTimer = null;
  let hardSafetyTimer = null;
  let lastAudioTime = Date.now();

  // Unified teardown function to prevent zombie connections & leaks
  function cleanup(reason = 'normal') {
    if (isCleanedUp) return;
    isCleanedUp = true;

    logger.info(`🧹 Connection cleanup triggered for callSid: ${callSid || 'unknown'} (Reason: ${reason})`);

    // 1. Clear all active timers
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
    if (inactivityTimer) { clearInterval(inactivityTimer); inactivityTimer = null; }
    if (hardSafetyTimer) { clearTimeout(hardSafetyTimer); hardSafetyTimer = null; }
    clearSilenceTimers();

    // 2. Remove from active calls map
    if (callSid) {
      activeCalls.delete(callSid);
    }

    // 3. Gracefully close Deepgram WebSocket & send CloseStream frame
    if (deepgramWs) {
      try {
        if (deepgramWs.readyState === WebSocket.OPEN) {
          logger.info('Sending CloseStream frame to Deepgram Voice Agent.');
          deepgramWs.send(JSON.stringify({ type: 'CloseStream' }));
        }
        if (deepgramWs.readyState === WebSocket.OPEN || deepgramWs.readyState === WebSocket.CONNECTING) {
          deepgramWs.close(1000, 'Normal Closure');
        }
      } catch (closeErr) {
        logger.warn(`Error closing Deepgram WebSocket for callSid ${callSid}: ${closeErr.message}`);
      }
      deepgramWs = null;
    }

    // 4. Close Twilio Media Stream WebSocket
    if (twilioWs) {
      try {
        if (twilioWs.readyState === WebSocket.OPEN || twilioWs.readyState === WebSocket.CONNECTING) {
          twilioWs.close();
        }
      } catch (twilioCloseErr) {
        logger.warn(`Error closing Twilio WebSocket for callSid ${callSid}: ${twilioCloseErr.message}`);
      }
    }
  }

  // Hard Safety Cap: Max 300 seconds (5 mins) absolute hard limit per call session
  hardSafetyTimer = setTimeout(() => {
    logger.warn(`⚠️ HARD SAFETY MAX LIMIT (300s) reached for callSid: ${callSid || 'unknown'}. Forcing socket cleanup.`);
    cleanup('hard-safety-timeout-300s');
  }, 300000);

  // Inactivity Safety Monitor: If media payload stops arriving for 20 seconds, terminate sockets
  inactivityTimer = setInterval(() => {
    if (streamSid && (Date.now() - lastAudioTime > 20000)) {
      logger.warn(`⚠️ MEDIA INACTIVITY DETECTED (>20s silent stream) for callSid: ${callSid || 'unknown'}. Cleaning up sockets.`);
      cleanup('media-inactivity-20s');
    }
  }, 5000);

  function startKeepAlive() {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    keepAliveTimer = setInterval(() => {
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.send(JSON.stringify({ type: 'KeepAlive' }));
      } else {
        cleanup('keepalive-ws-not-open');
      }
    }, 5000);
  }

  function clearSilenceTimers() {
    if (silenceAlertTimer) {
      clearTimeout(silenceAlertTimer);
      silenceAlertTimer = null;
    }
    if (silenceHangupTimer) {
      clearTimeout(silenceHangupTimer);
      silenceHangupTimer = null;
    }
  }

  // Dynamic call limit (180s if user spoke, 60s if no user response)
  durationTimer = setInterval(() => {
    durationSeconds++;
    
    const activeLimit = userSpoke ? 180 : 60;
    
    if (durationSeconds >= activeLimit && !timeLimitTriggered && userId && callSid) {
      timeLimitTriggered = true;
      logger.info(`Call duration reached ${activeLimit} seconds limit for callSid: ${callSid}. Injecting wrap-up.`);
      
      try {
        if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
          const wrapUpMessage = "Thank you for your time. We will connect with you via email or call shortly. Goodbye!";
          deepgramWs.send(JSON.stringify({
            type: 'InjectAgentMessage',
            message: wrapUpMessage,
          }));
          
          // Wait 15 seconds for the speech to complete before hanging up call
          setTimeout(async () => {
            try {
              const { getTwilioClient } = require('../utils/twilioClient');
              const { client } = await getTwilioClient(userId);
              await client.calls(callSid).update({ status: 'completed' });
              logger.info(`Call hung up successfully after ${activeLimit}s limit for callSid: ${callSid}`);
            } catch (hangupErr) {
              logger.error(`Error hanging up call after ${activeLimit}s limit:`, hangupErr);
              cleanup('wrapup-hangup-error');
            }
          }, 15000);
        } else {
          cleanup('wrapup-ws-not-open');
        }
      } catch (err) {
        logger.error(`Error handling ${activeLimit}s limit:`, err);
        cleanup('wrapup-exception');
      }
    }
  }, 1000);

  twilioWs.on('message', async (message) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.event === 'start') {
        streamSid = msg.streamSid;
        callSid = msg.start.callSid;
        settingsSent = false;
        firstMessageInjected = false;
        lastAudioTime = Date.now();
        logger.info(`Twilio stream started: streamSid=${streamSid}, callSid=${callSid}`);

        // Update active call status
        const active = activeCalls.get(callSid);
        if (active) {
          active.status = 'in-progress';
          active.startedAt = new Date().toISOString();
        } else {
          activeCalls.set(callSid, {
            callSid,
            toNumber: 'Connecting...',
            fromNumber: 'Connecting...',
            status: 'in-progress',
            userSpoke: false,
            startedAt: new Date().toISOString()
          });
        }

        // Start Deepgram connection
        const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
        if (!deepgramApiKey) {
          logger.error('DEEPGRAM_API_KEY environment variable is not set!');
          cleanup('missing-deepgram-api-key');
          return;
        }

        logger.info('Connecting to Deepgram Voice Agent API...');
        const deepgramUrl = 'wss://agent.deepgram.com/v1/agent/converse';
        deepgramWs = new WebSocket(deepgramUrl, ['token', deepgramApiKey]);

        const customParams = msg.start.customParameters || {};
        const paramUserId = customParams.userId || null;
        const paramTo = customParams.to || null;
        const paramFrom = customParams.from || null;

        // Choose fast path using custom parameters if available, otherwise fallback path
        let dbPromise;
        if (paramUserId) {
          logger.info(`Fast path: Found userId ${paramUserId} in customParameters.`);
          userId = paramUserId;
          toNumber = paramTo || 'Unknown';
          fromNumber = paramFrom || 'Unknown';

          dbPromise = (async () => {
            const [settingsDoc, twilioSettingsDoc] = await Promise.all([
              getAiSettings(paramUserId),
              getTwilioSettingsByUserId(paramUserId),
            ]);
            
            if (!twilioSettingsDoc) {
              throw new Error('Twilio settings are not configured for this user.');
            }
            const decryptedTwilioVal = decryptSettings(twilioSettingsDoc);
            
            findAiCallByCallSid(callSid, paramUserId).then(async (existingCall) => {
              if (existingCall) {
                await updateAiCallById(paramUserId, existingCall.id, {
                  status: 'in-progress',
                  startedAt: new Date().toISOString(),
                });
                logger.info(`Updated call log status to in-progress for callSid: ${callSid}`);
              }
            }).catch((err) => {
              logger.error('Failed to update call log in background:', err);
            });

            return {
              userId: paramUserId,
              settings: settingsDoc,
              decryptedTwilio: decryptedTwilioVal,
              toNumber,
              fromNumber
            };
          })();
        } else {
          logger.info('Fallback: No userId in customParameters. Performing lookup...');
          dbPromise = (async () => {
            const existingCall = await findAiCallByCallSid(callSid);
            if (!existingCall) {
              throw new Error(`No call found in DB for callSid: ${callSid}`);
            }
            const userIdVal = existingCall.userId;
            const [settingsDoc, twilioSettingsDoc] = await Promise.all([
              getAiSettings(userIdVal),
              getTwilioSettingsByUserId(userIdVal),
              updateAiCallById(userIdVal, existingCall.id, {
                status: 'in-progress',
                startedAt: new Date().toISOString(),
              })
            ]);
            
            if (!twilioSettingsDoc) {
              throw new Error('Twilio settings are not configured for this user.');
            }
            const decryptedTwilioVal = decryptSettings(twilioSettingsDoc);
            
            return {
              userId: userIdVal,
              settings: settingsDoc,
              decryptedTwilio: decryptedTwilioVal,
              toNumber: existingCall.toNumber || 'Unknown',
              fromNumber: existingCall.fromNumber || 'Unknown'
            };
          })();
        }

        deepgramWs.on('open', async () => {
          try {
            logger.info('Connected to Deepgram Voice Agent API.');

            // Wait for DB data
            const dbData = await dbPromise;
            userId = dbData.userId;
            decryptedTwilio = dbData.decryptedTwilio;
            toNumber = dbData.toNumber;
            fromNumber = dbData.fromNumber;
            settings = dbData.settings;

            // Update active call metadata
            const active = activeCalls.get(callSid);
            if (active) {
              active.toNumber = toNumber;
              active.fromNumber = fromNumber;
              active.userId = userId;
              active.status = 'in-progress';
            }

            // Configure Agent settings
            const systemPrompt = `You are Aria, an AI voice assistant calling on behalf of Vijay's team at DesireInfoWeb.
Speak exactly like a friendly, experienced, and professional human sales representative/business assistant.
Never sound robotic or scripted. Speak naturally, pause appropriately, allow interruptions, remember previous responses and refer to them naturally, never rush, and never pressure the customer.
If the customer asks or comments about you being an AI, acknowledge it warmly and naturally, for example: 'Yes, I'm Aria, an AI assistant calling on behalf of Vijay's team at DesireInfoWeb. I'm here to see if a short conversation is worth your time!' and then steer the conversation back.

## Personality
* Tone/Style: ${settings.toneOfConversation || 'Friendly, Professional, Confident, Calm, Patient, Respectful, Helpful, Consultative'}

## Communication Style
* Keep responses short and natural.
* Speak in a conversational tone.
* Ask only one question at a time.
* Listen carefully before responding.
* Never interrupt the customer. If they interrupt, stop speaking immediately.
* Use acknowledgements naturally (do not overuse): "I understand", "That makes sense", "Absolutely", "I see", "Thanks for sharing", "I appreciate that".
* CRITICAL: Keep all responses extremely short, concise, and direct (max 15-20 words per response). Never speak long paragraphs or dump context.

## About DesireInfoWeb
Vijay's team at DesireInfoWeb helps businesses improve productivity and growth through technology solutions, including:
${settings.servicesOffered || `* Microsoft 365 Solutions and integrations (Teams, SharePoint, Power Automate, PowerApps, etc.)
* AI Solutions (custom voice agents, AI chatbots, LLM integrations)
* Business Process Automation (removing manual, spreadsheet-heavy work)
* Custom Software and Web/Mobile Application Development`}
Focus only on services relevant to the customer's needs.

## 4-Step Call Flow
Ensure you follow these steps in order:

### Step 1 – Initial Greeting and Script Delivery
You will start the call by stating the script:
"${settings.companyIntro || "Hi, this is Aria — I'm an AI assistant calling on behalf of Vijay's team at DesireInfoWeb, a Microsoft solutions partner. I'll be brief and won't take more than twenty seconds. We help teams automate the manual, spreadsheet-based work that takes long time for them, using the Microsoft 365 tools they already have. I'm not selling anything on this call — just checking whether it's worth a short conversation with one of our specialists. Is now an okay time, or would later suit you better? "}"
Wait for the customer's response before continuing.

### Step 2 – Handle Customer's Response to Availability
* If the customer says they are busy, says "later is better", or asks to be called back:
  Acknowledge it naturally and politely, and ask for a better day or time to call back:
  "I completely understand. What would be a better day or time for me to call you back?"
  Wait for their response. Once they reply, confirm:
  "Perfect, I'll make sure one of our team members schedules a call for then. Thank you, and have a great day."
  Then end the call politely.
* If the customer says they are not interested:
  Acknowledge it politely and end the call:
  "No problem at all. Thank you for your time today. If your requirements change in the future, we'd be happy to help. Have a great day!"
  Then end the call.
* If the customer says they are free, it's an okay moment, or asks "what is this about?":
  Proceed to Step 3.

### Step 3 – Understand Their Needs & Qualify
If they are free, proceed to understand their needs. Keep responses conversational and brief.
You MUST state the follow-up script/question exactly word-for-word as your response:
"${settings.followUpQuestions || 'Great, thank you. Are you currently looking for any Microsoft 365, AI, automation, or custom software development services, or do you have anything planned over the next few months?'}"
Wait for their response. Keep responses under 20 words.
Make conversation further as per the client's questions and answers, analyzing their needs properly and answering correctly based on the services we offer.

### Step 4 – Call to Action (Schedule a short chat)
If they engage or show interest, ask for a short chat with our specialists:
"That sounds like something we can definitely help with. Would you be open to a short 10-minute chat with one of our specialists next week to see how we can save you time?"
If they agree, thank them and confirm details.

## CRITICAL OVERRIDE – VOICEMAIL, IVR & AUTOMATED VOICE DETECTION (SAVING CREDITS)
* HIGH PRIORITY DETECTION: You must continuously listen for non-human / machine voices:
  1. Voicemail Systems & Answering Machines (e.g., "Please leave a message after the tone", "You have reached the voicemail of...", "Record your message at the beep", "Your call has been forwarded to an automated voice messaging system", "Please leave your name and number", "Voicemail box is full").
  2. IVR / Automated Phone Menus (e.g., "Press 1 for sales, press 2 for...", "Thank you for calling [Company]", "Your call is important to us, please stay on the line").
  3. AI Agents & Automated Call Screeners (e.g., "Hi, I am an automated assistant screening calls...", "Please state your name and reason for calling", "Call assistant is screening this call").
  4. Pre-recorded Operator / Carrier Announcements (e.g., "The party you are trying to reach is unavailable", "The subscriber is busy", "All circuits are busy").
* MANDATORY CONCLUDING ACTION WHEN DETECTED:
  - DO NOT speak your elevator pitch, do NOT leave a voicemail message, and do NOT try to interact with automated menus or AI screeners.
  - IMMEDIATELY say one polite concluding message: "Thank you for your time. Goodbye!" (or "Thank you, goodbye!").
  - Saying "Thank you for your time. Goodbye!" will instantly trigger the system to disconnect the call immediately to save telephony credits.

## Custom Objection & Escalation Handling Rules
${settings.objectionHandlingRules || "If the customer is busy, ask for a better callback time. If not interested, thank them politely and end the call. If a Voicemail/IVR/Automated machine is detected, say 'Thank you for your time. Goodbye!' and end the call instantly."}

## Restrictions & Formatting Guidelines
* Contact Email: If asked for an email address, ALWAYS state: vijay@desireinfoweb.com (never use info@desireinfoweb.com or any other email address).
* Speech Formatting: NEVER use Markdown symbols like asterisks (**), hashtags (#), or bullet points in your spoken output. Speak plain plain text only so the text-to-speech engine speaks naturally.
* Never invent pricing.
* Never make promises the company cannot guarantee.
* Never provide technical info you are unsure about.
* Never argue or pressure.
* Wrap-up message: "${settings.closingMessage || 'Thank you, and have a great day.'}"`;

            const thinkProvider = {
              type: 'open_ai',
              model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
            };

            const thinkEndpoint = (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY) ? {
              url: `${process.env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, '')}/openai/deployments/${process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o'}/chat/completions?api-version=2024-02-15-preview`,
              headers: {
                'api-key': process.env.AZURE_OPENAI_KEY,
              }
            } : undefined;

            const config = {
              type: 'Settings',
              audio: {
                input: {
                  encoding: 'mulaw',
                  sample_rate: 8000,
                },
                output: {
                  encoding: 'mulaw',
                  sample_rate: 8000,
                  container: 'none',
                },
              },
              agent: {
                listen: {
                  provider: {
                    type: 'deepgram',
                    model: 'nova-2-general',
                  },
                },
                think: {
                  provider: thinkProvider,
                  endpoint: thinkEndpoint,
                  prompt: systemPrompt,
                },
                speak: {
                  provider: {
                    type: 'deepgram',
                    model: 'aura-2-athena-en',
                    speed: 0.9,
                  },
                },
              },
            };

            deepgramWs.send(JSON.stringify(config));
            settingsSent = true;
            logger.info('Deepgram Settings configuration sent to WebSocket.');
          } catch (openErr) {
            logger.error('Error in Deepgram WebSocket open handler / DB load:', openErr);
            cleanup('deepgram-open-error');
          }
        });

        deepgramWs.on('message', async (data, isBinary) => {
          try {
            if (isBinary) {
              // Forward audio from Deepgram to Twilio
              if (streamSid && twilioWs && twilioWs.readyState === WebSocket.OPEN) {
                audioChunks.push(data);

                twilioWs.send(JSON.stringify({
                  event: 'media',
                  streamSid,
                  media: {
                    payload: data.toString('base64'),
                  },
                }));
              }
            } else {
              const responseText = data.toString();
              logger.info(`Deepgram message: ${responseText}`);
              const response = JSON.parse(responseText);

              if (response.type === 'SettingsApplied') {
                logger.info('Deepgram settings applied successfully. Starting KeepAlive.');
                startKeepAlive();

                if (!firstMessageInjected) {
                  firstMessageInjected = true;
                  const firstMessage = (settings?.companyIntro || "Hi, this is Aria — I'm an AI assistant calling on behalf of Vijay's team at DesireInfoWeb, a Microsoft solutions partner. I'll be brief and won't take more than twenty seconds. We help teams automate the manual, spreadsheet-based work that takes long time for them, using the Microsoft 365 tools they already have. I'm not selling anything on this call — just checking whether it's worth a short conversation with one of our specialists. Is now an okay time, or would later suit you better? ").trim();

                  try {
                    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                      deepgramWs.send(JSON.stringify({
                        type: 'InjectAgentMessage',
                        message: firstMessage,
                      }));
                      logger.info(`Injected first message upon SettingsApplied: "${firstMessage}"`);

                      const wordsCount = firstMessage.split(/\s+/).length;
                      const estimatedIntroDurationMs = Math.max(3000, (wordsCount / 2.0) * 1000);
                      const firstSilenceTimeoutMs = estimatedIntroDurationMs + 6000;

                      logger.info(`Starting silence detection check in ${firstSilenceTimeoutMs}ms (intro duration=${estimatedIntroDurationMs}ms)`);
                      silenceAlertTimer = setTimeout(() => {
                        if (!userSpoke) {
                          logger.info('Silence detected after greeting. Injecting follow-up query.');
                          const followUpText = "Hello? Are you there? Are you available?";
                          try {
                            if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                              deepgramWs.send(JSON.stringify({
                                type: 'InjectAgentMessage',
                                message: followUpText,
                              }));
                            }
                          } catch (err) {
                            logger.error('Error injecting silence follow-up:', err);
                          }

                          silenceHangupTimer = setTimeout(async () => {
                            if (!userSpoke) {
                              logger.info('Continued silence detected. Injecting goodbye and hanging up.');
                              const goodbyeText = "It seems you might be busy. We will connect with you via email or call shortly. Goodbye!";
                              try {
                                if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                                  deepgramWs.send(JSON.stringify({
                                    type: 'InjectAgentMessage',
                                    message: goodbyeText,
                                  }));
                                }
                              } catch (err) {
                                logger.error('Error injecting silence goodbye:', err);
                              }

                              setTimeout(async () => {
                                try {
                                  const { getTwilioClient } = require('../utils/twilioClient');
                                  const { client } = await getTwilioClient(userId);
                                  await client.calls(callSid).update({ status: 'completed' });
                                  logger.info(`Call hung up due to silence for callSid: ${callSid}`);
                                } catch (hangupErr) {
                                  logger.error('Error hanging up call due to silence:', hangupErr);
                                  cleanup('silence-hangup-error');
                                }
                              }, 5000);
                            }
                          }, 6000);
                        }
                      }, firstSilenceTimeoutMs);
                    }
                  } catch (injectErr) {
                    logger.error('Error injecting first message:', injectErr);
                  }
                }
              }

              if (response.type === 'UserStartedSpeaking') {
                logger.info('Deepgram detected user starting to speak. Clearing silence timers.');
                userSpoke = true;
                clearSilenceTimers();
                const active = activeCalls.get(callSid);
                if (active) {
                  active.userSpoke = true;
                }
                if (streamSid && twilioWs && twilioWs.readyState === WebSocket.OPEN) {
                  logger.info(`Barge-in: Sending clear event to Twilio to stop agent speech on streamSid: ${streamSid}`);
                  twilioWs.send(JSON.stringify({
                    event: 'clear',
                    streamSid
                  }));
                }
              }

              if (response.type === 'ConversationText') {
                const textVal = (response.content || response.text || '').trim();
                const role = response.role === 'assistant' ? 'agent' : 'user';
                
                if (textVal.length > 0) {
                  const lastEntry = transcript[transcript.length - 1];
                  if (!lastEntry || lastEntry.role !== role || lastEntry.text.trim() !== textVal) {
                    transcript.push({
                      role: role,
                      text: textVal,
                      timestamp: new Date().toISOString(),
                    });
                  }
                }

                if (role === 'user' && textVal.length > 0) {
                  logger.info('User spoken text received. Clearing silence timers.');
                  userSpoke = true;
                  clearSilenceTimers();
                }

                // Auto hangup if agent says the closing message / concludes
                if (role === 'agent') {
                  const lowercaseText = textVal.toLowerCase();
                  const closingMsgLower = (settings?.closingMessage || "thank you for your time").toLowerCase();
                  
                  const isClosingMessage = 
                    lowercaseText.includes(closingMsgLower) ||
                    lowercaseText.includes("thank you for your time") ||
                    lowercaseText.includes("goodbye") ||
                    lowercaseText.includes("have a wonderful day") ||
                    lowercaseText.includes("have a great day") ||
                    lowercaseText.includes("we will connect you via email") ||
                    lowercaseText.includes("connect with you via email") ||
                    lowercaseText.includes("voicemail detected") ||
                    lowercaseText.includes("automated system detected") ||
                    lowercaseText.includes("leaving a message");

                  if (isClosingMessage && callSid) {
                    const isVoicemailOrMachine = 
                      lowercaseText.includes("voicemail detected") || 
                      lowercaseText.includes("automated system detected");

                    const hangupDelay = isVoicemailOrMachine ? 1500 : 5000;
                    logger.info(`Closing/Voicemail message detected in agent response: "${textVal}". Scheduling hangup in ${hangupDelay}ms.`);
                    setTimeout(async () => {
                      try {
                        const { getTwilioClient } = require('../utils/twilioClient');
                        const { client } = await getTwilioClient(userId);
                        await client.calls(callSid).update({ status: 'completed' });
                        logger.info(`Call hung up successfully for callSid: ${callSid}`);
                      } catch (hangupErr) {
                        logger.error('Error hanging up call after closing/voicemail message:', hangupErr);
                        cleanup('closing-hangup-error');
                      }
                    }, hangupDelay);
                  }
                }
              }
            }
          } catch (msgErr) {
            logger.error('Error handling Deepgram message:', msgErr);
          }
        });

        deepgramWs.on('close', (code, reason) => {
          logger.info(`Deepgram connection closed event. Code: ${code}, Reason: ${reason ? reason.toString() : 'None'}`);
          cleanup('deepgram-ws-closed');
        });

        deepgramWs.on('error', (err) => {
          if (err.message && err.message.includes('402')) {
            logger.error('❌ CRITICAL: Deepgram API Key has run out of credits or has no active billing (HTTP 402 Payment Required). Please top up your Deepgram balance at https://console.deepgram.com or update DEEPGRAM_API_KEY in .env.');
          } else {
            logger.error('Deepgram WebSocket error:', err);
          }
          cleanup('deepgram-ws-error');
        });
      }

      if (msg.event === 'media' && deepgramWs && deepgramWs.readyState === WebSocket.OPEN && settingsSent) {
        lastAudioTime = Date.now();
        const audioBuffer = Buffer.from(msg.media.payload, 'base64');
        audioChunks.push(audioBuffer);
        deepgramWs.send(audioBuffer);
      }
    } catch (err) {
      logger.error('Error in Twilio message handler:', err);
    }
  });

  twilioWs.on('close', async () => {
    logger.info('Twilio media stream connection closed.');
    cleanup('twilio-ws-closed');

    try {
      const existingCall = await findAiCallByCallSid(callSid);
      if (existingCall) {
        // Prepare G.711 WAV audio
        let audioUrl = null;
        let blobPath = null;
        if (audioChunks.length > 0) {
          const rawAudioBuffer = Buffer.concat(audioChunks);
          const wavHeader = createWavHeader(rawAudioBuffer.length);
          const wavBuffer = Buffer.concat([wavHeader, rawAudioBuffer]);

          blobPath = `ai-calls/${userId}/${callSid}.wav`;
          const uploadRes = await uploadRecordingBuffer({
            blobName: blobPath,
            buffer: wavBuffer,
            contentType: 'audio/wav',
          });
          audioUrl = uploadRes.blobUrl;
        }

        // Run Azure OpenAI Transcript Analysis (lead scoring, summary, intent, etc.)
        const analysis = await analyzeCallTranscript(transcript);

        await updateAiCallById(userId, existingCall.id, {
          status: 'completed',
          duration: durationSeconds,
          endedAt: new Date().toISOString(),
          transcript,
          recordingUrl: audioUrl,
          blobPath,
          ...analysis,
        });

        logger.info(`AI Outbound call log finalized in Cosmos DB for callSid=${callSid}`);
      }
    } catch (finalizeErr) {
      logger.error('Failed to finalize AI call log:', finalizeErr);
    }
  });

  twilioWs.on('error', (err) => {
    logger.error('Twilio media stream WebSocket error:', err);
    cleanup('twilio-ws-error');
  });
}

module.exports = {
  handleTwilioMediaConnection,
  addActiveCall,
  removeActiveCall,
  getActiveCalls,
};
