from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db():
    from app.models import File  # noqa: F401
    Base.metadata.create_all(bind=engine)
    # 补齐新增列（SQLite 不支持 IF NOT EXISTS，捕获异常即可）
    with engine.connect() as conn:
        for col in ["middle_json TEXT", "mineru_task_id TEXT", "cloud_batch_id TEXT", "engine TEXT", "mode TEXT", "structured_content TEXT", "source_url TEXT", "parse_options TEXT"]:
            try:
                conn.execute(__import__("sqlalchemy").text(f"ALTER TABLE files ADD COLUMN {col}"))
                conn.commit()
            except Exception:
                pass
        # 旧结果保持原样，仅为历史记录标注来源与调用方式。
        conn.execute(__import__("sqlalchemy").text("""
            UPDATE files SET engine = CASE
                WHEN cloud_batch_id IS NOT NULL THEN 'cloud' ELSE 'local_v3' END
            WHERE engine IS NULL
        """))
        conn.execute(__import__("sqlalchemy").text("""
            UPDATE files SET mode = CASE
                WHEN engine = 'local_v3' AND mineru_task_id IS NOT NULL THEN 'async'
                WHEN engine = 'local_v3' THEN 'sync' ELSE NULL END
            WHERE mode IS NULL
        """))
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
