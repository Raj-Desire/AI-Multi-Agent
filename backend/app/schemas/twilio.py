from pydantic import BaseModel, ConfigDict

class SaveTwilioConfigRequest(BaseModel):
    account_sid: str
    auth_token: str
    phone_number: str

class TwilioConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_sid: str
    auth_token_masked: str
    phone_number: str
    status: str
