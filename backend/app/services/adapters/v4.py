"""MinerU 4.x V1 convenience API adapter.

The V1 payload is retained intact for the version-specific frontend parser.
"""

from typing import Any

import httpx

from app.config import settings

OUTPUT_FORMATS = ("markdown", "middle_json", "structured_content")
TERMINAL_STATUSES = frozenset({"completed", "partial", "failed", "canceled"})


class V4Adapter:
    def __init__(self, url: str | None = None):
        self.url = (url or settings.mineru_v4_url).rstrip("/")

    async def health(self) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
                response = await client.get(f"{self.url}/v1/health")
                response.raise_for_status()
                data = response.json()
                version = str(data.get("version", ""))
                formats = set(data.get("features", {}).get("output_formats", []))
                return {
                    "ok": data.get("status") == "ok" and version.startswith("4.0.")
                    and set(OUTPUT_FORMATS).issubset(formats),
                    "version": version,
                    "features": data.get("features", {}),
                }
        except (httpx.HTTPError, ValueError, TypeError):
            return {"ok": False, "version": None, "features": {}}

    async def submit(self, file_bytes: bytes, filename: str, tier: str = "standard", ocr_mode: str = "auto") -> str:
        async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
            response = await client.post(
                f"{self.url}/v1/tasks",
                params={"tier": tier, "ocr_mode": ocr_mode, "output_formats": OUTPUT_FORMATS},
                files={"files": (filename, file_bytes)},
            )
            response.raise_for_status()
            task_id = response.json().get("task_id")
            if not isinstance(task_id, str) or not task_id:
                raise ValueError("MinerU v4 未返回有效 task_id")
            return task_id

    async def submit_url(self, url: str, tier: str = "standard", ocr_mode: str = "auto") -> str:
        async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
            response = await client.post(
                f"{self.url}/v1/tasks",
                json={"files": [{"source": {"type": "url", "url": url}}],
                      "tier": tier, "ocr_mode": ocr_mode, "output_formats": list(OUTPUT_FORMATS)},
            )
            response.raise_for_status()
            task_id = response.json().get("task_id")
            if not isinstance(task_id, str) or not task_id:
                raise ValueError("MinerU v4 未返回有效 task_id")
            return task_id

    async def status(self, task_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            response = await client.get(f"{self.url}/v1/tasks/{task_id}")
            response.raise_for_status()
            return response.json()

    async def result(self, task_id: str, filename: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
            response = await client.get(f"{self.url}/v1/tasks/{task_id}/result")
            response.raise_for_status()
            return self._parse_result(response.json(), filename)

    async def parse_sync(self, file_bytes: bytes, filename: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=360, trust_env=False) as client:
            response = await client.post(
                f"{self.url}/v1/file_parse",
                params={"output_formats": OUTPUT_FORMATS},
                files={"files": (filename, file_bytes)},
            )
            response.raise_for_status()
            return self._parse_result(response.json(), filename)

    @staticmethod
    def _parse_result(payload: dict[str, Any], filename: str) -> dict[str, Any]:
        if payload.get("status") != "completed":
            raise ValueError(f"MinerU v4 任务未完整完成: {payload.get('status')}")
        files = payload.get("files") or []
        if len(files) != 1 or files[0].get("status") != "completed":
            raise ValueError(f"MinerU v4 文件解析失败: {filename}")
        content = files[0].get("content") or {}
        return {
            "md_content": content.get("markdown", ""),
            "middle_json": content.get("middle_json"),
            "structured_content": content.get("structured_content"),
        }
