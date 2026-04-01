import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import File as FileModel
from app.schemas import FileDetail, FileOut
from app.services.mineru import parse_file
from app.services.storage import delete_file, get_presigned_url, upload_file

router = APIRouter()


async def run_parse(file_id: int, file_bytes: bytes, filename: str):
    db = SessionLocal()
    try:
        file = db.query(FileModel).filter(FileModel.id == file_id).first()
        if not file:
            return

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
