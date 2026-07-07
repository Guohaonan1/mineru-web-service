# MinerU Web Service

基于 [MinerU](https://github.com/opendatalab/MinerU) 的文档智能解析平台。React 前端 + 轻量 FastAPI 后端，支持本地 MinerU 服务和 mineru.net 官方在线 API 两种解析来源，自建后端只做元数据存储、文件代理与结果落库。

最终效果图：
![效果示意](web.png)

## 功能

- 三种解析方式可选：**本地异步**（最新，`POST /tasks` 轮询）、**本地同步**（兼容 MinerU 2.7.6，`POST /file_parse`）、**在线 API**（mineru.net 官方云服务，无需本地部署 MinerU）
- 左右双栏界面：左侧原文渲染（PDF / 图片）+ bbox 框选高亮，右侧解析内容
- PDF 与图片均支持基于 `middle_json` 的精确 bbox 对齐（原生像素坐标）；没有 `middle_json` 时（如在线 API 解析结果）自动回退到 `content_list`（归一化坐标）
- 支持文本、标题、列表、公式、表格、图片、图表（chart）等内容块的差异化渲染
- 每个文本 block 走真正的 markdown 渲染（加粗/斜体/行内代码/裸链接自动转 `<a>` 等），公式（行内 `$...$` 与块级 `$$...$$`，含表格内公式）用 KaTeX 排版，跟 mineru.net 官网的渲染方式对齐
- 图片 / 图表按 `bbox` 相对页面宽度的实际比例动态显示大小，不是固定尺寸
- 页眉、页脚、旁注等边缘内容可隐藏/显示
- 解析结果支持一键下载（Markdown / JSON）
- JSON 原始数据查看器（CodeMirror 6）
- 顶部实时显示本地 MinerU / MinIO 服务健康状态

## 架构

```
用户浏览器
    │
    ▼
React 前端（开发：port 5173 / 生产：port 80）
    │  /api/* → 反向代理
    ▼
FastAPI 后端（port 8000）
    ├── SQLite（文件元数据 + 解析结果缓存）
    ├── MinIO（原文件对象存储，生成预签名 URL 供前端预览）
    ├── GET /status（探活 MinerU + MinIO，供前端顶部状态指示器轮询）
    │
    ├── 本地解析 → HTTP 调用 MinerU 本地服务（port 18000，直连，不走系统代理）
    │    ├── POST /file_parse        同步解析（阻塞等待结果）
    │    ├── POST /tasks             异步提交任务（立即返回 task_id）
    │    ├── GET  /tasks/{task_id}   查询任务状态
    │    ├── GET  /health            健康检查
    │    └── GET  /docs              Swagger 文档
    │
    └── 在线解析 → HTTP 调用 mineru.net 官方云端 API
         ├── POST /api/v4/file-urls/batch              注册批次，拿预签名上传地址
         ├── PUT  <预签名地址>                          上传原文件（阿里云 OSS）
         ├── GET  /api/v4/extract-results/batch/{id}    轮询解析状态
         └── <full_zip_url>                             下载结果压缩包，后端解压入库
```

**存储职责：**

| 存储 | 存什么 | 用途 |
|------|--------|------|
| **MinIO** | 用户上传的原始文件（PDF / 图片） | 生成预签名 URL，供前端左侧 `react-pdf` / `<img>` 渲染原文件（三种解析方式共用） |
| **SQLite** | 文件元数据（filename、status、created_at、mineru_task_id、cloud_batch_id 等） | 文件列表、历史记录、任务状态轮询 |
| **SQLite** | 解析结果（`md_content`、`content_list`、`middle_json`，序列化为 TEXT） | 避免重复调用 MinerU / mineru.net，前端直接从后端取缓存 |

**后端职责极简：**

| 职责 | MinerU / mineru.net 承担 | 自建后端承担 |
|------|------------|------------|
| 文件解析（版面分析、OCR、公式、表格） | ✅ | 转发请求 |
| 任务队列 / 轮询 | ✅ | 转发轮询 |
| 解析结果（md / content_list / middle_json） | ✅ | 缓存到 SQLite |
| 在线 API 结果压缩包解压 | ❌ | ✅ 后端内存解压（`zipfile`），图片转 base64 内嵌 |
| 原文件存储 + 预览 URL | ❌ | ✅ MinIO |
| 文件列表 / 历史记录 | ❌ | ✅ SQLite |

> **本地服务防坑提示**：如果本机配置了系统代理（如 Clash 等科学上网工具），Python 的 `httpx` 默认会读取系统代理设置，把原本该直连 `localhost:18000` 的请求也转发出去，代理处理不了"目标是本机自己"的请求会返回 `502 Bad Gateway`。本项目已在 `backend/app/services/mineru.py` 里对所有访问本地 MinerU 的请求加了 `trust_env=False` 保证直连；访问 mineru.net 的请求（`mineru_cloud.py`）保持默认，因为那是真实外网地址，可能需要代理才能访问。

**三种解析方式对比：**

| 模式 | 前端标签 | 接口 | 说明 |
|------|---------|------|------|
| 本地异步 | 最新版 | `POST /tasks` + 轮询 | 立即返回 task_id，后台轮询直到完成，推荐 |
| 本地同步 | 兼容 2.7.6 | `POST /file_parse` | 阻塞等待 MinerU 返回完整结果，兼容没有 `/tasks` 接口的旧版 MinerU |
| 在线 API | 在线 API | mineru.net 官方云服务 | 需要用户自备 mineru.net API Key（存前端 localStorage，不落后端库），无需本地部署 MinerU；解析结果没有 `middle_json`，查看器自动用 V1（`content_list`）渲染 |

前端上传页可自由切换，三套流程分别对应 `/files/upload_async`、`/files/upload`、`/files/upload_cloud`，解析完成后的查看体验完全一致。

内容渲染细节（markdown / 公式 / 表格 / chart / 图片宽度）见 [`frontend/README.md`](frontend/README.md#内容渲染)。

## 环境依赖


| 依赖      | 版本    | 说明                 |
| ------- | ----- | ------------------ |
| Python  | 3.13+ | 后端运行环境             |
| uv      | 最新    | Python 包管理         |
| Node.js | 18+   | 前端构建               |
| pnpm    | 最新    | 前端包管理              |
| MinIO   | —     | 原文件对象存储            |
| MinerU  | —     | 本地解析服务（可选，仅"本地异步/本地同步"两种模式需要，port 18000） |


## 快速启动

### 1. 启动 MinerU 本地服务

如果只使用"在线 API"模式解析，可跳过这一步，直接准备好 mineru.net 的 API Key。

参考 [MinerU 官方文档](https://opendatalab.github.io/MinerU/zh/quick_start/docker_deployment/) 启动解析服务，确保 `http://localhost:18000/docs` 可访问。

```bash
# Docker 方式（推荐）
docker compose -f compose.yaml --profile api up -d

# 或源码方式
mineru-api
```

### 2. 启动 MinIO

```bash
docker run -d -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"
```

### 3. 启动后端

安装 uv（如未安装）：

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# 或通过 pip
pip install uv
```

```bash
cd backend

# 复制并编辑配置文件（所有配置项均在此文件中）
cp .env.example .env
# 按需修改 .env

# 安装依赖（自动创建虚拟环境）
uv sync

# 激活虚拟环境
source .venv/bin/activate  # macOS / Linux
# .venv\Scripts\activate   # Windows

# 启动（开发模式，支持热重载）
uv run fastapi dev main.py
```

配置项说明见 `backend/.env.example`，由 `app/config.py` 统一加载。优先级从高到低：**环境变量 > `.env` 文件 > `config.py` 默认值**。

**调试模式：** `app/services/mineru.py` 中有一段被注释的调试代码，启用后会将 MinerU 的原始响应完整写入 `backend/debug/` 目录（JSON 格式），便于排查解析问题。使用时取消注释即可，生产环境保持注释状态。

后端 API 文档：`http://localhost:8000/docs`

启动后可访问 `http://localhost:8000/status` 确认 MinerU / MinIO 是否都探活成功（前端右上角状态指示器数据来源就是这个接口）。

### 4. 启动前端

```bash
cd frontend

# 安装依赖
pnpm install

# 开发模式启动（自动代理 /api 到 localhost:8000）
pnpm run dev
```

访问：`http://localhost:5173`

如果选择"在线 API"解析方式，需要在上传页填入 mineru.net 的 API Key（会自动保存到浏览器 localStorage，不会发送到除 mineru.net 以外的第三方）。

> **离线 / 内网环境**：前端 PDF 预览默认从 `unpkg.com` 加载 PDF.js worker。若无法访问外网，可改为本地加载：
>
> ```bash
> # 将 worker 文件复制到 public/
> cp node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
> ```
>
> 然后在 `src/components/PDFViewer.tsx` 和 `src/components/PDFViewerV2.tsx` 中，注释掉 CDN 那行，取消注释本地那行（文件内已有说明）。

## 项目结构

```
mineru-web-service/
├── backend/
│   ├── main.py                    # FastAPI 入口，CORS 配置，GET /status 健康检查
│   ├── pyproject.toml             # 依赖声明（uv）
│   ├── .env.example               # 配置模板（复制为 .env 后修改）
│   └── app/
│       ├── config.py              # 集中配置（pydantic-settings，读取 .env）
│       ├── database.py            # SQLite 连接与初始化
│       ├── models.py              # SQLAlchemy ORM 模型
│       ├── schemas.py             # Pydantic 请求/响应模型
│       ├── routers/
│       │   └── files.py           # 文件上传、查询、解析结果接口（本地/在线三种模式）
│       └── services/
│           ├── mineru.py          # 本地 MinerU API 调用（含图片 base64 回填、健康检查）
│           ├── mineru_cloud.py    # 在线 API（mineru.net）调用：注册批次/上传/轮询/结果解压
│           └── storage.py         # MinIO 文件存储 + 健康检查
│
├── frontend/
│   ├── vite.config.ts             # Vite 配置（/api 反向代理）
│   ├── src/
│   │   ├── types.ts               # TypeScript 类型定义
│   │   ├── api/
│   │   │   ├── index.ts           # 后端 API 封装
│   │   │   └── cloud.ts           # 在线 API Key 的本地存储读写
│   │   ├── utils/
│   │   │   ├── parseMiddleJson.ts      # middle_json → ParsedBlock[] 解析器（含 chart 映射、公式 $ 包裹）
│   │   │   └── renderTableEquations.ts # 表格 HTML 里的 <eq> 标签替换成 KaTeX 渲染结果
│   │   ├── pages/
│   │   │   ├── HomePage.tsx       # 文件上传（三种解析方式选择）
│   │   │   ├── TaskListPage.tsx   # 历史记录列表
│   │   │   └── TaskDetailPage.tsx # 解析结果双栏查看器
│   │   └── components/
│   │       ├── PDFViewerV2.tsx    # PDF 渲染 + bbox 高亮（middle_json，原生坐标）
│   │       ├── PDFViewer.tsx      # PDF 渲染 + bbox 高亮（content_list，归一化坐标）
│   │       ├── ContentViewerV2.tsx# 内容块渲染（middle_json）
│   │       ├── ContentViewer.tsx  # 内容块渲染（content_list）
│   │       ├── ImageViewerV2.tsx  # 图片查看器 + bbox 高亮（middle_json，原生坐标）
│   │       ├── ImageViewer.tsx    # 图片查看器 + bbox 高亮（content_list，归一化坐标）
│   │       ├── Markdown.tsx       # 行内 markdown + 公式渲染（react-markdown/remark-math/rehype-katex）
│   │       ├── SystemStatus.tsx   # 顶部 MinerU / MinIO 服务状态指示器
│   │       └── JsonViewer.tsx     # JSON 数据查看器（CodeMirror 6）
│   └── package.json
│
└── README.md
```

## 后端 API


| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/files/upload` | 上传并同步解析（本地 MinerU，`POST /file_parse`，兼容 2.7.6） |
| `POST` | `/files/upload_async` | 上传并异步解析（本地 MinerU，`POST /tasks` + 轮询，最新版） |
| `POST` | `/files/upload_cloud` | 上传并使用在线 API（mineru.net）解析，需附带 `api_key` 表单字段 |
| `GET` | `/files` | 文件列表 |
| `GET` | `/files/{id}/result` | 文件详情 + 状态 |
| `GET` | `/files/{id}/content_list` | 解析结果（content_list 格式） |
| `GET` | `/files/{id}/middle_json` | 解析结果（middle_json 格式，含精确 bbox，仅本地解析可能有） |
| `GET` | `/files/{id}/download_url` | 原文件预签名下载 URL（MinIO 生成） |
| `GET` | `/files/{id}/mineru_status` | 查询本地 MinerU 异步任务原始状态（本地异步模式专用） |
| `DELETE` | `/files/{id}` | 删除记录及 MinIO 文件 |
| `GET` | `/status` | 探活本地 MinerU 服务与 MinIO，返回 `{mineru, minio}` |


## 技术栈

**前端**

- React 19 + TypeScript + Vite 8
- Tailwind CSS 4
- react-pdf（PDF 渲染）
- react-markdown + remark-gfm + remark-math + rehype-katex + katex（内容 markdown / 公式渲染）
- @uiw/react-codemirror（JSON 查看器）
- lucide-react（图标）

**后端**

- FastAPI + Uvicorn
- SQLAlchemy + SQLite
- MinIO Python SDK
- httpx（调用本地 MinerU 与 mineru.net）

## License

MIT
