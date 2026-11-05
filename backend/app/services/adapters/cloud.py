import base64
import io
import json
import mimetypes
import os
import zipfile

import httpx

CLOUD_BASE = "https://mineru.net"


def _auth_headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


async def submit_batch(api_key: str, filename: str, model_version: str = "vlm",
                       is_ocr: bool = False, enable_table: bool = True,
                       enable_formula: bool = True) -> tuple[str, str]:
    """
    注册文件，获取 batch_id 和预签名上传 URL（POST /api/v4/file-urls/batch）。
    """
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{CLOUD_BASE}/api/v4/file-urls/batch",
            headers=_auth_headers(api_key),
            json={
                "files": [{"name": filename, "data_id": filename, "is_ocr": is_ocr}],
                "model_version": model_version,
                "enable_table": enable_table,
                "enable_formula": enable_formula,
            },
        )
        response.raise_for_status()
        data = response.json()

    debug_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "debug")
    os.makedirs(debug_dir, exist_ok=True)
    with open(os.path.join(debug_dir, f"cloud_submit_{filename}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    if data.get("code") != 0:
        raise RuntimeError(data.get("msg") or "在线 API 注册文件失败")

    batch_id = data["data"]["batch_id"]
    upload_url = data["data"]["file_urls"][0]
    return batch_id, upload_url


async def submit_url_batch(api_key: str, url: str, model_version: str = "vlm",
                           is_ocr: bool = False, enable_table: bool = True,
                           enable_formula: bool = True) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{CLOUD_BASE}/api/v4/extract/task/batch",
            headers=_auth_headers(api_key),
            json={"files": [{"url": url, "data_id": "web-url", "is_ocr": is_ocr}],
                  "model_version": model_version, "enable_table": enable_table,
                  "enable_formula": enable_formula},
        )
        response.raise_for_status()
        data = response.json()
    if data.get("code") != 0:
        raise RuntimeError(data.get("msg") or "在线 API 提交 URL 失败")
    return data["data"]["batch_id"]


async def upload_file_to_slot(upload_url: str, file_bytes: bytes) -> None:
    """
    PUT 文件直传到预签名 URL。
    实测确认：预签名地址的签名是在 Content-Type 为空的前提下算的，请求必须不带这个头，
    否则 OSS 返回 403 SignatureDoesNotMatch。用 content= 而不是 data=/files=，
    httpx 就不会自动补 Content-Type 头。
    """
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.put(upload_url, content=file_bytes)
        response.raise_for_status()


async def get_batch_status(api_key: str, batch_id: str) -> dict:
    """
    查询批次解析状态（GET /api/v4/extract-results/batch/{batch_id}）。
    返回 extract_result[0]，含 state/err_msg/full_zip_url。
    """
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{CLOUD_BASE}/api/v4/extract-results/batch/{batch_id}",
            headers=_auth_headers(api_key),
        )
        response.raise_for_status()
        data = response.json()

    if data.get("code") != 0:
        raise RuntimeError(data.get("msg") or "在线 API 查询结果失败")

    result = data.get("data", {}).get("extract_result") or []
    if not result:
        raise RuntimeError("在线 API 返回结果为空")
    return result[0]


def _image_data_uri(image_bytes: bytes, name: str) -> str:
    mime_type, _ = mimetypes.guess_type(name)
    mime_type = mime_type or "image/jpeg"
    encoded = base64.b64encode(image_bytes).decode()
    return f"data:{mime_type};base64,{encoded}"


async def fetch_and_parse_zip(full_zip_url: str) -> dict:
    """
    下载结果压缩包并解压。
    压缩包内容（实测确认）：full.md、<name>_content_list.json（旧版，本地组件复用的就是这个格式）、
    <name>_content_list_v2.json（新版嵌套结构，暂不用）、<name>_origin.pdf、<name>_model.json、
    layout.json、images/*。在线 API 不返回 middle_json，PDF/图片统一走 content_list 渲染。
    """
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.get(full_zip_url)
        response.raise_for_status()
        zip_bytes = response.content

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()

        md_content = ""
        if "full.md" in names:
            md_content = zf.read("full.md").decode("utf-8")

        content_list = []
        # 排除 _content_list_v2.json（v2 文件名以 _v2.json 结尾，不匹配这个后缀）
        content_list_names = [n for n in names if n.endswith("_content_list.json")]
        if content_list_names:
            content_list = json.loads(zf.read(content_list_names[0]).decode("utf-8"))

        image_names = [n for n in names if n.startswith("images/")]
        if image_names and isinstance(content_list, list):
            images = {
                os.path.basename(n): _image_data_uri(zf.read(n), n)
                for n in image_names
            }
            for block in content_list:
                img_path = block.get("img_path", "")
                basename = os.path.basename(img_path)
                if basename in images:
                    block["img_path"] = images[basename]

    return {
        "md_content": md_content,
        "content_list": content_list if isinstance(content_list, list) else [],
    }
