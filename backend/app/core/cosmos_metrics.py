"""Request-unit (RU) accounting for Cosmos DB queries, to measure the cost of a query before and after tuning it.

Disabled by default. Set COSMOS_LOG_RU=true to log the total RU charge and latency of every query that goes through
`timed_query`. Cross-partition queries are marked so they stand out.
"""
import logging
import os
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("cosmos.ru")

LOG_RU = (os.getenv("COSMOS_LOG_RU") or "").strip().lower() in ("1", "true", "yes")


def timed_query(container, label: str, query: str, parameters: Optional[List[Dict[str, Any]]] = None, **kwargs) -> List[Dict[str, Any]]:
    """Runs `container.query_items(...)` and returns the full list, logging RU + duration when COSMOS_LOG_RU is on."""
    if not LOG_RU:
        return list(container.query_items(query=query, parameters=parameters, **kwargs))

    charges: List[float] = []

    def _hook(headers, _result):
        try:
            charges.append(float(headers.get("x-ms-request-charge", 0) or 0))
        except (TypeError, ValueError):
            pass

    started = time.perf_counter()
    items = list(container.query_items(query=query, parameters=parameters, response_hook=_hook, **kwargs))
    elapsed_ms = (time.perf_counter() - started) * 1000
    scope = "CROSS-PARTITION" if kwargs.get("enable_cross_partition_query") else "single-partition"
    logger.warning("[RU] %-28s %8.2f RU  %7.1f ms  %5d items  %s", label, sum(charges), elapsed_ms, len(items), scope)
    return items
