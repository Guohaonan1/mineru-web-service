"""Contract checks for the 4.1 JSON Tasks flow and default result archive."""

import asyncio
import io
import json
import unittest
import zipfile
from unittest.mock import patch

import httpx

from app.services.adapters.v4 import V4Adapter
from app.services.adapters.v41 import V41Adapter


def result_zip() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("markdown.md", "![figure](images/figure.png)")
        archive.writestr("middle_json.json", json.dumps({"pages": []}))
        archive.writestr("structured_content.json", json.dumps({
            "pages": [{"page_idx": 0, "blocks": [{"type": "image", "image_source": "images/figure.png"}]}]
        }))
        archive.writestr("images/figure.png", b"png-bytes")
    return buffer.getvalue()


class V41AdapterTest(unittest.TestCase):
    def test_health_distinguishes_minor_versions(self):
        real_client = httpx.AsyncClient

        async def check(version: str, features: dict):
            transport = httpx.MockTransport(lambda request: httpx.Response(
                200, json={"status": "ok", "version": version, "features": features}))
            with patch("app.services.adapters.v41.httpx.AsyncClient",
                       side_effect=lambda *args, **kwargs: real_client(*args, transport=transport, **kwargs)):
                return await V4Adapter("http://mineru.test").health(), await V41Adapter("http://mineru.test").health()

        old, new = asyncio.run(check("4.0.12", {
            "output_formats": ["markdown", "middle_json", "structured_content"]}))
        self.assertTrue(old["ok"])
        self.assertFalse(new["ok"])
        self.assertEqual(new["version"], "4.0.12")

        old, new = asyncio.run(check("4.1.6", {
            "task_output_formats": ["default"], "sources": ["upload", "url"]}))
        self.assertFalse(old["ok"])
        self.assertTrue(new["ok"])
        self.assertEqual(old["version"], "4.1.6")

    def test_upload_poll_and_download(self):
        calls = []
        archive = result_zip()

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            path = request.url.path
            if path == "/v1/health":
                return httpx.Response(200, json={"status": "ok", "version": "4.1.6",
                    "features": {"task_output_formats": ["default"], "sources": ["upload", "url"]}})
            if path == "/v1/tasks" and request.method == "POST":
                body = json.loads(request.content)
                self.assertEqual(body["output_formats"], ["default"])
                self.assertEqual(body["files"][0]["file_name"], "paper.pdf")
                self.assertEqual(body["files"][0]["bytes"], 3)
                return httpx.Response(202, json={"task_id": "task-1", "files": [{
                    "file_id": "file-1", "status": "waiting-file",
                    "upload": {"url": "/v1/tasks/task-1/uploads/file-1", "headers": {"X-Test": "yes"}}}]})
            if path.endswith("/uploads/file-1"):
                self.assertEqual(request.content, b"pdf")
                self.assertEqual(request.headers["X-Test"], "yes")
                return httpx.Response(200, json={"status": "pending"})
            if path == "/v1/tasks/task-1":
                return httpx.Response(200, json={"status": "completed", "files": [{
                    "file_id": "file-1", "status": "completed",
                    "result_url": "http://mineru.test/v1/files/file-1/content"}]})
            if path == "/v1/files/file-1/content":
                return httpx.Response(200, content=archive)
            return httpx.Response(404)

        transport = httpx.MockTransport(handler)
        real_client = httpx.AsyncClient

        def client(*args, **kwargs):
            return real_client(*args, transport=transport, **kwargs)

        async def run():
            adapter = V41Adapter("http://mineru.test")
            self.assertTrue((await adapter.health())["ok"])
            task_id = await adapter.submit(b"pdf", "paper.pdf")
            state = await adapter.status(task_id)
            parsed = await adapter.result(task_id, "paper.pdf", state)
            self.assertEqual(parsed["middle_json"], {"pages": []})
            self.assertTrue(parsed["structured_content"]["pages"][0]["blocks"][0]["image_source"].startswith("data:image/png;base64,"))
            self.assertIn("data:image/png;base64,", parsed["md_content"])

        with patch("app.services.adapters.v41.httpx.AsyncClient", side_effect=client):
            asyncio.run(run())
        self.assertEqual([call.method for call in calls], ["GET", "POST", "PUT", "GET", "GET"])

    def test_url_manifest_and_cache_hit(self):
        calls = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(json.loads(request.content))
            return httpx.Response(202, json={"task_id": "task-2", "files": [{"status": "pending"}]})

        transport = httpx.MockTransport(handler)
        real_client = httpx.AsyncClient
        with patch("app.services.adapters.v41.httpx.AsyncClient",
                   side_effect=lambda *args, **kwargs: real_client(*args, transport=transport, **kwargs)):
            async def run():
                adapter = V41Adapter("http://mineru.test")
                self.assertEqual(await adapter.submit(b"pdf", "paper.pdf"), "task-2")
                self.assertEqual(await adapter.submit_url("https://example.test/a.pdf", "a.pdf"), "task-2")
            asyncio.run(run())
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[1]["files"], [{"file_name": "a.pdf", "url": "https://example.test/a.pdf"}])

    def test_upload_link_can_arrive_after_creation(self):
        paths = []

        def handler(request: httpx.Request) -> httpx.Response:
            paths.append((request.method, request.url.path))
            if request.method == "POST":
                return httpx.Response(202, json={"task_id": "task-3", "files": [{"status": "waiting-file"}]})
            if request.method == "GET":
                return httpx.Response(200, json={"files": [{"status": "waiting-file",
                    "upload": {"url": "/upload-3", "headers": {}}}]})
            self.assertEqual(request.content, b"pdf")
            return httpx.Response(200)

        transport = httpx.MockTransport(handler)
        real_client = httpx.AsyncClient
        with patch("app.services.adapters.v41.httpx.AsyncClient",
                   side_effect=lambda *args, **kwargs: real_client(*args, transport=transport, **kwargs)), \
             patch("app.services.adapters.v41.asyncio.sleep", return_value=None):
            self.assertEqual(asyncio.run(V41Adapter("http://mineru.test").submit(b"pdf", "paper.pdf")), "task-3")
        self.assertEqual([method for method, _ in paths], ["POST", "GET", "PUT"])


if __name__ == "__main__":
    unittest.main()
