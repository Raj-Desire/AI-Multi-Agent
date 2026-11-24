const { getContainer } = require('../database/cosmosClient');
const { nowIso } = require('./cosmosHelpers');

const DEFAULT_SETTINGS = {
  companyIntro: "Hi, this is Aria — I'm an AI assistant calling on behalf of Vijay's team at DesireInfoWeb, a Microsoft solutions partner. I'll be brief and won't take more than twenty seconds. We help teams automate the manual, spreadsheet-based work that takes long time for them, using the Microsoft 365 tools they already have. I'm not selling anything on this call — just checking whether it's worth a short conversation with one of our specialists. Is now an okay time, or would later suit you better? ",
  servicesOffered: "Vijay's team at DesireInfoWeb helps businesses improve productivity and growth through technology solutions, including Microsoft 365 setup/integrations, AI solutions, business process automation, and custom software or web/mobile application development.",
  toneOfConversation: "Friendly, Professional, Confident, Calm, Patient, Respectful, Helpful, Consultative",
  followUpQuestions: "Great, thank you. Are you currently looking for any Microsoft 365, AI, automation, or custom software development services, or do you have anything planned over the next few months?",
  objectionHandlingRules: "If the customer says they are busy or later is better, respond naturally: 'I completely understand. What would be a better day or time for me to call you back?'. Once they reply, confirm 'Perfect, I'll arrange a call at that time. Thank you, and have a great day.' and hang up. If they are not interested, say 'No problem at all. Thank you for your time today. If your requirements change in the future, we'd be happy to help.' and end the call. If a Voicemail, IVR phone menu, automated message, or AI call screener is detected (e.g. 'leave a message after the tone', 'press 1 for...', 'state your name'), immediately say: 'Thank you for your time. Goodbye!' and end the call instantly to save credits.",
  closingMessage: "Thank you, and have a great day.",
  knowledgeBase: [] // list of metadata items: { id: string, name: string, type: string, size: number, uploadedAt: string, blobName: string, blobUrl: string }
};

async function getAiSettings(userId) {
  const container = getContainer('aiSettings');
  const id = `ai_settings_${userId}`;
  try {
    const { resource } = await container.item(id, userId).read();
    if (resource) {
      let needsMigration = false;
      const updated = { ...resource };

      const oldIntro = resource.companyIntro || "";
      if (!resource.companyIntro || 
          oldIntro === "Hello, this is Desire Infoweb." || 
          oldIntro === "Hello, this is Aria from Desire Infoweb. We help businesses improve efficiency through AI, automation, Microsoft 365, and custom software solutions." ||
          oldIntro.includes("get rid of the manual, spreadsheet-heavy work that quietly eats their week") ||
          oldIntro.includes("Vijay's team at DesireInfoWeb, and I'll keep this to twenty seconds")) {
        updated.companyIntro = DEFAULT_SETTINGS.companyIntro;
        needsMigration = true;
      }
      
      const oldServices = resource.servicesOffered || "";
      if (!resource.servicesOffered ||
          oldServices === "We help teams get rid of the manual, spreadsheet-heavy work that quietly eats their week using Microsoft 365 tools and AI." ||
          oldServices === "We help businesses improve efficiency through AI solutions, business automation, Microsoft 365, cloud services, and custom software development." ||
          oldServices === "We help businesses with AI, automation, and IT development services, including Microsoft Office 365 solutions. If you're exploring ways to improve efficiency or grow your business, we'd be happy to help." ||
          oldServices === "AI Voice Agents, Business Process Automation, Microsoft 365 Solutions, Custom Software Development, Web Application Development, Mobile Application Development, Azure Cloud Services, CRM & ERP Solutions, IT Consulting and Digital Transformation.") {
        updated.servicesOffered = DEFAULT_SETTINGS.servicesOffered;
        needsMigration = true;
      }
      
      if (!resource.toneOfConversation ||
          resource.toneOfConversation === "friendly, professional, human-like, polite, and direct" ||
          resource.toneOfConversation === "Friendly, Professional, Confident, Calm, Patient, Respectful, Helpful, Consultative") {
        updated.toneOfConversation = DEFAULT_SETTINGS.toneOfConversation;
        needsMigration = true;
      }
      
      const oldQuestions = resource.followUpQuestions || "";
      if (!resource.followUpQuestions ||
          oldQuestions.toLowerCase().includes("technology upgrades") ||
          oldQuestions === "May I ask if your team is currently running into manual, spreadsheet-heavy tasks in your day-to-day operations?" ||
          oldQuestions === "May I ask if you're currently looking for automation or IT-related services?" ||
          oldQuestions === "May I ask if your business is currently looking to improve any processes through technology or automation?" ||
          oldQuestions === "May I ask if your business is currently exploring any technology upgrades or automation initiatives?") {
        updated.followUpQuestions = DEFAULT_SETTINGS.followUpQuestions;
        needsMigration = true;
      }
      
      const oldRules = resource.objectionHandlingRules || "";
      if (!resource.objectionHandlingRules ||
          oldRules.toLowerCase().includes("sajid") ||
          oldRules === "If the prospect says they are busy, offer a callback. If they are not interested, thank them politely and end the call. If they ask about budget or team size, deflect or transition to Sajid." ||
          oldRules === "If the customer says they are busy, offer to call back at a more convenient time. If they already have a provider, acknowledge it politely and mention we'd be happy to help if they ever look to enhance their setup. If they are unsure, offer to briefly explain how we help similar businesses." ||
          oldRules === "If the customer is busy, say 'I completely understand. What would be a better time for me to call you back?'. Once they reply, confirm 'Perfect, I'll arrange a call at that time. Thank you, and have a great day.' and hang up. If they are not interested, say 'No problem at all. Thank you for your time today. If your requirements change in the future, we'd be happy to help.'") {
        updated.objectionHandlingRules = DEFAULT_SETTINGS.objectionHandlingRules;
        needsMigration = true;
      }
      
      if (!resource.closingMessage ||
          resource.closingMessage === "Thank you for your time. Have a wonderful day." ||
          resource.closingMessage === "Thank you for your time. Have a wonderful day. Goodbye!" ||
          resource.closingMessage === "Thank you, and have a great day.") {
        updated.closingMessage = DEFAULT_SETTINGS.closingMessage;
        needsMigration = true;
      }

      if (needsMigration) {
        return await upsertAiSettings(userId, updated);
      }
      return resource;
    }
    return await upsertAiSettings(userId, DEFAULT_SETTINGS);
  } catch (error) {
    if (error.code === 404) {
      // Create defaults
      return await upsertAiSettings(userId, DEFAULT_SETTINGS);
    }
    throw error;
  }
}

async function upsertAiSettings(userId, settings) {
  const container = getContainer('aiSettings');
  const id = `ai_settings_${userId}`;
  const timestamp = nowIso();

  const existing = await getAiSettingsOrNull(userId);

  const doc = {
    ...DEFAULT_SETTINGS,
    ...existing,
    ...settings,
    id,
    userId,
    docType: 'aiSettings',
    updatedAt: timestamp,
  };

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function getAiSettingsOrNull(userId) {
  const container = getContainer('aiSettings');
  const id = `ai_settings_${userId}`;
  try {
    const { resource } = await container.item(id, userId).read();
    return resource;
  } catch (error) {
    return null;
  }
}

async function addKnowledgeBaseDoc(userId, fileMeta) {
  const settings = await getAiSettings(userId);
  const updatedKb = [...(settings.knowledgeBase || []), fileMeta];
  return upsertAiSettings(userId, { knowledgeBase: updatedKb });
}

async function removeKnowledgeBaseDoc(userId, fileId) {
  const settings = await getAiSettings(userId);
  const docToRemove = (settings.knowledgeBase || []).find(d => d.id === fileId);
  const updatedKb = (settings.knowledgeBase || []).filter(d => d.id !== fileId);
  await upsertAiSettings(userId, { knowledgeBase: updatedKb });
  return docToRemove;
}

module.exports = {
  DEFAULT_SETTINGS,
  getAiSettings,
  upsertAiSettings,
  addKnowledgeBaseDoc,
  removeKnowledgeBaseDoc,
};
