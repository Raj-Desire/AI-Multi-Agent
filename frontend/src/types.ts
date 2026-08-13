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
  duration: number;
  prompt?: string;
  status: string;
  created_at: string;
  updated_at: string;
}
