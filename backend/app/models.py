from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Text
from app.database import Base


class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    minio_path = Column(String, nullable=True)       # MinIO 中的 object name
    content_type = Column(String, nullable=True)
    status = Column(String, default="pending")       # pending / running / done / failed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    result = Column(Text, nullable=True)             # 解析后的 Markdown
    content_list = Column(Text, nullable=True)       # JSON 格式的块级内容（含 bbox）
    middle_json  = Column(Text, nullable=True)       # MinerU middle_json 原始布局数据
    error = Column(Text, nullable=True)
