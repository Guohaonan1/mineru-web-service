import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import files
from app.services.mineru import check_health as check_mineru_health
from app.services.storage import check_health as check_minio_health

app = FastAPI(title="MinerU Web Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/status")
async def get_status():
    """探活本地 MinerU 服务和 MinIO，供前端展示服务状态。"""
    mineru_ok, minio_ok = await asyncio.gather(
        check_mineru_health(),
        asyncio.to_thread(check_minio_health),
    )
    return {"mineru": mineru_ok, "minio": minio_ok}


app.include_router(files.router, prefix="/files", tags=["files"])
