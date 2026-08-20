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
    company_name: str = "My Company"
    tagline: Optional[str] = ""
    company_introduction: str = ""
    
    # Contact Information
    email: str = ""
    phone: str = ""
    website: Optional[str] = ""
    address: str = ""
    city: str = ""
    state: str = ""
    country: str = ""
    
    # Operations
    operating_hours: BusinessHours = Field(default_factory=BusinessHours)
    services: List[BusinessServiceItem] = Field(default_factory=list)
    
    # Knowledge & FAQs
    faqs: List[CompanyFAQItem] = Field(default_factory=list)
    
    # Permission & Access Control
    allow_user_edits: bool = False  # When False, standard organization users have Read-Only view. When True, users can edit.
    
    additional_notes: Optional[str] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: Optional[str] = None
