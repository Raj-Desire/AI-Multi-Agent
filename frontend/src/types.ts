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

export interface FewShotTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface FewShotExample {
  title: string;
  industry: 'real_estate' | 'healthcare' | 'b2b_tech' | 'automotive' | 'legal' | 'support' | 'general' | string;
  dialogue: FewShotTurn[];
}

export interface PronunciationRule {
  word: string;
  phonetic: string;
  category?: 'indian_places' | 'acronyms' | 'brand' | 'custom' | string;
}

export interface AgentListenConfig {
  provider: string;
  model: string;
  language: string;
  endpointing?: number;
  endpointing_mode?: 'rapid' | 'balanced' | 'dictation' | 'adaptive';
  dictation_endpointing?: number;
  rapid_endpointing?: number;
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
  conversational_fillers_enabled?: boolean;
  filler_phrases?: string[];
  backchanneling_enabled?: boolean;
  backchannel_interval_seconds?: number;
  backchannel_phrases?: string[];
  ambient_noise_filtering?: boolean;
  barge_in_min_speech_duration_ms?: number;
  graceful_resumption_enabled?: boolean;
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
  pronunciation_rules?: PronunciationRule[];
  few_shot_examples?: FewShotExample[];
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
  prospect_id?: string;
  campaign_id?: string;
  agent_id?: string;
  agent_version?: number;
  agent_name?: string;
  agent_scope?: string;
  agent_config_snapshot?: Partial<AgentConfig> | Record<string, any>;
  transcript?: ConversationTurnMessage[];
  outcome?: string;
  business_outcome?: string;
  summary?: string;
  key_insights?: string[];
  key_requirements?: string[];
  customer_questions?: string[];
  objections?: string[];
  important_info?: string;
  next_action?: string;
  intent?: string;
  sentiment?: string;
  lead_score?: number;
  interest_level?: string;
  classification?: string;
  callback_datetime?: string;
  analytics_status?: string;
  analytics?: Record<string, any>;
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

// -------------------------------------------------------------
// Prospect & Contact Management Types
// -------------------------------------------------------------
export type ProspectStatus =
  | "New"
  | "Contacted"
  | "Connected"
  | "Interested"
  | "Not Interested"
  | "Callback Requested"
  | "Qualified"
  | "Converted"
  | "Do Not Contact"
  | "Invalid";

export type ProspectSource =
  | "Manual"
  | "CSV Import"
  | "API"
  | "Web Form"
  | "Campaign"
  | "Inbound Call"
  | "Other";

export interface Prospect {
  id: string;
  organization_id: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  phone_number: string;
  normalized_phone: string;
  email?: string;
  alternate_phone?: string;
  company?: string;
  job_title?: string;
  industry?: string;
  website?: string;
  status: ProspectStatus;
  source: ProspectSource;
  group_name?: string;
  tags: string[];
  notes?: string;
  assigned_owner?: string;
  custom_fields: Record<string, any>;
  last_contacted_at?: string;
  next_follow_up_at?: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  last_call_id?: string;
  last_call_outcome?: string;
  is_dnc: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface ProspectPaginationResponse {
  items: Prospect[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ProspectFilterParams {
  search?: string;
  status?: string;
  tag?: string;
  source?: string;
  group_name?: string;
  assigned_owner?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export interface DistinctGroupsResponse {
  groups: string[];
}

export interface CSVValidateRowDetail {
  row_number: number;
  is_valid: boolean;
  errors: string[];
  is_duplicate: boolean;
  duplicate_type?: string;
  data: Record<string, any>;
}

export interface CSVValidateResponse {
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  sample_rows: CSVValidateRowDetail[];
  all_errors: Array<{
    row: number;
    phone: string;
    errors: string[];
  }>;
}

export interface CSVImportSummaryResponse {
  total_rows: number;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  invalid_count: number;
  errors: Array<{
    row: number;
    phone: string;
    reason: string;
  }>;
}

// ------------------------------------------------------------------
// Campaign & Automated Outbound Dialer Domain Types
// ------------------------------------------------------------------

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "stopped"
  | "failed";

export type CampaignMemberStatus =
  | "queued"
  | "calling"
  | "completed"
  | "retrying"
  | "unanswered"
  | "failed"
  | "skipped_dnc"
  | "skipped_invalid";

export type CampaignEventType =
  | "created"
  | "updated"
  | "started"
  | "paused"
  | "resumed"
  | "stopped"
  | "completed"
  | "failed"
  | "call_dispatched"
  | "call_completed"
  | "retry_scheduled"
  | "members_added";

export interface CampaignCallingConfig {
  agent_id: string;
  caller_phone_number: string;
  max_concurrent_calls: number;
  max_attempts_per_prospect: number;
  retry_delay_minutes: number;
  call_timeout_seconds: number;
}

export interface CampaignSchedule {
  start_date?: string | null;
  end_date?: string | null;
  calling_days: string[];
  calling_start_time: string;
  calling_end_time: string;
  timezone: string;
}

export type BusinessOutcome =
  | "Highly Interested"
  | "Interested"
  | "Warm Interested"
  | "Callback Requested"
  | "Follow-up Required"
  | "Information Requested"
  | "Qualified"
  | "Converted"
  | "Not Interested"
  | "Do Not Contact"
  | "Voicemail"
  | "No Answer"
  | "Failed";

export interface ActiveCampaignCall {
  call_session_id: string;
  twilio_call_sid?: string;
  prospect_id?: string;
  phone_number: string;
  agent_id?: string;
  agent_name?: string;
  status: string;
  direction: string;
  duration: number;
  turn_count: number;
  started_at?: string;
}

export interface CampaignStats {
  total_prospects: number;
  queued: number;
  calling: number;
  retrying: number;
  unanswered?: number;
  completed: number;
  connected: number;
  failed: number;
  no_answer: number;
  busy: number;
  voicemail: number;
  callbacks: number;
  interested: number;
  warm_interested?: number;
  highly_interested?: number;
  not_interested: number;
  qualified?: number;
  converted?: number;
  follow_up_required?: number;
  information_requested?: number;
  dnc: number;
  connection_rate: number;
  completion_rate: number;
  avg_duration_seconds: number;
}

export interface Campaign {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  status: CampaignStatus;
  calling_config: CampaignCallingConfig;
  schedule: CampaignSchedule;
  stats: CampaignStats;
  last_dispatched_at?: string | null;
  completed_at?: string | null;
  stopped_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface CampaignMember {
  id: string;
  campaign_id: string;
  organization_id: string;
  prospect_id: string;
  prospect_name: string;
  phone_number: string;
  normalized_phone: string;
  status: CampaignMemberStatus;
  attempts: number;
  last_attempt_at?: string | null;
  next_attempt_at?: string | null;
  last_call_id?: string | null;
  last_call_outcome?: string | null;
  last_call_duration: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignEvent {
  id: string;
  campaign_id: string;
  organization_id: string;
  event_type: CampaignEventType;
  message: string;
  details?: Record<string, any> | null;
  timestamp: string;
}

export interface ProspectSelectionFilter {
  select_all?: boolean;
  prospect_ids?: string[];
  tags?: string[];
  statuses?: string[];
  sources?: string[];
  exclude_dnc?: boolean;
}

export interface CreateCampaignPayload {
  name: string;
  description?: string;
  calling_config: CampaignCallingConfig;
  schedule: CampaignSchedule;
  prospect_selection: ProspectSelectionFilter;
  start_immediately?: boolean;
}

export interface UpdateCampaignPayload {
  name?: string;
  description?: string;
  calling_config?: Partial<CampaignCallingConfig>;
  schedule?: Partial<CampaignSchedule>;
}

export interface CampaignPaginationResponse {
  items: Campaign[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface CampaignMemberListResponse {
  items: CampaignMember[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ------------------------------------------------------------------
// Lead Intelligence Domain Types
// ------------------------------------------------------------------

export interface LeadKPISummary {
  total_leads: number;
  interested: number;
  callback_requested: number;
  needs_follow_up: number;
  not_interested: number;
  no_answer: number;
  avg_lead_score: number;
  avg_call_duration_seconds: number;
  total_leads_change_pct?: number | null;
  interested_change_pct?: number | null;
  callback_change_pct?: number | null;
  needs_follow_up_change_pct?: number | null;
  not_interested_change_pct?: number | null;
  no_answer_change_pct?: number | null;
  period_label: string;
  comparison_label?: string | null;
}

export interface LeadTrendPoint {
  date: string;
  display_label: string;
  total_leads: number;
  interested: number;
  callback_requested: number;
  needs_follow_up: number;
  not_interested: number;
  no_answer: number;
}

export interface LeadTrendsResponse {
  metric: string;
  points: LeadTrendPoint[];
  total_data_points: number;
}

export interface LeadOutcomeDistributionItem {
  outcome: string;
  count: number;
  percentage: number;
  color_hint: string;
}

export interface LeadOutcomeDistributionResponse {
  total_analyzed_calls: number;
  distribution: LeadOutcomeDistributionItem[];
}

export interface CampaignLeadStat {
  campaign_id: string;
  campaign_name: string;
  status: string;
  total_leads: number;
  interested: number;
  callback_requested: number;
  needs_follow_up: number;
  not_interested: number;
  no_answer: number;
  conversion_rate: number;
  last_lead_at?: string | null;
}

export interface AgentLeadStat {
  agent_id: string;
  agent_name: string;
  total_calls: number;
  interested_leads: number;
  callback_leads: number;
  avg_lead_score: number;
}

export interface LeadListItem {
  prospect_id: string;
  full_name: string;
  company?: string | null;
  phone_number: string;
  email?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  agent_id?: string | null;
  agent_name?: string | null;
  business_outcome: string;
  interest_level: string;
  lead_score: number;
  last_call_id?: string | null;
  last_call_at?: string | null;
  last_call_duration: number;
  next_action?: string | null;
  prospect_status: string;
  callback_datetime?: string | null;
  summary?: string | null;
  tags: string[];
}

export interface LeadListPaginationResponse {
  items: LeadListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface CallbackListItem {
  prospect_id: string;
  full_name: string;
  company?: string | null;
  phone_number: string;
  email?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  requested_datetime?: string | null;
  last_call_at?: string | null;
  summary?: string | null;
  next_action?: string | null;
  business_outcome: string;
  interest_level: string;
  lead_score: number;
  prospect_status: string;
}

export interface CallbackListPaginationResponse {
  items: CallbackListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface LeadHighlightEvidence {
  icon: string;
  text: string;
}

export interface LeadDetailResponse {
  prospect: Prospect;
  campaign_id?: string | null;
  campaign_name?: string | null;
  latest_call_id?: string | null;
  latest_call_at?: string | null;
  business_outcome: string;
  interest_level: string;
  lead_score: number;
  summary?: string | null;
  intent?: string | null;
  sentiment?: string | null;
  key_insights: string[];
  key_requirements: string[];
  customer_questions: string[];
  objections: string[];
  important_info?: string | null;
  next_action?: string | null;
  callback_datetime?: string | null;
  agent_id?: string | null;
  agent_name?: string | null;
  highlight_reasons: LeadHighlightEvidence[];
  transcript: ConversationTurnMessage[];
  call_history: Array<{
    call_id: string;
    created_at: string;
    duration: number;
    outcome: string;
    summary: string;
    agent_name?: string;
    campaign_id?: string;
  }>;
}

export interface LeadActionRequest {
  status?: string;
  next_follow_up_at?: string;
  callback_datetime?: string;
  note?: string;
  tags?: string[];
  assigned_owner?: string;
}
