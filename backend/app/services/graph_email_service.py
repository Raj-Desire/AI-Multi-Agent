import os
import logging
from typing import Optional, List, Dict, Any
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("graph_email_service")

class GraphEmailService:
    """
    Microsoft 365 Graph API Email Dispatcher.
    Uses OAuth2 Client Credentials grant (Application Permissions) to send emails via:
    POST https://graph.microsoft.com/v1.0/users/{sender}/sendMail
    """

    @property
    def tenant_id(self) -> str:
        return os.getenv("GRAPH_TENANT_ID", "").strip()

    @property
    def client_id(self) -> str:
        return os.getenv("GRAPH_CLIENT_ID", "").strip()

    @property
    def client_secret(self) -> str:
        return os.getenv("GRAPH_CLIENT_SECRET", "").strip()

    @property
    def mail_sender(self) -> str:
        return os.getenv("MAIL_SENDER", "").strip()

    def is_configured(self) -> bool:
        return bool(self.tenant_id and self.client_id and self.client_secret and self.mail_sender)

    async def get_access_token(self) -> Optional[str]:
        if not self.is_configured():
            logger.warning("[GraphEmailService] Microsoft 365 credentials are not configured in environment.")
            return None

        token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
        data = {
            "client_id": self.client_id,
            "scope": "https://graph.microsoft.com/.default",
            "client_secret": self.client_secret,
            "grant_type": "client_credentials"
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(token_url, data=data)
                if resp.status_code == 200:
                    token = resp.json().get("access_token")
                    return token
                else:
                    logger.error(f"[GraphEmailService] Failed to obtain access token: {resp.status_code} - {resp.text}")
                    return None
        except Exception as e:
            logger.error(f"[GraphEmailService] Error fetching OAuth2 token: {e}")
            return None

    async def send_email(
        self,
        to_recipients: List[str],
        subject: str,
        html_content: str,
        sender_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sends an HTML email via Microsoft Graph API.
        """
        sender = sender_override or self.mail_sender
        if not sender:
            return {"success": False, "error": "No sender address configured."}

        clean_recipients = [r.strip() for r in to_recipients if r and r.strip()]
        if not clean_recipients:
            return {"success": False, "error": "No recipient addresses provided."}

        access_token = await self.get_access_token()
        if not access_token:
            return {"success": False, "error": "Could not authenticate with Microsoft 365 Graph API."}

        send_url = f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        to_list = [{"emailAddress": {"address": addr}} for addr in clean_recipients]
        payload = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "HTML",
                    "content": html_content
                },
                "toRecipients": to_list
            },
            "saveToSentItems": "true"
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(send_url, headers=headers, json=payload)
                if resp.status_code in (200, 202):
                    logger.info(f"[GraphEmailService] Email successfully sent to {clean_recipients} via {sender}")
                    return {"success": True, "message": f"Email dispatched to {', '.join(clean_recipients)}"}
                else:
                    err_msg = f"Graph API send error ({resp.status_code}): {resp.text}"
                    logger.error(f"[GraphEmailService] {err_msg}")
                    return {"success": False, "error": err_msg}
        except Exception as e:
            logger.error(f"[GraphEmailService] Connection error sending email: {e}")
            return {"success": False, "error": str(e)}

    async def send_recording_escalation_alert(
        self,
        to_recipients: List[str],
        org_name: str,
        call_id: str,
        call_sid: str,
        customer_phone: str,
        call_duration_seconds: int,
        retention_reason: str,
        summary: str,
        sentiment: str,
        transcript_excerpt: Optional[str] = None,
        retention_days: int = 28
    ) -> Dict[str, Any]:
        """
        Builds and sends a rich HTML alert email notifying admins that a call was flagged,
        why its recording is retained on Twilio, and details for supervisor inspection.
        """
        mins = call_duration_seconds // 60
        secs = call_duration_seconds % 60
        duration_fmt = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"

        sentiment_color = "#ef4444" if sentiment.lower() == "negative" else "#f59e0b"

        html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Escalation Recording Retained Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Header Banner -->
    <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 24px 28px; color: #ffffff;">
      <div style="display: inline-block; padding: 4px 10px; background-color: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 9999px; font-size: 11px; font-weight: 600; color: #fca5a5; letter-spacing: 0.5px; text-transform: uppercase;">
        Action Required &bull; Call Escalation Detected
      </div>
      <h1 style="margin: 12px 0 4px 0; font-size: 20px; font-weight: 700; color: #ffffff;">
        Audio Recording Retained for Audit
      </h1>
      <p style="margin: 0; font-size: 13px; color: #cbd5e1;">
        Organization: <strong>{org_name}</strong>
      </p>
    </div>

    <!-- Main Content Container -->
    <div style="padding: 24px 28px;">
      
      <!-- Alert Reason Card -->
      <div style="background-color: #fff1f2; border-left: 4px solid #ef4444; border-radius: 4px; padding: 14px 16px; margin-bottom: 20px;">
        <div style="font-size: 11px; font-weight: 700; color: #9f1239; text-transform: uppercase; letter-spacing: 0.5px;">
          Primary Retention Trigger
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #be123c; margin-top: 4px;">
          {retention_reason}
        </div>
        <div style="font-size: 12px; color: #e11d48; margin-top: 4px;">
          This call did not qualify for automatic disposal. Raw audio has been preserved on Twilio for up to <strong>{retention_days} days</strong> for supervisor review before auto-purging.
        </div>
      </div>

      <!-- Call Key Details Grid -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
        <tr>
          <td style="padding: 8px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; font-weight: 600; color: #64748b; width: 35%;">Customer Phone</td>
          <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 600; color: #0f172a;">{customer_phone}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Call Duration</td>
          <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #0f172a;">{duration_fmt}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Customer Sentiment</td>
          <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; color: {sentiment_color};">{sentiment}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Twilio Call SID</td>
          <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 11px; color: #475569;">{call_sid}</td>
        </tr>
      </table>

      <!-- Executive Summary -->
      <div style="margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.5px;">
          Executive Conversation Summary
        </h3>
        <div style="background-color: #f1f5f9; border-radius: 6px; padding: 12px 14px; font-size: 13px; line-height: 1.5; color: #334155;">
          {summary or "A call occurred that required recording retention for supervisor inspection."}
        </div>
      </div>
"""

        if transcript_excerpt:
            html += f"""
      <!-- Transcript Excerpt -->
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.5px;">
          Key Incident Excerpt
        </h3>
        <div style="background-color: #0f172a; color: #e2e8f0; border-radius: 6px; padding: 14px; font-family: Consolas, monospace; font-size: 12px; line-height: 1.6; max-height: 200px; overflow-y: auto;">
          {transcript_excerpt}
        </div>
      </div>
"""

        html += f"""
      <!-- Footer Note -->
      <div style="padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
        You received this email because <strong>Smart Recording Retention & Escalation Alerts</strong> is enabled in your SuperAdmin control panel. Transcripts and full logs remain permanently accessible in your database.
      </div>

    </div>
  </div>
</body>
</html>"""

        subject = f"⚠️ Escalation Call Retained: {retention_reason} - {customer_phone} ({org_name})"
        return await self.send_email(
            to_recipients=to_recipients,
            subject=subject,
            html_content=html
        )

# Global singleton
graph_email_service = GraphEmailService()
