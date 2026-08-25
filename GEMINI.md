# Workspace Platform Guidelines & Customization Rules

## 1. Brand Neutrality & White-Label Policy

To preserve a clean, white-label, and proprietary user experience:

- **Do NOT mention "Desire AI" or "Desire"**:
  - Never use "Desire AI" or "Desire" in any user-facing UI text, markdown documentation, AI system prompt templates, default greetings, agent names, placeholders, or email examples.
  - Use generic, tenant-adaptive, or neutral names such as `"AI Voice Platform"`, `"AI Receptionist"`, `"Company Knowledge Base"`, `"admin@example.com"`, etc.

- **Do NOT mention "Deepgram" in User-Facing Contexts**:
  - End users must **NOT** be able to detect the underlying vendor model or speech platform used.
  - Never display "Deepgram" in frontend UI components, tooltips, placeholders, cards, titles, headers, badges, audio demo preview samples, voice selector labels, or user-facing error messages.
  - Use simple, natural terminology:
    - `"Deepgram Aura"` &rarr; `"Aura"` (or `"Aura Voice"`)
    - `"Deepgram Aura-1 (English)"` &rarr; `"Aura English"`
    - `"Deepgram Aura-2 (Next-Gen Multilingual)"` &rarr; `"Aura Multilingual"`
    - `"Deepgram Voice"` / `"Deepgram Voice Agent"` &rarr; `"Voice Engine"` / `"Spoken Voice"` / `"Real-Time Voice Assistant"`
    - `"Deepgram Runtime Active"` &rarr; `"Voice Engine Active"`
    - `"Deepgram Real-Time"` &rarr; `"Real-Time Spoken AI"`
    - `"powered by Deepgram"` &rarr; `"powered by Real-Time Spoken AI"`

## 2. Technical Code Separation

- Keep low-level internal vendor integrations (such as Python client modules, internal database column identifiers, and environment variable names like `DEEPGRAM_API_KEY`) strictly confined to backend internal implementation.
- Any error messages, API descriptions, or responses dispatched to the frontend or caller must use vendor-neutral terms (e.g., `"Voice engine service unavailable"` instead of mentioning third-party provider names).
