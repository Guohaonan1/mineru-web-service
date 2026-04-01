import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mineru.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db():
    from app.models import File  # noqa: F401
    Base.metadata.create_all(bind=engine)
    # 补齐新增列（SQLite 不支持 IF NOT EXISTS，捕获异常即可）
    with engine.connect() as conn:
        for col in ["middle_json TEXT"]:
            try:
                conn.execute(__import__("sqlalchemy").text(f"ALTER TABLE files ADD COLUMN {col}"))
                conn.commit()
            except Exception:
                pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
