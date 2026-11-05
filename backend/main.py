import asyncio

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import files
from app.services.storage import check_health as check_minio_health
from app.services.adapters import get_adapter
from app.services.v4_models import v4_model_setup
import ipaddress

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
    v3_health, v4_health, v41_health, minio_ok = await asyncio.gather(
        get_adapter("local_v3").health(),
        get_adapter("local_v4").health(),
        get_adapter("local_v41").health(),
        asyncio.to_thread(check_minio_health),
    )
    return {"mineru": v3_health["ok"] or v4_health["ok"] or v41_health["ok"],
            "local_v3": v3_health, "local_v4": v4_health,
            "local_v41": v41_health, "minio": minio_ok}


app.include_router(files.router, prefix="/files", tags=["files"])


@app.get("/models/v4")
async def get_v4_models():
    return await v4_model_setup.status()


@app.post("/models/v4/download", status_code=202)
async def download_v4_models(request: Request):
    try:
        local = request.client is not None and ipaddress.ip_address(request.client.host).is_loopback
    except ValueError:
        local = False
    if not local:
        raise HTTPException(status_code=403, detail="仅允许从本机触发模型下载")
    return await v4_model_setup.start()
