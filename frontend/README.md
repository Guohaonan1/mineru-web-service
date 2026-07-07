# MinerU Web (React)

基于 React + TypeScript 重写的 [MinerU](https://github.com/opendatalab/MinerU) 前端，替换原有 Gradio 界面，连接已有的 MinerU Docker 服务。

## 项目背景

MinerU Docker 部署后会在 `8000` 端口暴露完整的 REST API，原有 Gradio（`7860` 端口）只是其中一个展示层。本项目用 React 替换 Gradio，直接对接该 API，获得完整的前端定制能力。

```
[本项目 React 前端] ──HTTP──▶ [MinerU Docker :8000 API]
```

无需修改 MinerU 任何配置，纯前端项目。

## 前置条件

MinerU 需以 API 模式启动（默认不开启 API 服务）：

```bash
docker compose -f compose.yaml --profile api up -d
```

启动后：
- `http://localhost:8000` — REST API
- `http://localhost:8000/docs` — Swagger 交互文档
- `http://localhost:7860` — 原 Gradio 界面（可不用）

## 技术栈

- React 19 + TypeScript
- Vite
- 对接 MinerU REST API（`POST /tasks`、`GET /tasks/{id}/result` 等）

## 内容渲染

`ContentViewer`/`ContentViewerV2` 对每个 block 的渲染方式参考了 mineru.net 官网右侧结果面板的实现（逐 block 单独 markdown 渲染 + `bbox` 定位联动高亮，而不是整篇丢给 markdown 渲染器）：

- **文本类 block**：统一走 `src/components/Markdown.tsx`（基于 `react-markdown`），支持加粗、斜体、行内代码、裸邮箱/裸链接自动转 `<a>`（`remark-gfm`）
- **公式**：`content_list`/`middle_json` 里的公式文本本身是 `$...$`（行内）/`$$...$$`（块级）包着的 LaTeX，靠 `remark-math` 识别语法、`rehype-katex` + `katex` 渲染成正式排版。`middle_json` 里 `inline_equation`/`interline_equation` 类型的 span 内容是**裸 LaTeX（没有 `$` 包裹）**，`src/utils/parseMiddleJson.ts` 里做了手动包裹处理，跟 `content_list` 里已经预先包好 `$` 的情况保持一致
- **表格内公式**：MinerU 返回的表格 HTML 里公式用非标准的 `<eq>LaTeX</eq>` 标签包裹，浏览器不认识这个标签会导致公式显示成纯文本。`src/utils/renderTableEquations.ts` 会在表格 HTML 注入 DOM 前，把所有 `<eq>...</eq>` 替换成 `katex.renderToString()` 渲染出的 HTML
- **chart（图表）**：`middle_json` 里除了 `image` 还有一种同构但命名不同的 `chart` 类型（`chart_body` + 一到两个 `chart_caption`），`src/utils/parseMiddleJson.ts` 按原始顺序解析后统一映射成 `image`/`image_caption` 渲染，视觉上没有区别
- **图片/图表宽度**：不是固定百分比，而是按 `bbox` 宽度相对页面宽度（V1 用 `content_list` 的固定正方形坐标系 ≈991.7；V2 用 `middle_json` 的真实 `page_size`）算出的比例动态设置，居中方式（`margin-left:50% + translateX(-50%)`）跟官网一致

## MinerU API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/file_parse` | 上传文件，创建解析任务 |
| GET | `/tasks/{task_id}` | 查询任务状态 |
| GET | `/tasks/{task_id}/result` | 获取解析结果（Markdown / JSON） |
| GET | `/health` | 健康检查 |

支持格式：PDF、Word（.docx）、PowerPoint（.pptx）、图片（.png/.jpg）、Excel（.xlsx）

## 功能规划

- [ ] 文件上传（拖拽 / 点击）
- [ ] 异步任务状态轮询 + 进度展示
- [ ] Markdown 预览（含公式、表格）
- [ ] JSON 结构化结果查看
- [ ] 解析结果文件下载
- [ ] 批量上传 / 任务历史列表
- [ ] 解析参数配置（OCR 模式、页码范围等）
- [ ] 原文档与解析结果对比视图

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 构建生产版本
npm run build
```

开发时前端通过 Vite 代理转发请求到 MinerU API，无需处理跨域：

```ts
// vite.config.ts（待配置）
server: {
  proxy: {
    '/api': 'http://localhost:8000'
  }
}
```

## 项目结构

```
src/
├── api/          # MinerU API 请求封装
├── components/   # 通用组件（上传框、进度条、Markdown 预览等）
├── pages/        # 页面
├── hooks/        # 自定义 Hook（useTask、useUpload 等）
└── types/        # TypeScript 类型定义
```

## 相关资源

- [MinerU 官方仓库](https://github.com/opendatalab/MinerU)
- [MinerU Docker 部署文档](https://opendatalab.github.io/MinerU/quick_start/docker_deployment/)
- [MinerU API 文档](https://mineru.net/apiManage/docs)
