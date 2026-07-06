import asyncio
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import File as FileModel
from app.schemas import FileDetail, FileOut
from app.services.mineru import check_health, fetch_task_result, get_task_status, parse_file, submit_task
from app.services.mineru_cloud import fetch_and_parse_zip, get_batch_status, submit_batch, upload_file_to_slot
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
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    background_tasks.add_task(run_parse_async, db_file.id, file_bytes, file.filename)
    return db_file


async def run_parse_cloud(file_id: int, file_bytes: bytes, filename: str, api_key: str):
    """
    在线 API 解析流程：注册批次、上传文件到预签名地址、轮询状态，完成后下载结果压缩包存库。
    """
    db = SessionLocal()
    try:
        file = db.query(FileModel).filter(FileModel.id == file_id).first()
        if not file:
            return

        batch_id, upload_url = await submit_batch(api_key, filename)
        file.cloud_batch_id = batch_id
        file.status = "running"
        file.updated_at = datetime.now(timezone.utc)
        db.commit()

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
    db: Session = Depends(get_db),
):
    """使用 MinerU 在线 API（mineru.net）解析文件，立即返回，后台轮询结果。"""
    file_bytes = await file.read()

    suffix = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    object_name = f"{uuid.uuid4()}.{suffix}" if suffix else str(uuid.uuid4())

    upload_file(object_name, file_bytes, file.content_type or "application/octet-stream")

    db_file = FileModel(
        filename=file.filename,
        minio_path=object_name,
        content_type=file.content_type,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    background_tasks.add_task(run_parse_cloud, db_file.id, file_bytes, file.filename, api_key)
    return db_file


@router.get("/{file_id}/mineru_status")
async def get_mineru_task_status(file_id: int, db: Session = Depends(get_db)):
    """查询 MinerU 异步任务的原始状态（直接透传 MinerU /tasks/{task_id} 响应）。"""
    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    if not file.mineru_task_id:
        raise HTTPException(status_code=400, detail="该文件未使用异步任务接口提交")
    return await get_task_status(file.mineru_task_id)


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
