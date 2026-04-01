# Backend

基于 FastAPI 的轻量后端，负责任务管理和元数据存储，解析能力由本地 MinerU 服务（`POST /file_parse`）提供。

## 技术栈

- Python 3.11+
- FastAPI
- SQLAlchemy + SQLite
- uv（包管理）

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI 入口
│   ├── database.py      # SQLite 连接
│   ├── models.py        # 数据库模型
│   ├── schemas.py       # Pydantic 模型
│   ├── routers/
│   │   ├── files.py     # 文件相关路由
│   └── services/
│       └── mineru.py    # 调用 MinerU /file_parse
├── pyproject.toml
└── README.md
```

## 初始化步骤

### 1. 安装 uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. 创建项目

```bash
cd backend
uv init --no-workspace
uv python pin 3.11
```

### 3. 添加依赖

```bash
uv add fastapi uvicorn[standard] sqlalchemy aiofiles python-multipart httpx
```

### 4. 启动开发服务

```bash
fastapi dev main.py
```

> MinerU 服务默认跑在 18000 端口，FastAPI dev 默认用 8000，注意本地启动时调整端口避免冲突。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MINERU_URL` | `http://localhost:18000` | 本地 MinerU 服务地址 |
| `DATABASE_URL` | `sqlite:///./mineru.db` | SQLite 路径 |

## API 路由（规划）

```
POST   /files/upload        接收文件，投入后台解析任务
GET    /files               文件列表
GET    /files/{id}/status   轮询任务状态（pending / running / done / failed）
GET    /files/{id}/result   获取解析结果（Markdown）
DELETE /files/{id}          删除记录
```
