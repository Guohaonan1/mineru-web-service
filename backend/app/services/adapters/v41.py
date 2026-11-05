"""MinerU 4.1 Tasks API: JSON manifest, upload links and per-file ZIP results."""

import asyncio
import base64
import hashlib
import io
import json
import mimetypes
import re
import zipfile
from typing import Any
from urllib.parse import unquote, urljoin

import httpx

from app.config import settings


class V41Adapter:
    def __init__(self, url: str | None = None):
        self.url = (url or settings.mineru_v41_url).rstrip("/")

    def _resolve(self, url: str) -> str:
        return urljoin(self.url + "/", url)

    async def health(self) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
                response = await client.get(f"{self.url}/v1/health")
                response.raise_for_status()
                data = response.json()
            version = str(data.get("version", ""))
            features = data.get("features") or {}
            compatible = version.startswith("4.1.")
            return {
                "ok": data.get("status") == "ok" and compatible
                and "default" in features.get("task_output_formats", [])
                and {"upload", "url"}.issubset(features.get("sources", [])),
                "version": version,
                "features": features,
            }
        except (httpx.HTTPError, ValueError, TypeError, AttributeError):
            return {"ok": False, "version": None, "features": {}}

    @staticmethod
    def _filename(value: str) -> str:
        name = unquote(value).replace("\\", "/").rsplit("/", 1)[-1]
        name = re.sub(r"[:\x00-\x1f\x7f]", "_", name)
        if name in {"", ".", ".."}:
            raise ValueError("MinerU 4.1 文件名无效")
        return name

    @staticmethod
    def _task_id(payload: dict[str, Any]) -> str:
        task_id = payload.get("task_id")
        if not isinstance(task_id, str) or not task_id:
            raise ValueError("MinerU 4.1 未返回有效 task_id")
        return task_id

    async def submit(self, file_bytes: bytes, filename: str, tier: str = "standard", ocr_mode: str = "auto") -> str:
        if not file_bytes:
            raise ValueError("MinerU 4.1 不接受空文件")
        body = {
            "files": [{"file_name": self._filename(filename), "bytes": len(file_bytes),
                       "sha256sum": hashlib.sha256(file_bytes).hexdigest()}],
            "tier": tier, "ocr_mode": ocr_mode, "output_formats": ["default"],
        }
        async with httpx.AsyncClient(timeout=300, trust_env=False) as client:
            response = await client.post(f"{self.url}/v1/tasks", json=body)
            response.raise_for_status()
            created = response.json()
            task_id = self._task_id(created)
            files = created.get("files") or []
            if len(files) != 1 or not isinstance(files[0], dict):
                raise ValueError("MinerU 4.1 创建响应缺少文件状态")
            file_state = files[0]
            # A cache hit needs no PUT. While the cache is checked the service may
            # temporarily report waiting-file without an upload link.
            for _ in range(60):
                if file_state.get("status") != "waiting-file":
                    break
                upload = file_state.get("upload")
                if upload:
                    upload_url = upload.get("url")
                    if not isinstance(upload_url, str) or not upload_url:
                        raise ValueError("MinerU 4.1 未返回有效上传地址")
                    uploaded = await client.put(self._resolve(upload_url), content=file_bytes,
                                                headers=upload.get("headers") or {})
                    uploaded.raise_for_status()
                    break
                await asyncio.sleep(1)
                detail = await client.get(f"{self.url}/v1/tasks/{task_id}")
                detail.raise_for_status()
                states = detail.json().get("files") or []
                if len(states) != 1:
                    raise ValueError("MinerU 4.1 任务状态缺少文件")
                file_state = states[0]
            else:
                raise TimeoutError("MinerU 4.1 等待上传链接超时")
            return task_id

    async def submit_url(self, url: str, filename: str, tier: str = "standard", ocr_mode: str = "auto") -> str:
        async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
            response = await client.post(
                f"{self.url}/v1/tasks",
                json={"files": [{"file_name": self._filename(filename), "url": url}],
                      "tier": tier, "ocr_mode": ocr_mode, "output_formats": ["default"]},
            )
            response.raise_for_status()
            return self._task_id(response.json())

    async def status(self, task_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            response = await client.get(f"{self.url}/v1/tasks/{task_id}")
            response.raise_for_status()
            return response.json()

    async def result(self, task_id: str, filename: str, state: dict[str, Any] | None = None) -> dict[str, Any]:
        state = state or await self.status(task_id)
        files = state.get("files") or []
        if state.get("status") != "completed" or len(files) != 1 or files[0].get("status") != "completed":
            error = files[0].get("error") if files else state.get("error")
            raise ValueError(f"MinerU 4.1 文件解析失败: {filename}: {error or state.get('status')}")
        result_url = files[0].get("result_url")
        if not isinstance(result_url, str) or not result_url:
            raise ValueError("MinerU 4.1 已完成任务缺少结果下载地址")
        async with httpx.AsyncClient(timeout=300, trust_env=False) as client:
            response = await client.get(self._resolve(result_url), follow_redirects=True)
            response.raise_for_status()
        return self._parse_zip(response.content)

    @staticmethod
    def _parse_zip(content: bytes) -> dict[str, Any]:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = set(archive.namelist())
            required = {"markdown.md", "middle_json.json", "structured_content.json"}
            if not required.issubset(names):
                raise ValueError("MinerU 4.1 默认结果 ZIP 缺少解析文件")
            markdown = archive.read("markdown.md").decode("utf-8")
            middle = json.loads(archive.read("middle_json.json"))
            structured = json.loads(archive.read("structured_content.json"))
            images = {}
            for name in names:
                if not name.startswith("images/") or name.endswith("/"):
                    continue
                mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
                images[name] = f"data:{mime};base64,{base64.b64encode(archive.read(name)).decode('ascii')}"

        def image_uri(value: str) -> str:
            return images.get(unquote(value), value)

        def replace_sources(value: Any) -> Any:
            if isinstance(value, list):
                return [replace_sources(item) for item in value]
            if isinstance(value, dict):
                return {key: image_uri(item) if key in {"image_source", "img_path"} and isinstance(item, str)
                        else replace_sources(item) for key, item in value.items()}
            return value

        structured = replace_sources(structured)
        for path, uri in images.items():
            markdown = markdown.replace(f"]({path})", f"]({uri})")
        return {"md_content": markdown, "middle_json": middle, "structured_content": structured}
