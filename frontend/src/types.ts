export interface TwilioConfig {
  account_sid: string;
  auth_token_masked: string;
  phone_number: string;
  status: string;
}

export interface SaveTwilioPayload {
  account_sid: string;
  auth_token: string;
  phone_number: string;
}

export interface CallRecord {
  id: string;
  organization_id: string;
  user_id: string;
  twilio_configuration_id: string;
  call_sid: string | null;
  from_number: string;
  to_number: string;
  status: string;
  created_at: string;
  updated_at: string;
}
