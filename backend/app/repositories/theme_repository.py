import uuid
import time
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from app.core.cosmos import get_themes_container
from app.models.theme import OrganizationThemeConfig, ThemeIdentity, ThemeColors, ThemeAppearance, ThemeTypography

# Organization Theme memory cache for instant <1ms lookups
_THEME_CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
THEME_CACHE_TTL_SECONDS = 120.0

DEFAULT_THEME = {
    "identity": {
        "org_name": "Desire AI",
        "logo_url": None,
        "logo_dark_url": None,
        "favicon_url": None,
        "show_nav_logo": True,
        "show_nav_title": True,
    },
    "colors": {
        "primary": "#4f46e5",
        "primary_hover": "#4338ca",
        "secondary": "#0ea5e9",
        "accent": "#8b5cf6",
        "background": "#ffffff",
        "surface": "#ffffff",
        "sidebar": "#faf9fa",
        "sidebar_text": "#0f172a",
        "heading": "#0f172a",
        "text": "#1e293b",
        "text_muted": "#475569",
        "border": "#e2e8f0",
        "success": "#10b981",
        "warning": "#f59e0b",
        "danger": "#ef4444",
        "info": "#3b82f6",
    },
    "appearance": {
        "ui_style": "default",
        "border_radius": "md",
        "ui_density": "comfortable",
        "color_mode": "light",
    },
    "typography": {
        "font_family": "Inter",
        "font_scale": "md",
    },
}

class ThemeRepository:
    @staticmethod
    async def get_theme(organization_id: str) -> Dict[str, Any]:
        cached = _THEME_CACHE.get(organization_id)
        if cached:
            data, ts = cached
            if time.time() - ts < THEME_CACHE_TTL_SECONDS:
                return data
            del _THEME_CACHE[organization_id]

        def _sync_get():
            container = get_themes_container()
            if not container:
                doc = {
                    "id": f"theme_{organization_id}",
                    "organization_id": organization_id,
                    **DEFAULT_THEME,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                _THEME_CACHE[organization_id] = (doc, time.time())
                return doc

            query = "SELECT * FROM c WHERE c.organization_id = @org_id"
            params = [{"name": "@org_id", "value": organization_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    _THEME_CACHE[organization_id] = (items[0], time.time())
                    return items[0]
            except Exception as e:
                print(f"[ThemeRepository Error] get_theme: {e}")
            
            # Default theme fallback
            doc = {
                "id": f"theme_{organization_id}",
                "organization_id": organization_id,
                **DEFAULT_THEME,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            _THEME_CACHE[organization_id] = (doc, time.time())
            return doc

        return await asyncio.to_thread(_sync_get)

    @staticmethod
    async def save_theme(organization_id: str, theme_payload: Dict[str, Any], user_email: str) -> Dict[str, Any]:
        def _sync_save():
            container = get_themes_container()
            if not container:
                raise Exception("Theme container unavailable")
            
            query = "SELECT * FROM c WHERE c.organization_id = @org_id"
            params = [{"name": "@org_id", "value": organization_id}]
            existing_doc = None
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
                if items:
                    existing_doc = items[0]
            except Exception as e:
                print(f"[ThemeRepository Warning] checking existing theme: {e}")

            now_iso = datetime.now(timezone.utc).isoformat()
            
            theme_doc = existing_doc or {
                "id": f"theme_{organization_id}",
                "organization_id": organization_id,
                **DEFAULT_THEME
            }

            # Merge updates
            if "identity" in theme_payload and theme_payload["identity"]:
                theme_doc["identity"] = {**theme_doc.get("identity", {}), **theme_payload["identity"]}
            if "colors" in theme_payload and theme_payload["colors"]:
                theme_doc["colors"] = {**theme_doc.get("colors", {}), **theme_payload["colors"]}
            if "appearance" in theme_payload and theme_payload["appearance"]:
                theme_doc["appearance"] = {**theme_doc.get("appearance", {}), **theme_payload["appearance"]}
            if "typography" in theme_payload and theme_payload["typography"]:
                theme_doc["typography"] = {**theme_doc.get("typography", {}), **theme_payload["typography"]}

            theme_doc["updated_at"] = now_iso
            theme_doc["updated_by"] = user_email

            container.upsert_item(body=theme_doc)
            _THEME_CACHE[organization_id] = (theme_doc, time.time())
            return theme_doc

        return await asyncio.to_thread(_sync_save)

    @staticmethod
    async def reset_theme(organization_id: str, user_email: str) -> Dict[str, Any]:
        def _sync_reset():
            container = get_themes_container()
            if not container:
                raise Exception("Theme container unavailable")
            
            now_iso = datetime.now(timezone.utc).isoformat()
            theme_doc = {
                "id": f"theme_{organization_id}",
                "organization_id": organization_id,
                **DEFAULT_THEME,
                "updated_at": now_iso,
                "updated_by": user_email
            }
            container.upsert_item(body=theme_doc)
            _THEME_CACHE[organization_id] = (theme_doc, time.time())
            return theme_doc

        return await asyncio.to_thread(_sync_reset)
