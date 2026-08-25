export type UserRole = 'superadmin' | 'admin' | 'user';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  organization_id?: string;
  org_name?: string;
}

export interface UserSummary {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  organization_id?: string;
  org_name?: string;
  is_active: boolean;
  created_at: string;
}

export interface OrganizationSummary {
  organization_id: string;
  org_name: string;
  admin_count: number;
  user_count: number;
  total_members: number;
  is_active: boolean;
  admins: { id: string; username: string; email: string; is_active?: boolean }[];
  created_at: string;
}

export interface PlatformOverviewMetrics {
  total_organizations: number;
  total_superadmins: number;
  total_admins: number;
  total_users: number;
  total_accounts: number;
}

export interface TwilioConfig {
  account_sid: string;
  auth_token_masked: string;
  phone_number: string;
  twiml_app_sid?: string | null;
  api_key_sid?: string | null;
  api_key_secret_masked?: string | null;
  public_base_url?: string | null;
  inbound_forward_mode?: "global" | "per_number" | "disabled";
  inbound_forward_global_number?: string | null;
  inbound_forward_mapping?: Record<string, string>;
  default_agent_id?: string | null;
  inbound_agent_mapping?: Record<string, string>;
  status: string;
}

export interface TwilioBalance {
  configured: boolean;
  account_sid?: string | null;
  balance?: string | null;
  currency?: string | null;
  error?: string | null;
  message?: string | null;
}

export interface SaveTwilioPayload {
  account_sid: string;
  auth_token: string;
  phone_number: string;
  twiml_app_sid?: string;
  api_key_sid?: string;
  api_key_secret?: string;
  public_base_url?: string;
  inbound_forward_mode?: "global" | "per_number" | "disabled";
  inbound_forward_global_number?: string;
  inbound_forward_mapping?: Record<string, string>;
  default_agent_id?: string;
  inbound_agent_mapping?: Record<string, string>;
}

export interface AutoSetupTwilioPayload {
  account_sid: string;
  auth_token: string;
  friendly_name?: string;
}

export interface AutoSetupTwilioResponse {
  account_sid: string;
  phone_numbers_found: number;
  phone_numbers: string[];
  twiml_app_sid: string;
  api_key_sid: string;
  voice_webhook_url: string;
  status: string;
  message: string;
}


export type UIStyle =
  | 'default'
  | 'minimal'
  | 'glassmorphism'
  | 'liquid_glass'
  | 'brutalism'
  | 'claymorphism'
  | 'neomorphism'
  | 'retro';

export type PalettePreset =
  | 'Original'
  | 'Dark'
  | 'Vivid'
  | 'Deep'
  | 'Muted'
  | 'Pastel'
  | 'Monochrome'
  | 'Complement'
  | 'Triadic'
  | 'Analogous'
  | 'Mono'
  | 'Spectrum';
export type BorderRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type UIDensity = 'compact' | 'comfortable' | 'spacious';
export type ColorMode = 'light' | 'dark' | 'system';
export type FontFamily = 'Inter' | 'Plus Jakarta Sans' | 'Outfit' | 'Roboto' | 'Poppins' | 'Space Grotesk';
export type FontScale = 'sm' | 'md' | 'lg';

export interface ThemeColors {
  primary: string;
  primary_hover?: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  sidebar: string;
  sidebar_text: string;
  heading?: string;
  text: string;
  text_muted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export interface ThemeAppearance {
  ui_style: UIStyle;
  border_radius: BorderRadius;
  ui_density: UIDensity;
  color_mode: ColorMode;
}

export interface ThemeTypography {
  font_family: FontFamily;
  font_scale: FontScale;
}

export interface ThemeIdentity {
  org_name: string;
  logo_url?: string | null;
  logo_dark_url?: string | null;
  favicon_url?: string | null;
  show_nav_logo?: boolean;
  show_nav_title?: boolean;
}

export interface OrganizationThemeConfig {
  id?: string;
  organization_id: string;
  identity: ThemeIdentity;
  colors: ThemeColors;
  appearance: ThemeAppearance;
  typography: ThemeTypography;
  updated_at?: string;
  updated_by?: string;
}

export interface UserPreferences {
  color_mode: ColorMode;
  ui_density: UIDensity;
}

export interface AgentPersonality {
  professionalism: number;
  friendliness: number;
  empathy: number;
  patience: number;
  confidence: number;
  energy: number;
  assertiveness: number;
  humor: number;
  curiosity: number;
}

export interface AgentServiceItem {
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
}

export interface AgentVoiceConfig {
  provider: string;
  version?: string;
  model?: string;
  voice: string;
  language?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

export interface AgentLLMConfig {
  provider: string;
  model: string;
  temperature: number;
  max_tokens?: number;
  reasoning_mode?: string;
}

export interface AgentListenConfig {
  provider: string;
  model: string;
  language: string;
  eot_threshold?: number;
  eager_eot?: boolean;
  keyterms?: string[];
}

export interface AgentRuntimeSettings {
  barge_in_enabled: boolean;
  interruption_sensitivity: number;
  silence_timeout: number;
  silence_reprompt_message?: string;
  silence_hangup_delay?: number;
  maximum_call_duration: number;
  conclusion_message?: string;
  customer_response_timeout?: number;
  retry_attempts?: number;
  auto_hangup_on_completion?: boolean;
}

export interface AgentGuardrails {
  allowed_actions: string[];
  restricted_actions: string[];
  disabled_restrictions?: string[];
  escalation_rules: string[];
}

export interface BusinessServiceItem {
  name: string;
  description?: string;
  pricing?: string;
  enabled: boolean;
}

export interface BusinessHours {
  days: string;
  hours: string;
  timezone: string;
  closed_on: string;
}

export interface CompanyFAQItem {
  question: string;
  answer: string;
  category?: string;
  enabled: boolean;
}

export interface CompanyBusinessProfile {
  id?: string;
  organization_id: string;
  company_name: string;
  tagline?: string;
  company_introduction: string;
  email: string;
  phone: string;
  website?: string;
  address: string;
  city: string;
  state: string;
  country: string;
  operating_hours: BusinessHours;
  services: BusinessServiceItem[];
  faqs: CompanyFAQItem[];
  allow_user_edits?: boolean;
  additional_notes?: string;
  updated_at?: string;
  updated_by?: string;
}

export interface AgentConfig {
  agent_id: string;
  organization_id: string;
  owner_user_id?: string;
  created_by?: string;
  updated_by?: string;
  name: string;
  description?: string;
  scope: 'GLOBAL' | 'ORGANIZATION';
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  version: number;
  role: string;
  objective: string;
  secondary_objectives?: string[];
  responsibilities?: string[];
  services?: AgentServiceItem[];
  skills?: string[];
  communication_style: string;
  greeting_style?: string;
  closing_style?: string;
  response_length: string;
  small_talk_level?: string;
  personality: AgentPersonality;
  voice: AgentVoiceConfig;
  llm: AgentLLMConfig;
  listen?: AgentListenConfig;
  runtime?: AgentRuntimeSettings;
  guardrails?: AgentGuardrails;
  greeting: string;
  closing_message?: string;
  system_prompt?: string | null;
  include_business_knowledge?: boolean;
  custom_knowledge?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AvailableAgentsResponse {
  my_agents: AgentConfig[];
  default_agents: AgentConfig[];
}

export interface ConversationTurnMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  stt_latency_ms?: number;
  llm_latency_ms?: number;
  tts_latency_ms?: number;
  turn_latency_ms?: number;
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
  agent_id?: string;
  agent_version?: number;
  agent_name?: string;
  agent_scope?: string;
  agent_config_snapshot?: Partial<AgentConfig> | Record<string, any>;
  transcript?: ConversationTurnMessage[];
  outcome?: string;
  latency_metrics?: Record<string, any>;
  error_information?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface VoiceTelemetryEvent {
  event_type: string;
  call_session_id: string;
  organization_id: string;
  agent_id?: string;
  twilio_call_sid?: string;
  timestamp: string;
  payload: Record<string, any>;
}

export interface VoiceRuleItem {
  id: string;
  category_id: string;
  category_name: string;
  title: string;
  summary: string;
  rule_directive: string;
  example: string;
  enabled: boolean;
  icon?: string;
}

export interface VoiceRuleCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  rules: VoiceRuleItem[];
}

export interface VoiceRulesResponse {
  total_rules: number;
  enabled_rules: number;
  categories: VoiceRuleCategory[];
  updated_at?: string;
}

