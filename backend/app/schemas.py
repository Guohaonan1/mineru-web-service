from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class FileOut(BaseModel):
    id: int
    filename: str
    minio_path: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

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

    model_config = {"from_attributes": True}
