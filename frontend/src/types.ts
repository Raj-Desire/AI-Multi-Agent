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
  inbound_forward_mode?: "global" | "per_number" | "disabled";
  inbound_forward_global_number?: string | null;
  inbound_forward_mapping?: Record<string, string>;
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
  inbound_forward_mode?: "global" | "per_number" | "disabled";
  inbound_forward_global_number?: string;
  inbound_forward_mapping?: Record<string, string>;
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

export type UIStyle =
  | 'default'
  | 'minimal'
  | 'glassmorphism'
  | 'liquid_glass'
  | 'brutalism'
  | 'claymorphism'
  | 'neomorphism'
  | 'retro';

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

export type PalettePreset =
  | 'Original'
  | 'Dark'
  | 'Muted'
  | 'Vivid'
  | 'Complement'
  | 'Triadic'
  | 'Analogous'
  | 'Mono'
  | 'Pastel'
  | 'Deep'
  | 'Spectrum';

