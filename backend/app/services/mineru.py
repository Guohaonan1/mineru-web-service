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


async def parse_file(file_bytes: bytes, filename: str) -> dict:
    """
    返回 {"md_content": str, "content_list": list}
    图片文件额外请求 return_images，将 base64 数据回填到 content_list 的 img_path 字段。
    """
    is_image = _is_image(filename)

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
        # debug_dir = os.path.join(os.path.dirname(__file__), "..", "..", "debug")
        # os.makedirs(debug_dir, exist_ok=True)
        # debug_path = os.path.join(debug_dir, f"mineru_{filename}.json")
        # with open(debug_path, "w", encoding="utf-8") as f:
        #     json.dump(data, f, ensure_ascii=False, indent=2)
        # print(f"[mineru] raw response saved to {debug_path}")

        results = data.get("results", {})
        item = next(iter(results.values()), {}) if results else {}

        content_list = item.get("content_list", [])

        # MinerU 返回的 content_list 是 JSON 字符串，需要二次解析
        if isinstance(content_list, str):
            content_list = json.loads(content_list)

        if isinstance(content_list, list):
            # 用 base64 data URL 回填 img_path（PDF 提取图、图片文件均适用）
            images: dict = item.get("images", {}) or {}
            if images:
                for block in content_list:
                    img_path = block.get("img_path", "")
                    basename = os.path.basename(img_path)
                    if basename in images:
                        block["img_path"] = images[basename]

            # 类型优先级：aside_text 在最前，普通块按 Y 排，header/footer/page_number 在最后
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
