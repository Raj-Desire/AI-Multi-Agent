"""
Business Profile and Organization Knowledge Base Data Models
Defines structured company identity, services, office address, operating hours,
and custom knowledge/FAQs for seamless AI Voice Agent telephony conversations.
"""

from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class BusinessServiceItem(BaseModel):
    name: str
    description: str = ""
    pricing: Optional[str] = None
    enabled: bool = True


class BusinessHours(BaseModel):
    days: str = "Monday - Saturday"
    hours: str = "9:00 AM - 7:00 PM"
    timezone: str = "IST (UTC+5:30)"
    closed_on: str = "Sunday"


class CompanyFAQItem(BaseModel):
    question: str
    answer: str
    category: Optional[str] = "General"
    enabled: bool = True


class CompanyBusinessProfile(BaseModel):
    id: Optional[str] = None  # "profile_{organization_id}"
    organization_id: str
    company_name: str = "Desire AI Technologies"
    tagline: Optional[str] = "Leading Conversational AI & Telephony Solutions"
    company_introduction: str = "We specialize in real-time, ultra-low-latency voice AI agents and cloud telephony integrations that help businesses automate customer support, lead qualification, and appointment booking."
    
    # Contact Information
    email: str = "support@desireai.com"
    phone: str = "+91 98765 43210"
    website: Optional[str] = "https://desireai.com"
    address: str = "402, Desire Infotech Park, S.G. Highway, Ahmedabad, Gujarat 380054"
    city: str = "Ahmedabad"
    state: str = "Gujarat"
    country: str = "India"
    
    # Operations
    operating_hours: BusinessHours = Field(default_factory=BusinessHours)
    services: List[BusinessServiceItem] = Field(default_factory=lambda: [
        BusinessServiceItem(name="AI Voice Receptionist", description="Automated 24/7 inbound call answering, staff routing, and appointment scheduling.", enabled=True),
        BusinessServiceItem(name="Outbound Lead Qualification", description="Autonomous phone follow-ups, lead screening, and CRM data capture.", enabled=True),
        BusinessServiceItem(name="Customer Support Automation", description="Instant issue resolution, billing FAQs, and human escalation.", enabled=True)
    ])
    
    # Knowledge & FAQs
    faqs: List[CompanyFAQItem] = Field(default_factory=lambda: [
        CompanyFAQItem(question="How can I schedule an in-person meeting or demo?", answer="You can book a demo directly on our website at desireai.com or through our voice agent.", category="Sales"),
        CompanyFAQItem(question="Where is your head office located?", answer="Our main corporate office is located at 402, Desire Infotech Park, S.G. Highway, Ahmedabad, Gujarat.", category="General"),
        CompanyFAQItem(question="What are your support working hours?", answer="Our customer support is available Monday through Saturday from 9:00 AM to 7:00 PM IST.", category="Support")
    ])
    
    # Permission & Access Control
    allow_user_edits: bool = False  # When False, standard organization users have Read-Only view. When True, users can edit.
    
    additional_notes: Optional[str] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: Optional[str] = None
