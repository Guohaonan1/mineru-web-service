from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from typing import Literal


class FileOut(BaseModel):
    id: int
    filename: str
    minio_path: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    engine: Optional[str] = None
    mode: Optional[str] = None

    model_config = {"from_attributes": True}


class FileDetail(BaseModel):
    id: int
    filename: str
    minio_path: Optional[str] = None
    content_type: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    result: Optional[str] = None
    mineru_task_id: Optional[str] = None
    error: Optional[str] = None
    engine: Optional[str] = None
    mode: Optional[str] = None
    source_url: Optional[str] = None
    parse_options: Optional[str] = None

    model_config = {"from_attributes": True}


class UrlParseRequest(BaseModel):
    url: str
    kind: Literal["document", "web"] = "document"
    engine: Literal["local_v4", "local_v41", "cloud"]
    api_key: Optional[str] = None
    tier: Literal["flash", "basic", "standard", "advanced"] = "standard"
    ocr_mode: Literal["auto", "txt", "ocr"] = "auto"
    model_version: Literal["pipeline", "vlm"] = "vlm"
    is_ocr: bool = False
    enable_table: bool = True
    enable_formula: bool = True
