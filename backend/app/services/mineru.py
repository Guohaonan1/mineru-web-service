import json
import os
import httpx

from app.config import settings

MINERU_URL = settings.mineru_url

_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff", ".tif", ".gif"}


def _backfill_middle_json_images(middle_json: dict, images: dict) -> None:
    for page in middle_json.get("pdf_info", []):
        for block in page.get("para_blocks", []) + page.get("discarded_blocks", []):
            _backfill_block(block, images)


def _backfill_block(block: dict, images: dict) -> None:
    for sub in block.get("blocks", []):
        _backfill_block(sub, images)
    for line in block.get("lines", []):
        for span in line.get("spans", []):
            path = span.get("image_path", "")
            if path:
                basename = os.path.basename(path)
                if basename in images:
                    span["image_path"] = images[basename]


def _is_image(filename: str) -> bool:
    ext = os.path.splitext(filename)[-1].lower()
    return ext in _IMAGE_SUFFIXES


async def submit_task(file_bytes: bytes, filename: str) -> str:
    """
    提交异步解析任务（POST /tasks），立即返回 MinerU task_id。
    """
    form_data = {"return_content_list": "1", "return_middle_json": "1", "return_images": "1"}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{MINERU_URL}/tasks",
            files={"files": (filename, file_bytes)},
            data=form_data,
        )
        response.raise_for_status()
        data = response.json()

    debug_dir = os.path.join(os.path.dirname(__file__), "..", "..", "debug")
    os.makedirs(debug_dir, exist_ok=True)
    with open(os.path.join(debug_dir, f"task_submit_{data['task_id']}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return data["task_id"]


async def get_task_status(task_id: str) -> dict:
    """
    查询异步任务状态（GET /tasks/{task_id}）。
    返回原始状态载荷，status 字段为 pending / processing / completed / failed。
    """
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{MINERU_URL}/tasks/{task_id}")
        response.raise_for_status()
        return response.json()


async def fetch_task_result(task_id: str, filename: str) -> dict:
    """
    获取已完成任务的解析结果（GET /tasks/{task_id}/result）。
    返回格式与 parse_file 一致：{"md_content", "content_list", "middle_json"}。
    """
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(f"{MINERU_URL}/tasks/{task_id}/result")
        response.raise_for_status()
        data = response.json()

    debug_dir = os.path.join(os.path.dirname(__file__), "..", "..", "debug")
    os.makedirs(debug_dir, exist_ok=True)
    debug_path = os.path.join(debug_dir, f"mineru_task_{task_id}.json")
    with open(debug_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return _process_result(data, filename)


def _process_result(data: dict, filename: str) -> dict:
    """
    将 MinerU 响应（/file_parse 或 /tasks/{id}/result）统一处理为
    {"md_content", "content_list", "middle_json"}。
    """
    results = data.get("results", {})
    item = next(iter(results.values()), {}) if results else {}

    content_list = item.get("content_list", [])
    if isinstance(content_list, str):
        content_list = json.loads(content_list)

    images: dict = item.get("images", {}) or {}

    if isinstance(content_list, list):
        if images:
            for block in content_list:
                img_path = block.get("img_path", "")
                basename = os.path.basename(img_path)
                if basename in images:
                    block["img_path"] = images[basename]

        _TYPE_ORDER = {"aside_text": -2, "header": -1, "footer": 1000, "page_number": 1001}
        content_list.sort(key=lambda b: (
            b.get("page_idx", 0),
            _TYPE_ORDER.get(b.get("type", ""), 0),
            b.get("bbox", [0, 0])[1],
        ))

    middle_json = item.get("middle_json", None)
    if isinstance(middle_json, str):
        try:
            middle_json = json.loads(middle_json)
        except Exception:
            middle_json = None

    if isinstance(middle_json, dict) and images:
        _backfill_middle_json_images(middle_json, images)

    return {
        "md_content": item.get("md_content", ""),
        "content_list": content_list if isinstance(content_list, list) else [],
        "middle_json": middle_json,
    }


async def parse_file(file_bytes: bytes, filename: str) -> dict:
    """
    同步解析（POST /file_parse），阻塞等待 MinerU 返回结果。
    """
    form_data: dict = {"return_content_list": "1", "return_middle_json": "1", "return_images": "1"}

    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(
            f"{MINERU_URL}/file_parse",
            files={"files": (filename, file_bytes)},
            data=form_data,
        )
        response.raise_for_status()
        data = response.json()

    # 调试用：将 MinerU 原始响应落盘到 backend/debug/，方便排查解析问题
    # 生产环境请注释此段，避免磁盘写入和敏感数据落盘
    debug_dir = os.path.join(os.path.dirname(__file__), "..", "..", "debug")
    os.makedirs(debug_dir, exist_ok=True)
    debug_path = os.path.join(debug_dir, f"mineru_{filename}.json")
    with open(debug_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[mineru] raw response saved to {debug_path}")

    return _process_result(data, filename)
