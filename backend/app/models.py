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
    mineru_task_id = Column(String, nullable=True)   # MinerU 异步任务 ID（/tasks 接口）
    cloud_batch_id = Column(String, nullable=True)   # 在线 API batch_id（mineru.net）
    engine = Column(String, nullable=True)           # local_v3 / local_v4 / local_v41 / cloud
    mode = Column(String, nullable=True)             # v3: sync / async
    structured_content = Column(Text, nullable=True) # v4 structured_content 原始数据
    source_url = Column(Text, nullable=True)          # URL 解析的原始地址
    parse_options = Column(Text, nullable=True)       # 本次解析选项 JSON
    error = Column(Text, nullable=True)
