export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
}

export interface UserSummary {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
}

export interface TwilioConfig {
  account_sid: string;
  auth_token_masked: string;
  phone_number: string;
  twiml_app_sid?: string | null;
  api_key_sid?: string | null;
  api_key_secret_masked?: string | null;
  public_base_url?: string | null;
  status: string;
}

export interface SaveTwilioPayload {
  account_sid: string;
  auth_token: string;
  phone_number: string;
  twiml_app_sid?: string;
  api_key_sid?: string;
  api_key_secret?: string;
  public_base_url?: string;
}

export interface CallRecord {
  id: string;
  organization_id: string;
  user_id: string;
  twilio_configuration_id: string;
  call_sid: string | null;
  from_number: string;
  to_number: string;
  duration: number;
  prompt?: string;
  status: string;
  created_at: string;
  updated_at: string;
}
