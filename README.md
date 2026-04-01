# MinerU Web Service

> 基于本地 MinerU 服务 API 的文档智能解析平台 —— React 前端 + 轻量 FastAPI 后端，解析能力完全由 MinerU 本地服务承载。

## 项目背景

[MinerU](https://github.com/opendatalab/MinerU) 是由 OpenDataLab 开源的高精度文档解析引擎，支持 PDF、Word、图片等多种格式，具备版面分析、公式识别、表格提取等能力。

MinerU 支持源码运行或 Docker 部署，**启动后在本地暴露完整的 HTTP REST API**，可直接作为解析微服务调用，无需在自建后端中安装任何 ML 依赖。

本项目核心思路：**解析能力完全外包给本地 MinerU 服务，自建后端只做元数据存储和 API 代理，前端复刻 MinerU Web 界面并支持定制扩展。**

## 架构

```
用户浏览器
    │
    ▼
React 前端（port 5173/80）
    │  REST API
    ▼
FastAPI 后端（薄层，port 8000）
    │  ├── SQLite（文件元数据、task_id、状态）
    │  │
    │  └── HTTP 调用
    ▼
MinerU 本地服务（port 8000）
    ├── Web API：POST /extract/task 等
    ├── Swagger 文档：http://localhost:8000/docs
    ├── OpenAI 兼容接口（port 30000，VLM 推理）
    └── Gradio WebUI（port 7860，可选）
    （支持源码启动或 Docker 部署，能力一致）
```

**后端职责极简：**

| 职责 | MinerU 镜像负责 | 自建后端负责 |
|------|----------------|-------------|
| 文件解析 | ✅ | 转发请求，记录 task_id |
| 文件存储 | ✅（内部管理） | ❌ 不需要 MinIO |
| 任务队列 | ✅（内部管理） | ❌ 不需要 Redis |
| 解析结果 | ✅（返回 Markdown/JSON） | 缓存结果到 SQLite |
| 用户元数据 | ❌ | ✅ 文件列表、历史记录 |

## MinerU 本地服务说明

官方文档：https://opendatalab.github.io/MinerU/zh/quick_start/docker_deployment/

| 服务 | 端口 | 用途 |
|------|------|------|
| Web API | 8000 | 核心解析 HTTP API，有 `/docs` |
| OpenAI 兼容接口 | 30000 | VLM 推理加速 |
| Gradio WebUI | 7860 | 可视化调试（可选） |

**源码启动（当前使用方式）：**
```bash
# 在 MinerU 源码目录下启动 API 服务
mineru-api  # 或参考官方文档的具体命令
# 访问 API 文档
open http://localhost:8000/docs
```

**Docker 启动（等效方式）：**
```bash
docker compose -f compose.yaml --profile api up -d
```

两种方式暴露的 API 完全一致。

## 自建后端 API 设计（规划）

```
POST   /files/upload      → 调 MinerU API 提交任务，存 task_id 到 SQLite
GET    /files             → 查 SQLite 文件列表
GET    /files/{id}/status → 轮询 MinerU 任务状态
GET    /files/{id}/result → 返回解析结果（Markdown）
DELETE /files/{id}        → 删除记录
```

## 技术栈

### 前端
- React 19 + TypeScript + Vite 8

### 后端
- FastAPI（轻量，无 ML 依赖）
- SQLite（元数据存储，无需 PostgreSQL/Redis/MinIO）

### 解析引擎
- MinerU 本地服务（源码运行或 Docker，port 8000）
- 支持 NVIDIA GPU 加速
- API 文档见 `http://localhost:8000/docs`

## 项目结构

```
mineru-web-service/
├── frontend/          # React 前端（已初始化）
├── backend/           # FastAPI 后端（待开发）
├── demo/              # 第三方参考实现（仅供了解背景，不作为开发参考）
└── README.md
```

## 开发路线

### 第一步：确认 MinerU 本地 API
- [ ] 启动 MinerU Docker（`--profile api`）
- [ ] 访问 `/docs` 确认接口入参/出参格式

### 第二步：后端
- [ ] FastAPI 骨架 + SQLite 模型
- [ ] 文件上传 → 调 MinerU → 存 task_id
- [ ] 任务状态轮询接口
- [ ] 解析结果获取接口

### 第三步：前端
- [ ] 文件上传页
- [ ] 文件列表 + 状态展示
- [ ] 解析结果预览（Markdown + PDF 双栏）

### 第四步：整合
- [ ] Docker Compose 统一编排（frontend + backend + mineru）

## 参考资料

- MinerU 官方仓库：https://github.com/opendatalab/MinerU
- MinerU Docker 部署文档：https://opendatalab.github.io/MinerU/zh/quick_start/docker_deployment/
- MinerU 云端 API 文档：https://mineru.net/apiManage/docs

## License

MIT
