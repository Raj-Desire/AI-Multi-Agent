from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class VoiceRuleItem(BaseModel):
    id: str
    category_id: str
    category_name: str
    title: str
    summary: str
    rule_directive: str
    example: str
    enabled: bool = True
    icon: Optional[str] = None

class VoiceRuleCategory(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    rules: List[VoiceRuleItem]

class UpdateVoiceRulesPayload(BaseModel):
    rules: Dict[str, bool] = Field(
        ...,
        description="Dictionary mapping rule ID to boolean enabled status"
    )

class VoiceRulesResponse(BaseModel):
    total_rules: int
    enabled_rules: int
    categories: List[VoiceRuleCategory]
    updated_at: Optional[str] = None
