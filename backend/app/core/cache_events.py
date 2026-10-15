"""
Tiny publish/subscribe hook so read-side caches (e.g. lead intelligence aggregates) learn when
underlying call/prospect data changes, without the repositories importing the services.
Listeners are held weakly so short-lived instances (tests) are never kept alive.
"""
import logging
import weakref
from typing import Callable, List, Optional

logger = logging.getLogger("cache_events")

_listeners: List["weakref.WeakMethod"] = []


def register_listener(bound_method: Callable[[Optional[str]], None]) -> None:
    _listeners.append(weakref.WeakMethod(bound_method))


def notify_data_changed(org_id: Optional[str] = None) -> None:
    """Called by repositories after writes. Never raises."""
    alive = []
    for ref in _listeners:
        fn = ref()
        if fn is None:
            continue
        alive.append(ref)
        try:
            fn(org_id)
        except Exception as e:  # a cache hint must never break a write
            logger.debug(f"cache listener error: {e}")
    _listeners[:] = alive
