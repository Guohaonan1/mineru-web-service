"""Registry for local MinerU major-version adapters."""

from app.services.adapters.base import LocalMinerUAdapter
from app.services.adapters.v3 import V3Adapter
from app.services.adapters.v4 import V4Adapter
from app.services.adapters.v41 import V41Adapter

ADAPTERS: dict[str, LocalMinerUAdapter] = {
    "local_v3": V3Adapter(),
    "local_v4": V4Adapter(),
    "local_v41": V41Adapter(),
}


def get_adapter(engine: str) -> LocalMinerUAdapter:
    try:
        return ADAPTERS[engine]
    except KeyError as exc:
        raise ValueError(f"不支持的本地解析引擎: {engine}") from exc
