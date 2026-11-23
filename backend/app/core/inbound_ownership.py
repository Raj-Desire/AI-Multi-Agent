"""Who receives an inbound call when a phone number is saved by more than one organization."""
from typing import Any, Iterable, Optional


def pick_inbound_owner(configs: Iterable[Any]) -> Optional[Any]:
    """The organization an inbound call to a shared number belongs to.

    A number may be saved by several organizations (e.g. as an outbound caller ID), but a call can only ring one agent.
    Organizations with inbound turned off do not claim the number. Exactly one remaining claimant owns it. Two or more
    claimants are ambiguous, so None is returned (the caller refuses the call) instead of guessing a tenant.
    When every claimant has inbound off, one of them is returned so the "inbound is disabled" message is played.
    """
    by_org: dict = {}
    for cfg in configs:
        by_org.setdefault(cfg.organization_id, cfg)
    claimants = list(by_org.values())
    if not claimants:
        return None
    enabled = [c for c in claimants if (getattr(c, "inbound_forward_mode", None) or "global") != "disabled"]
    if len(enabled) == 1:
        return enabled[0]
    if len(enabled) > 1:
        return None
    return claimants[0]
