"""Explicit local MinerU v4 model preparation and verification."""

import asyncio
import os
import shutil
import time
from pathlib import Path

from app.config import settings

MODEL_ARGS = ("--tier", "standard", "--small-backend", "onnx", "--vlm-engine", "llama-cpp")


class V4ModelSetup:
    def __init__(self):
        self.state = "checking"
        self.detail = ""
        self.checked_at = 0.0
        self.task: asyncio.Task | None = None
        self.lock = asyncio.Lock()

    def snapshot(self) -> dict:
        return {"state": self.state, "ready": self.state == "ready", "detail": self.detail}

    async def _run(self, *args: str) -> tuple[int, str]:
        configured_cli = settings.mineru_v4_cli
        resolved_cli = shutil.which(configured_cli)
        cli = Path(resolved_cli) if resolved_cli else Path(configured_cli)
        if not cli.is_file() or not os.access(cli, os.X_OK):
            return 1, f"找不到 MinerU CLI：{configured_cli}。请配置 MINERU_V4_CLI。"
        process = await asyncio.create_subprocess_exec(
            str(cli), "models", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            output, _ = await process.communicate()
        except asyncio.CancelledError:
            process.terminate()
            await process.wait()
            raise
        return process.returncode, output.decode("utf-8", errors="replace")[-600:]

    async def status(self) -> dict:
        if self.task and not self.task.done():
            return self.snapshot()
        if time.monotonic() - self.checked_at < 15:
            return self.snapshot()
        async with self.lock:
            if self.task and not self.task.done():
                return self.snapshot()
            if time.monotonic() - self.checked_at >= 15:
                self.state = "checking"
                code, output = await self._run("verify", *MODEL_ARGS)
                self.state = "ready" if code == 0 else "missing"
                self.detail = "" if code == 0 else output.strip()
                self.checked_at = time.monotonic()
        return self.snapshot()

    async def start(self) -> dict:
        async with self.lock:
            if self.task and not self.task.done():
                return self.snapshot()
            if self.state == "ready":
                return self.snapshot()
            self.state = "downloading"
            self.detail = ""
            self.task = asyncio.create_task(self._download_and_verify())
            return self.snapshot()

    async def _download_and_verify(self) -> None:
        try:
            code, output = await self._run("download", *MODEL_ARGS, "--source", "modelscope")
            if code != 0:
                self.state = "failed"
                self.detail = output.strip() or "模型下载失败，请检查后端日志。"
                return
            self.state = "verifying"
            code, output = await self._run("verify", *MODEL_ARGS)
            self.state = "ready" if code == 0 else "failed"
            self.detail = "" if code == 0 else output.strip() or "模型校验失败。"
        except Exception as exc:
            self.state = "failed"
            self.detail = str(exc)
        finally:
            self.checked_at = time.monotonic()


v4_model_setup = V4ModelSetup()
