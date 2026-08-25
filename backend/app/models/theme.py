from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

class ThemeColors(BaseModel):
    primary: str = "#4f46e5"
    primary_hover: Optional[str] = "#4338ca"
    secondary: str = "#0ea5e9"
    accent: str = "#8b5cf6"
    background: str = "#f8fafc"
    surface: str = "#ffffff"
    sidebar: str = "#ffffff"
    sidebar_text: str = "#1e293b"
    heading: Optional[str] = "#0f172a"
    text: str = "#0f172a"
    text_muted: str = "#475569"
    border: str = "#e2e8f0"
    success: str = "#10b981"
    warning: str = "#f59e0b"
    danger: str = "#ef4444"
    info: str = "#3b82f6"

class ThemeAppearance(BaseModel):
    ui_style: str = "default"  # default, minimal, glassmorphism, liquid_glass, brutalism, claymorphism, neomorphism, retro
    border_radius: str = "md"  # none, sm, md, lg, xl, full
    ui_density: str = "comfortable"  # compact, comfortable, spacious
    color_mode: str = "light"  # light, dark, system

class ThemeTypography(BaseModel):
    font_family: str = "Inter"  # Inter, Plus Jakarta Sans, Outfit, Roboto, Poppins, Space Grotesk
    font_scale: str = "md"  # sm, md, lg

class ThemeIdentity(BaseModel):
    org_name: str = "AI Voice Platform"
    logo_url: Optional[str] = None
    logo_dark_url: Optional[str] = None
    favicon_url: Optional[str] = None
    show_nav_logo: bool = True
    show_nav_title: bool = True

class OrganizationThemeConfig(BaseModel):
    id: Optional[str] = None
    organization_id: str
    identity: ThemeIdentity = Field(default_factory=ThemeIdentity)
    colors: ThemeColors = Field(default_factory=ThemeColors)
    appearance: ThemeAppearance = Field(default_factory=ThemeAppearance)
    typography: ThemeTypography = Field(default_factory=ThemeTypography)
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None

class SaveThemePayload(BaseModel):
    identity: Optional[ThemeIdentity] = None
    colors: Optional[ThemeColors] = None
    appearance: Optional[ThemeAppearance] = None
    typography: Optional[ThemeTypography] = None
