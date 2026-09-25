"""
Production-Realistic Lead Intelligence Seed Script
Generates authentic enterprise sales leads, campaigns, realistic multi-turn voice transcripts,
and verified lead intelligence records across the full spectrum:
1. Highly Qualified (Hot Lead - Score 88): Active purchase intent, demo booking scheduled, budget confirmed.
2. Interested (Hot Lead - Score 74): Wants pricing proposal and implementation timeline.
3. Warm Interested (Asked Details - Score 58): Inquires about CRM integrations, asks for collateral, no immediate demo.
4. Callback Requested (Warm Follow-up - Score 52): Customer in meetings, asked to call back next Tuesday 2 PM.
5. Cold Lead (Direct Hangup / No Dialogue - Score 10): Call received and answered, but disconnected immediately.
6. Cold Lead (Not Interested / Objection - Score 18): Existing long-term vendor contract, explicitly declined.
7. Unanswered / Ringing Timeout (Score 0): Call unanswered, retry scheduled.
"""

import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from app.models.prospect import Prospect, ProspectStatus, ProspectSource
from app.models.campaign import (
    Campaign,
    CampaignStatus,
    CampaignCallingConfig,
    CampaignSchedule,
    CampaignStats,
    CampaignMember,
    CampaignMemberStatus
)
from app.models.call import Call
from app.repositories.prospect_repository import ProspectRepository
from app.repositories.campaign_repository import CampaignRepository
from app.repositories.call_repository import CallRepository
from app.services.lead_intelligence_service import LeadIntelligenceService, TenantContext

ORG_ID = "org_platform_root"
USER_ID = "usr_de8e17c50d74"
AGENT_ID = "agt_d178d4e680"
AGENT_NAME = "Enterprise Outreach Assistant"
TWILIO_CONF_ID = "twc_default"

async def seed_data():
    prospect_repo = ProspectRepository()
    campaign_repo = CampaignRepository()
    call_repo = CallRepository()
    lead_service = LeadIntelligenceService()

    now = datetime.now(timezone.utc)

    # 1. Create or ensure realistic enterprise campaign
    campaign_id = "cmp_enterprise_outreach_q1"
    campaign = Campaign(
        id=campaign_id,
        organization_id=ORG_ID,
        name="Q1 Strategic Enterprise Outreach",
        description="High-touch outbound AI qualification campaign for B2B logistics, healthcare, and financial services leaders.",
        status=CampaignStatus.RUNNING,
        calling_config=CampaignCallingConfig(
            agent_id=AGENT_ID,
            caller_phone_number="+18005550199",
            max_concurrent_calls=10,
            max_attempts_per_prospect=3,
            retry_delay_minutes=30,
            call_timeout_seconds=40
        ),
        schedule=CampaignSchedule(
            start_date=(now - timedelta(days=5)).strftime("%Y-%m-%d"),
            calling_days=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            timezone="America/New_York"
        ),
        stats=CampaignStats(
            total_prospects=7,
            completed=6,
            connected=5,
            unanswered=1,
            interested=2,
            warm_interested=2,
            not_interested=1,
            no_answer=2,
            callbacks=1,
            qualified=2,
            avg_duration_seconds=128
        ),
        created_at=now - timedelta(days=5),
        updated_at=now
    )
    await campaign_repo.save(campaign)
    print(f"Created/Updated Campaign: {campaign.name} ({campaign.id})")

    # 2. Define 7 Realistic Scenarios
    scenarios = [
        # Scenario 1: Qualified Hot (Score 88) - Demo Booked, Budget Approved
        {
            "prospect_id": "prsp_elena_vance",
            "full_name": "Elena Vance",
            "company": "Apex Global Logistics",
            "job_title": "VP of Customer Operations",
            "email": "elena.vance@apexlogistics.com",
            "phone_number": "+14155552301",
            "status": ProspectStatus.QUALIFIED,
            "call_id": "cal_seed_elena_vance",
            "duration": 215,
            "created_at": now - timedelta(hours=3),
            "lead_score": 88,
            "business_outcome": "Interested",
            "interest_level": "Interested",
            "classification": "Hot",
            "sentiment": "Positive",
            "summary": "Elena confirmed Apex Logistics manages 45,000 inbound freight calls monthly and currently faces staffing shortages. She confirmed an approved Q1 budget, expressed urgency to automate peak volume, and scheduled an executive technical demo for Thursday at 10:00 AM EST.",
            "intent": "Demo Request & Purchase Evaluation",
            "next_action": "Host technical architecture demo and prepare enterprise SLA agreement",
            "key_insights": [
                "45,000 inbound freight dispatch calls monthly",
                "Executive budget approved for voice AI rollout in Q1",
                "Needs bilingual English/Spanish real-time voice handling"
            ],
            "key_requirements": [
                "Sub-second voice latency under peak load",
                "Direct API integration with McLeod Software TMS",
                "Automated driver check-in workflows"
            ],
            "customer_questions": [
                "Can your voice engine handle noisy background environments in transit hubs?",
                "What is your deployment timeline for custom workflow actions?"
            ],
            "objections": [],
            "important_info": "Budget confirmed; evaluation committee includes Chief Operating Officer.",
            "callback_datetime": (now + timedelta(days=2)).replace(hour=14, minute=0, second=0).isoformat(),
            "transcript": [
                {"role": "agent", "content": "Good morning Elena, this is Sarah calling from the AI Voice Platform on behalf of our enterprise solutions team. How are you today?", "timestamp": "00:02"},
                {"role": "user", "content": "Hi Sarah, doing well thank you. What is this call regarding?", "timestamp": "00:07"},
                {"role": "agent", "content": "We noticed Apex Logistics is scaling operations across North America. We provide real-time conversational voice assistants that automate dispatch queries, shipment tracking, and driver check-ins with sub-second response times.", "timestamp": "00:18"},
                {"role": "user", "content": "That is actually very relevant. We receive over 45,000 calls a month and our weekend dispatch queues are backing up significantly.", "timestamp": "00:28"},
                {"role": "agent", "content": "Understood. Our platform connects directly into transportation management systems so callers get immediate live answers without hold times. Does Apex have an active initiative or budget to address dispatch automation this quarter?", "timestamp": "00:41"},
                {"role": "user", "content": "Yes, our budget was approved last month. We have an active RFP open for conversational automation. Can we schedule an executive product demo this Thursday around 10 AM Eastern?", "timestamp": "00:54"},
                {"role": "agent", "content": "Absolutely Elena, Thursday at 10:00 AM Eastern is locked in. I will send the calendar invite and technical overview to elena.vance@apexlogistics.com right away.", "timestamp": "01:06"},
                {"role": "user", "content": "Perfect, please include our CTO Marcus on that invitation as well. Looking forward to it.", "timestamp": "01:14"},
                {"role": "agent", "content": "Will do. Thank you Elena, have a great day!", "timestamp": "01:18"}
            ]
        },

        # Scenario 2: High Intent (Score 74) - Proposal & Pricing Requested
        {
            "prospect_id": "prsp_david_sterling",
            "full_name": "David Sterling",
            "company": "Sterling Capital Partners",
            "job_title": "Managing Director, Wealth Technology",
            "email": "d.sterling@sterlingcap.com",
            "phone_number": "+12125558914",
            "status": ProspectStatus.INTERESTED,
            "call_id": "cal_seed_david_sterling",
            "duration": 164,
            "created_at": now - timedelta(hours=6),
            "lead_score": 74,
            "business_outcome": "Interested",
            "interest_level": "Interested",
            "classification": "Hot",
            "sentiment": "Positive",
            "summary": "David inquired about after-hours client intake and automated appointment scheduling for wealth advisors. He requested a commercial pricing breakdown and formal proposal sent to his email.",
            "intent": "Pricing Proposal & Commercials Request",
            "next_action": "Send customized commercial tier proposal and calendar invite",
            "key_insights": [
                "Managing 12 regional advisory offices across the East Coast",
                "Wants to eliminate missed after-hours prospective investor calls",
                "Requires SOC 2 Type II compliance and CRM sync"
            ],
            "key_requirements": [
                "Integration with Salesforce Financial Services Cloud",
                "Multi-factor caller verification before disclosing appointment info"
            ],
            "customer_questions": [
                "What are the per-minute and annual platform licensing rates?",
                "Can we customize voice pitch and conversational pacing?"
            ],
            "objections": ["Expressed preference to review pricing proposal prior to team demonstration"],
            "important_info": "Decision expected before end of quarter.",
            "callback_datetime": None,
            "transcript": [
                {"role": "agent", "content": "Hello David, this is Alex from the AI Voice Solutions team. I am reaching out regarding automated client concierge services for advisory firms.", "timestamp": "00:03"},
                {"role": "user", "content": "Hello Alex. Yes, we have been looking at AI receptionists for our advisory branches after 6 PM.", "timestamp": "00:11"},
                {"role": "agent", "content": "Our solution provides 24/7 natural spoken interaction, pre-qualifies incoming wealth advisory inquiries, and seamlessly schedules appointments directly into advisors' calendars.", "timestamp": "00:23"},
                {"role": "user", "content": "Interesting. Can you send proposal and pricing sheet to d.sterling@sterlingcap.com? I would like to review the commercials first.", "timestamp": "00:35"},
                {"role": "agent", "content": "Certainly, David. I will compile our tiered enterprise plans and send the proposal across within the hour. Would early next week work for a brief 15-minute review call?", "timestamp": "00:48"},
                {"role": "user", "content": "Yes, send the proposal first and we can connect next Tuesday afternoon.", "timestamp": "00:54"},
                {"role": "agent", "content": "Understood. The proposal is on its way. Thank you for your time, David.", "timestamp": "01:00"}
            ]
        },

        # Scenario 3: Warm Interested (Score 58) - Asked Details, Evaluating Integrations
        {
            "prospect_id": "prsp_rachel_zimmerman",
            "full_name": "Rachel Zimmerman",
            "company": "Kinetix Health Systems",
            "job_title": "Director of Patient Experience",
            "email": "rzimmerman@kinetixhealth.org",
            "phone_number": "+13125557732",
            "status": ProspectStatus.CONNECTED,
            "call_id": "cal_seed_rachel_zimmerman",
            "duration": 142,
            "created_at": now - timedelta(hours=14),
            "lead_score": 58,
            "business_outcome": "Information Requested",
            "interest_level": "Warm Interested",
            "classification": "Warm",
            "sentiment": "Neutral",
            "summary": "Rachel asked detailed technical questions regarding patient appointment reminders and Epic EHR integration. She wants technical documentation and case studies before committing to a formal meeting.",
            "intent": "Technical Architecture Inquiry",
            "next_action": "Send Epic EHR integration whitepaper and healthcare security overview",
            "key_insights": [
                "Explores patient self-service voice bot for routine appointment confirmation",
                "Must comply strictly with HIPAA regulations",
                "Not ready to book demo today, requested documentation first"
            ],
            "key_requirements": [
                "HIPAA Business Associate Agreement (BAA)",
                "FHIR/HL7 API integration"
            ],
            "customer_questions": [
                "Do you have certified integration with Epic MyChart?",
                "What is your typical speech synthesis turnaround time on cellular networks?"
            ],
            "objections": ["Currently evaluating internal EHR vendor module as well"],
            "important_info": "Will review whitepapers with Chief Medical Informatics Officer.",
            "callback_datetime": None,
            "transcript": [
                {"role": "agent", "content": "Hi Rachel, this is Emma from the AI Voice Platform calling regarding patient communication automation. Do you have a quick moment?", "timestamp": "00:03"},
                {"role": "user", "content": "I have about two minutes. Are you integrating with hospital EHR systems?", "timestamp": "00:09"},
                {"role": "agent", "content": "Yes, Rachel. We support real-time patient appointment confirmation, rescheduling, and post-discharge surveys connecting into major EHR systems with full HIPAA compliance.", "timestamp": "00:22"},
                {"role": "user", "content": "What about Epic specifically? Do you have existing health systems running on Epic?", "timestamp": "00:29"},
                {"role": "agent", "content": "Yes, we integrate via FHIR APIs and HL7 standards with end-to-end BAA coverage. Would you like to see a live demonstration of an appointment confirmation call?", "timestamp": "00:41"},
                {"role": "user", "content": "Not ready for a demo just yet. Please email me your integration whitepaper and security architecture overview so our IT director can evaluate it.", "timestamp": "00:52"},
                {"role": "agent", "content": "I will send those technical documents to rzimmerman@kinetixhealth.org right away. May I follow up with you after your team has reviewed them?", "timestamp": "01:03"},
                {"role": "user", "content": "Yes, check back in about ten days. Thank you.", "timestamp": "01:08"}
            ]
        },

        # Scenario 4: Callback Requested (Score 52) - Specific Scheduled Callback Time
        {
            "prospect_id": "prsp_marcus_thornton",
            "full_name": "Marcus Thornton",
            "company": "Thornton Commercial Real Estate",
            "job_title": "Chief Executive Officer",
            "email": "mthornton@thorntoncre.com",
            "phone_number": "+16175554421",
            "status": ProspectStatus.CALLBACK_REQUESTED,
            "call_id": "cal_seed_marcus_thornton",
            "duration": 65,
            "created_at": now - timedelta(hours=22),
            "lead_score": 52,
            "business_outcome": "Callback Requested",
            "interest_level": "Callback",
            "classification": "Warm",
            "sentiment": "Neutral",
            "summary": "Marcus answered while walking into a client closing meeting. Expressed interest in automated tenant maintenance dispatching and explicitly requested a callback next Tuesday at 2:00 PM EST.",
            "intent": "Callback Request",
            "next_action": "Execute scheduled priority callback on Tuesday at 2:00 PM EST",
            "key_insights": [
                "CEO answered directly",
                "High-level interest in automated tenant maintenance request dispatch",
                "Specific callback appointment requested"
            ],
            "key_requirements": ["Direct phone call at agreed time slot"],
            "customer_questions": [],
            "objections": ["Inconvenient time to talk during present call"],
            "important_info": "Prefers afternoon phone discussions; mobile number verified.",
            "callback_datetime": (now + timedelta(days=4)).replace(hour=14, minute=0, second=0).isoformat(),
            "transcript": [
                {"role": "agent", "content": "Hello Marcus, this is James from the AI Voice Platform following up on our real estate automation solutions.", "timestamp": "00:03"},
                {"role": "user", "content": "Hey James, I am actually walking into a property closing right now. Can we talk about this next week?", "timestamp": "00:10"},
                {"role": "agent", "content": "Of course, Marcus. When would be the best day and time to call you back?", "timestamp": "00:16"},
                {"role": "user", "content": "Call me next Tuesday at 2 PM sharp. I should be free in my office then.", "timestamp": "00:23"},
                {"role": "agent", "content": "Confirmed for next Tuesday at 2:00 PM Eastern. Good luck with your closing!", "timestamp": "00:29"},
                {"role": "user", "content": "Thanks James, talk to you then.", "timestamp": "00:32"}
            ]
        },

        # Scenario 5: Direct Hangup / No Dialogue (Score 10) - Call Received
        {
            "prospect_id": "prsp_kevin_o_connor",
            "full_name": "Kevin O'Connor",
            "company": "Harborview Marine Supply",
            "job_title": "Procurement Manager",
            "email": "koconnor@harborviewmarine.com",
            "phone_number": "+12065559182",
            "status": ProspectStatus.CONTACTED,
            "call_id": "cal_seed_kevin_o_connor",
            "duration": 6,
            "created_at": now - timedelta(days=1, hours=4),
            "lead_score": 10,
            "business_outcome": "Connected - No Dialogue",
            "interest_level": "No Answer",
            "classification": "Cold",
            "sentiment": "Neutral",
            "summary": "Call connected but customer disconnected immediately without speaking.",
            "intent": "Connected - No Dialogue",
            "next_action": "Follow up via SMS or retry call later",
            "key_insights": ["Call answered by recipient or handset but disconnected without conversation"],
            "key_requirements": [],
            "customer_questions": [],
            "objections": [],
            "important_info": None,
            "callback_datetime": None,
            "transcript": [
                {"role": "agent", "content": "Hello Kevin, this is Sarah from the AI Voice Platform, how are you today?", "timestamp": "00:02"}
            ]
        },

        # Scenario 6: Not Interested / Competitor Lock-in (Score 18) - Cold Objection
        {
            "prospect_id": "prsp_samantha_reed",
            "full_name": "Samantha Reed",
            "company": "Beacon Financial Advisors",
            "job_title": "Chief Technology Officer",
            "email": "sreed@beaconfin.com",
            "phone_number": "+17045553190",
            "status": ProspectStatus.NOT_INTERESTED,
            "call_id": "cal_seed_samantha_reed",
            "duration": 48,
            "created_at": now - timedelta(days=2),
            "lead_score": 18,
            "business_outcome": "No Answer",
            "interest_level": "No Answer",
            "classification": "Cold",
            "sentiment": "Negative",
            "summary": "Samantha stated they recently signed a multi-year enterprise contract with Genesys and are not interested in adopting additional conversational platforms.",
            "intent": "Competitor Contract - Not Interested",
            "next_action": "Mark prospect not interested; schedule revisit in 12 months",
            "key_insights": [
                "Locked into long-term contract with legacy provider",
                "Explicitly declined exploratory demonstration"
            ],
            "key_requirements": [],
            "customer_questions": [],
            "objections": ["Signed a 3-year contract with Genesys last quarter", "No budget for alternative vendors"],
            "important_info": "Do not call within current calendar year.",
            "callback_datetime": None,
            "transcript": [
                {"role": "agent", "content": "Hello Samantha, this is Alex calling from the AI Voice Platform. I am reaching out to see if Beacon Financial is exploring voice automation for client intake.", "timestamp": "00:03"},
                {"role": "user", "content": "No, we just signed a three-year contract with Genesys cloud contact center two months ago. We are fully committed.", "timestamp": "00:12"},
                {"role": "agent", "content": "Understood, Samantha. We offer hybrid voice engines that integrate alongside Genesys for sub-second latency.", "timestamp": "00:22"},
                {"role": "user", "content": "We are really not interested in evaluating anything new right now. Please remove us from your calling list for now.", "timestamp": "00:30"},
                {"role": "agent", "content": "I completely understand. I will update our records accordingly. Have a wonderful week.", "timestamp": "00:37"},
                {"role": "user", "content": "Thanks. Bye.", "timestamp": "00:40"}
            ]
        },

        # Scenario 7: Unanswered / Ringing Timeout (Score 0)
        {
            "prospect_id": "prsp_brian_murphy",
            "full_name": "Brian Murphy",
            "company": "Nexus Industrial Supply",
            "job_title": "Director of Supply Chain",
            "email": "bmurphy@nexusind.com",
            "phone_number": "+14045558823",
            "status": ProspectStatus.NEW,
            "call_id": "cal_seed_brian_murphy",
            "duration": 0,
            "created_at": now - timedelta(days=2, hours=10),
            "lead_score": 0,
            "business_outcome": "No Answer",
            "interest_level": "No Answer",
            "classification": "Cold",
            "sentiment": "Neutral",
            "summary": "",
            "intent": "No Answer / Unreachable",
            "next_action": "Retry call at next scheduled window",
            "key_insights": [],
            "key_requirements": [],
            "customer_questions": [],
            "objections": [],
            "important_info": None,
            "callback_datetime": None,
            "transcript": []
        }
    ]

    # Save Prospects, Campaign Members, and Calls
    for s in scenarios:
        # 1. Prospect
        prospect = Prospect(
            id=s["prospect_id"],
            organization_id=ORG_ID,
            full_name=s["full_name"],
            phone_number=s["phone_number"],
            normalized_phone=s["phone_number"],
            email=s["email"],
            company=s["company"],
            job_title=s["job_title"],
            status=s["status"],
            source=ProspectSource.CAMPAIGN,
            total_calls=1,
            last_contacted_at=s["created_at"],
            created_at=s["created_at"] - timedelta(days=1),
            updated_at=s["created_at"]
        )
        await prospect_repo.save(prospect)

        # 2. Campaign Member
        cm_status = (
            CampaignMemberStatus.COMPLETED if s["duration"] > 0
            else CampaignMemberStatus.UNANSWERED
        )
        member = CampaignMember(
            id=f"cm_{s['prospect_id']}",
            campaign_id=campaign_id,
            organization_id=ORG_ID,
            prospect_id=s["prospect_id"],
            prospect_name=s["full_name"],
            phone_number=s["phone_number"],
            normalized_phone=s["phone_number"],
            status=cm_status,
            attempts=1,
            last_called_at=s["created_at"],
            call_id=s["call_id"],
            created_at=s["created_at"]
        )
        await campaign_repo.save_member(member)

        # 3. Call record
        call_status = "completed" if s["duration"] > 0 else "no-answer"
        call = Call(
            id=s["call_id"],
            organization_id=ORG_ID,
            user_id=USER_ID,
            twilio_configuration_id=TWILIO_CONF_ID,
            call_sid=f"CA{uuid.uuid4().hex[:32]}",
            from_number="+18005550199",
            to_number=s["phone_number"],
            duration=s["duration"],
            status=call_status,
            prospect_id=s["prospect_id"],
            campaign_id=campaign_id,
            agent_id=AGENT_ID,
            agent_name=AGENT_NAME,
            transcript=s["transcript"],
            outcome=s["business_outcome"],
            business_outcome=s["business_outcome"],
            summary=s["summary"],
            key_insights=s["key_insights"],
            key_requirements=s["key_requirements"],
            customer_questions=s["customer_questions"],
            objections=s["objections"],
            important_info=s["important_info"],
            next_action=s["next_action"],
            intent=s["intent"],
            sentiment=s["sentiment"],
            lead_score=s["lead_score"],
            interest_level=s["interest_level"],
            classification=s["classification"],
            callback_datetime=s["callback_datetime"],
            analytics={
                "lead_score": s["lead_score"],
                "business_outcome": s["business_outcome"],
                "interest_level": s["interest_level"],
                "classification": s["classification"],
                "sentiment": s["sentiment"],
                "summary": s["summary"],
                "intent": s["intent"],
                "next_action": s["next_action"],
                "key_insights": s["key_insights"],
                "key_requirements": s["key_requirements"],
                "customer_questions": s["customer_questions"],
                "objections": s["objections"],
                "customer_name": s["full_name"],
                "company_name": s["company"]
            },
            created_at=s["created_at"],
            updated_at=s["created_at"]
        )
        await call_repo.save(call)
        print(f"Created Lead: {s['full_name']} | Company: {s['company']} | Score: {s['lead_score']} | Outcome: {s['business_outcome']}")

    # Invalidate cache so Lead Intelligence dashboard picks up newly seeded calls immediately
    lead_service.invalidate_cache(ORG_ID)
    print("Seed complete! Cache invalidated for org_platform_root.")

if __name__ == "__main__":
    asyncio.run(seed_data())
