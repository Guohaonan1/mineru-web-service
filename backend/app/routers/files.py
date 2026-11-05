import asyncio
import json
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import File as FileModel
from app.schemas import FileDetail, FileOut, UrlParseRequest
from app.services.mineru import check_health, fetch_task_result, get_task_status, parse_file, submit_task
from app.services.mineru_cloud import fetch_and_parse_zip, get_batch_status, submit_batch, submit_url_batch, upload_file_to_slot
from app.services.adapters import get_adapter
from app.services.v4_models import v4_model_setup
from app.services.storage import delete_file, get_presigned_url, upload_file

router = APIRouter()


async def run_parse(file_id: int, file_bytes: bytes, filename: str):
    db = SessionLocal()
    try:
        file = db.query(FileModel).filter(FileModel.id == file_id).first()
        if not file:
            return

        if not await check_health():
            raise RuntimeError("本地 MinerU 服务不可用，请检查服务是否已启动")

        file.status = "running"
        file.updated_at = datetime.now(timezone.utc)
        db.commit()

        parsed = await parse_file(file_bytes, filename)

        file.status = "done"
        file.result = parsed["md_content"]
        file.content_list = json.dumps(parsed["content_list"], ensure_ascii=False)
        if parsed.get("middle_json") is not None:
            file.middle_json = json.dumps(parsed["middle_json"], ensure_ascii=False)
        file.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        file.status = "failed"
        file.error = str(e)
        file.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


@router.post("/upload", response_model=FileOut)
async def upload_file_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    file_bytes = await file.read()

    suffix = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    object_name = f"{uuid.uuid4()}.{suffix}" if suffix else str(uuid.uuid4())

    upload_file(object_name, file_bytes, file.content_type or "application/octet-stream")

    db_file = FileModel(
        filename=file.filename,
        minio_path=object_name,
        content_type=file.content_type,
        engine="local_v3",
        mode="sync",
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    background_tasks.add_task(run_parse, db_file.id, file_bytes, file.filename)
    return db_file


@router.get("", response_model=list[FileOut])
def list_files(db: Session = Depends(get_db)):
    return db.query(FileModel).order_by(FileModel.created_at.desc()).all()


@router.get("/{file_id}/status")
def get_status(file_id: int, db: Session = Depends(get_db)):
    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    return {"id": file_id, "status": file.status}


@router.get("/{file_id}/result", response_model=FileDetail)
def get_result(file_id: int, db: Session = Depends(get_db)):
    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    return file


@router.get("/{file_id}/content_list")
def get_content_list(file_id: int, db: Session = Depends(get_db)):
    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    if not file.content_list:
        return []
    return json.loads(file.content_list)


@router.get("/{file_id}/middle_json")
def get_middle_json(file_id: int, db: Session = Depends(get_db)):
    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    if not file.middle_json:
        return None
    return json.loads(file.middle_json)


@router.get("/{file_id}/download_url")
def get_download_url(file_id: int, db: Session = Depends(get_db)):
    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file or not file.minio_path:
        raise HTTPException(status_code=404, detail="文件不存在")
    return {"url": get_presigned_url(file.minio_path)}


async def run_parse_async(file_id: int, file_bytes: bytes, filename: str):
    """
    异步解析流程：提交任务到 MinerU /tasks，轮询状态，完成后取结果存库。
    """
    db = SessionLocal()
    try:
        file = db.query(FileModel).filter(FileModel.id == file_id).first()
        if not file:
            return

        if not await check_health():
            raise RuntimeError("本地 MinerU 服务不可用，请检查服务是否已启动")

        # 提交任务
        task_id = await submit_task(file_bytes, filename)
        file.mineru_task_id = task_id
        file.status = "running"
        file.updated_at = datetime.now(timezone.utc)
        db.commit()

        # 轮询 MinerU 任务状态
        while True:
            status_data = await get_task_status(task_id)
            status = status_data.get("status", "")
            if status == "completed":
                break
            if status == "failed":
                raise RuntimeError(status_data.get("error") or "MinerU task failed")
            await asyncio.sleep(3)

        # 获取并存储结果
        parsed = await fetch_task_result(task_id, filename)
        file.status = "done"
        file.result = parsed["md_content"]
        file.content_list = json.dumps(parsed["content_list"], ensure_ascii=False)
        if parsed.get("middle_json") is not None:
            file.middle_json = json.dumps(parsed["middle_json"], ensure_ascii=False)
        file.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        file.status = "failed"
        file.error = str(e)
        file.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


@router.post("/upload_async", response_model=FileOut)
async def upload_file_async_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """使用 MinerU 异步任务接口（POST /tasks）解析文件，立即返回，后台轮询结果。"""
    file_bytes = await file.read()

    suffix = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    object_name = f"{uuid.uuid4()}.{suffix}" if suffix else str(uuid.uuid4())

    upload_file(object_name, file_bytes, file.content_type or "application/octet-stream")

    db_file = FileModel(
        filename=file.filename,
        minio_path=object_name,
        content_type=file.content_type,
        engine="local_v3",
        mode="async",
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    background_tasks.add_task(run_parse_async, db_file.id, file_bytes, file.filename)
    return db_file


async def run_parse_cloud(file_id: int, file_bytes: bytes | None, filename: str, api_key: str,
                          options: dict, source_url: str | None = None):
    """
    在线 API 解析流程：注册批次、上传文件到预签名地址、轮询状态，完成后下载结果压缩包存库。
    """
    db = SessionLocal()
    try:
        file = db.query(FileModel).filter(FileModel.id == file_id).first()
        if not file:
            return

        if source_url:
            batch_id = await submit_url_batch(api_key, source_url, **options)
            upload_url = None
        else:
            batch_id, upload_url = await submit_batch(api_key, filename, **options)
        file.cloud_batch_id = batch_id
        file.status = "running"
        file.updated_at = datetime.now(timezone.utc)
        db.commit()

        if upload_url and file_bytes is not None:
            await upload_file_to_slot(upload_url, file_bytes)

        # 3s 间隔轮询，约 10 分钟超时（打的是外部网络，比本地异步流程多加一层超时保护）
        item = None
        for _ in range(200):
            item = await get_batch_status(api_key, batch_id)
            state = item.get("state")
            if state == "done":
                break
            if state == "failed":
                raise RuntimeError(item.get("err_msg") or "在线解析失败")
            await asyncio.sleep(3)
        else:
            raise RuntimeError("轮询超时，请稍后重试")

        parsed = await fetch_and_parse_zip(item["full_zip_url"])
        file.status = "done"
        file.result = parsed["md_content"]
        file.content_list = json.dumps(parsed["content_list"], ensure_ascii=False)
        file.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        file.status = "failed"
        file.error = str(e)
        file.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


@router.post("/upload_cloud", response_model=FileOut)
async def upload_file_cloud_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    api_key: str = Form(...),
    model_version: str = Form("vlm"),
    is_ocr: bool = Form(False),
    enable_table: bool = Form(True),
    enable_formula: bool = Form(True),
    db: Session = Depends(get_db),
):
    """使用 MinerU 在线 API（mineru.net）解析文件，立即返回，后台轮询结果。"""
    file_bytes = await file.read()
    if model_version not in {"pipeline", "vlm"}:
        raise HTTPException(status_code=422, detail="不支持的在线模型")
    options = {"model_version": model_version, "is_ocr": is_ocr,
               "enable_table": enable_table, "enable_formula": enable_formula}

    suffix = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    object_name = f"{uuid.uuid4()}.{suffix}" if suffix else str(uuid.uuid4())

    upload_file(object_name, file_bytes, file.content_type or "application/octet-stream")

    db_file = FileModel(
        filename=file.filename,
        minio_path=object_name,
        content_type=file.content_type,
        engine="cloud",
        parse_options=json.dumps(options),
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    background_tasks.add_task(run_parse_cloud, db_file.id, file_bytes, file.filename, api_key, options)
    return db_file


async def run_parse_v4(file_id: int, file_bytes: bytes | None, filename: str,
                       options: dict, source_url: str | None = None, engine: str = "local_v4"):
    """Submit one versioned local task and retain its structured result."""
    db = SessionLocal()
    adapter = get_adapter(engine)
    file = None
    try:
        file = db.query(FileModel).filter(FileModel.id == file_id).first()
        if not file:
            return
        task_id = (await adapter.submit_url(source_url, filename, **options) if source_url and engine == "local_v41"
                   else await adapter.submit_url(source_url, **options) if source_url
                   else await adapter.submit(file_bytes, filename, **options))
        file.mineru_task_id = task_id
        file.status = "running"
        file.updated_at = datetime.now(timezone.utc)
        db.commit()

        # 模型应在启动 MinerU 前单独下载并验证；这里只等待解析任务。
        for _ in range(200):
            state = await adapter.status(task_id)
            if state.get("status") == "completed":
                break
            if state.get("status") in {"partial", "failed", "canceled"}:
                details = (state.get("files") or [{}])[0].get("error") or state.get("error")
                raise RuntimeError(f"MinerU {engine} 任务状态: {state['status']}: {details or ''}")
            await asyncio.sleep(3)
        else:
            raise RuntimeError("MinerU v4 任务轮询超时")

        parsed = (await adapter.result(task_id, filename, state)
                  if engine == "local_v41" else await adapter.result(task_id, filename))
        file.result = parsed["md_content"]
        if parsed["middle_json"] is not None:
            file.middle_json = json.dumps(parsed["middle_json"], ensure_ascii=False)
        if parsed["structured_content"] is not None:
            file.structured_content = json.dumps(parsed["structured_content"], ensure_ascii=False)
        file.status = "done"
        file.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        if file:
            file.status = "failed"
            file.error = str(exc)
            file.updated_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


@router.post("/upload_v4", response_model=FileOut)
async def upload_file_v4_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tier: str = Form("standard"),
    ocr_mode: str = Form("auto"),
    db: Session = Depends(get_db),
):
    if tier not in {"flash", "basic", "standard", "advanced"} or ocr_mode not in {"auto", "txt", "ocr"}:
        raise HTTPException(status_code=422, detail="不支持的本地 v4 解析选项")
    if not (await v4_model_setup.status())["ready"]:
        raise HTTPException(status_code=503, detail="本地 v4 模型尚未准备好，请先在上传页下载并验证模型")
    if not (await get_adapter("local_v4").health())["ok"]:
        raise HTTPException(status_code=503, detail="MinerU v4 服务不可用或不支持所需输出格式")
    file_bytes = await file.read()
    options = {"tier": tier, "ocr_mode": ocr_mode}
    suffix = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    object_name = f"{uuid.uuid4()}.{suffix}" if suffix else str(uuid.uuid4())
    upload_file(object_name, file_bytes, file.content_type or "application/octet-stream")
    db_file = FileModel(
        filename=file.filename,
        minio_path=object_name,
        content_type=file.content_type,
        engine="local_v4",
        mode="async",
        parse_options=json.dumps(options),
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    background_tasks.add_task(run_parse_v4, db_file.id, file_bytes, file.filename, options)
    return db_file


@router.post("/upload_v41", response_model=FileOut)
async def upload_file_v41_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tier: str = Form("standard"),
    ocr_mode: str = Form("auto"),
    db: Session = Depends(get_db),
):
    if tier not in {"flash", "basic", "standard", "advanced"} or ocr_mode not in {"auto", "txt", "ocr"}:
        raise HTTPException(status_code=422, detail="不支持的本地 4.1 解析选项")
    if not (await v4_model_setup.status())["ready"]:
        raise HTTPException(status_code=503, detail="本地 4.1 模型尚未准备好，请先下载并验证模型")
    if not (await get_adapter("local_v41").health())["ok"]:
        raise HTTPException(status_code=503, detail="MinerU 4.1 服务不可用或不支持 Tasks 默认输出")
    file_bytes = await file.read()
    options = {"tier": tier, "ocr_mode": ocr_mode}
    suffix = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    object_name = f"{uuid.uuid4()}.{suffix}" if suffix else str(uuid.uuid4())
    upload_file(object_name, file_bytes, file.content_type or "application/octet-stream")
    db_file = FileModel(
        filename=file.filename, minio_path=object_name, content_type=file.content_type,
        engine="local_v41", mode="async", parse_options=json.dumps(options),
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    background_tasks.add_task(run_parse_v4, db_file.id, file_bytes, file.filename, options, None, "local_v41")
    return db_file


@router.post("/parse_url", response_model=FileOut)
async def parse_url_endpoint(request: UrlParseRequest, background_tasks: BackgroundTasks,
                             db: Session = Depends(get_db)):
    parsed = urlparse(request.url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=422, detail="请输入有效的 HTTPS URL")
    if request.engine == "cloud" and not request.api_key:
        raise HTTPException(status_code=422, detail="请填写在线 API Key")
    if request.engine in {"local_v4", "local_v41"}:
        if request.kind != "web" and not (await v4_model_setup.status())["ready"]:
            raise HTTPException(status_code=503, detail="本地 v4 模型尚未准备好")
        if not (await get_adapter(request.engine).health())["ok"]:
            raise HTTPException(status_code=503, detail="MinerU v4 服务不可用")
    filename = parsed.path.rstrip("/").rsplit("/", 1)[-1] or parsed.hostname
    if request.kind == "web" and not filename.lower().endswith((".html", ".htm", ".mhtml")):
        filename += ".html"
    if request.kind == "document" and filename.lower().endswith((".html", ".htm", ".mhtml")):
        raise HTTPException(status_code=422, detail="网页地址请选择网页解析")
    options = ({"tier": "flash", "ocr_mode": "auto"} if request.kind == "web"
               else {"tier": request.tier, "ocr_mode": request.ocr_mode}) if request.engine in {"local_v4", "local_v41"} else {
                   "model_version": "MinerU-HTML" if request.kind == "web" else request.model_version,
                   "is_ocr": request.is_ocr if request.kind == "document" else False,
                   "enable_table": request.enable_table,
                   "enable_formula": request.enable_formula,
               }
    db_file = FileModel(filename=filename, source_url=request.url,
                        content_type="text/html" if request.kind == "web" else None,
                        engine=request.engine, mode="async" if request.engine in {"local_v4", "local_v41"} else None,
                        parse_options=json.dumps(options))
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    if request.engine in {"local_v4", "local_v41"}:
        background_tasks.add_task(run_parse_v4, db_file.id, None, filename, options, request.url, request.engine)
    else:
        background_tasks.add_task(run_parse_cloud, db_file.id, None, filename,
                                  request.api_key, options, request.url)
    return db_file


@router.get("/{file_id}/structured_content")
def get_structured_content(file_id: int, db: Session = Depends(get_db)):
    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    return json.loads(file.structured_content) if file.structured_content else None


@router.get("/{file_id}/mineru_status")
async def get_mineru_task_status(file_id: int, db: Session = Depends(get_db)):
    """查询 MinerU 异步任务的原始状态（直接透传 MinerU /tasks/{task_id} 响应）。"""
    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    if not file.mineru_task_id:
        raise HTTPException(status_code=400, detail="该文件未使用异步任务接口提交")
    return await get_adapter(file.engine or "local_v3").status(file.mineru_task_id)


@router.delete("/{file_id}")
def delete_file_endpoint(file_id: int, db: Session = Depends(get_db)):
    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    if file.minio_path:
        delete_file(file.minio_path)
    db.delete(file)
    db.commit()
    return {"msg": "删除成功"}
