# MinerU 4.1.6：准备模型并启动本地 API

本文对应本项目的“本地 v4.1”入口，以 MinerU 4.1.6 源码和 18000 端口为例。下文的 `/path/to/MinerU` 请替换为自己的 MinerU 仓库路径。只提供解析 API 时，不需要启动 Doclib 或 MinerU WebUI；本项目的前后端仍需按 [README](README.md) 单独运行。

4.1 与 4.0 的 HTTP 请求和结果协议不同。本项目保留了两个独立适配器：4.1 地址由后端 `MINERU_V41_URL` 配置，4.0 地址由 `MINERU_V4_URL` 配置。两版同时运行时必须使用不同端口；只运行 4.1 时，前端显示“v4.0 离线”是预期结果。现有 4.0 历史任务不会被改写。

## 1. 安装并确认版本

MinerU 4.1 支持 Python 3.11–3.14。已有可工作的 `.venv` 可以直接使用；新环境可从源码安装基础依赖：

```bash
cd /path/to/MinerU
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -e .
mineru-kit version --json
```

确认版本输出为 `4.1.6`。Apple Silicon 的基础安装会包含 Torch 依赖；其他平台如需运行 Torch 小模型，可安装 `uv pip install -e ".[torch]"`。下载模型文件本身不要求安装所有推理引擎。不要在正在运行 4.0 服务的虚拟环境中直接替换依赖；如需两版并存，为 4.0 使用独立源码检出和虚拟环境。

## 2. 先准备本机实际使用的模型

本项目上传页的“下载模型”按钮在**本项目后端所在机器**调用 `MINERU_V4_CLI` 指向的 MinerU CLI，执行以下两步。按钮不会让浏览器下载模型，也不会启动 MinerU API：

```bash
cd /path/to/MinerU
./.venv/bin/mineru-kit models download --tier standard --small-backend onnx --vlm-engine llama-cpp --source modelscope
./.venv/bin/mineru-kit models verify --tier standard --small-backend onnx --vlm-engine llama-cpp
```

这是当前 macOS 本地部署使用的 **ONNX 小模型 + llama.cpp VLM** 组合。下载与校验使用同一组参数；`verify` 退出码为 0 表示所需文件齐全。模型默认放在 `~/.mineru/models/`，实际目录以 MinerU 配置的 `model.base_dir` 为准。首次下载可能需要数 GB 和较长时间；下载失败可重试，再执行 `verify`。不要手动创建模型完成标记。

上传页显示的“已就绪”只检查上述 Standard 组合的模型文件，**不等于 API 服务已启动，也不保证其他档位或引擎已通过推理测试**。纯 HTML、Office 等原生文档由 MinerU 固定使用 Flash；PDF、图片按请求档位解析。

### 可选：下载全部四组仓库

如果需要测试 ONNX／Torch 与 llama.cpp／MLX 等不同组合，可分别下载和校验：

| 模型仓库 | 用途 |
| --- | --- |
| `MinerU-4_models_onnx` | ONNX 小模型：版面、OCR、公式、表格等 |
| `MinerU-4_models_torch` | Torch 小模型，替代 ONNX 小模型 |
| `MinerU2.5-Pro-2605-1.2B-GGUF` | llama.cpp 使用的 GGUF 主权重及 mmproj |
| `MinerU2.5-Pro-2605-1.2B` | MLX、vLLM、LMDeploy 等引擎使用的原始 VLM 权重 |

```bash
./.venv/bin/mineru-kit models download MinerU-4_models_onnx --source modelscope
./.venv/bin/mineru-kit models download MinerU-4_models_torch --source modelscope
./.venv/bin/mineru-kit models download MinerU2.5-Pro-2605-1.2B-GGUF --source modelscope
./.venv/bin/mineru-kit models download MinerU2.5-Pro-2605-1.2B --source modelscope

./.venv/bin/mineru-kit models verify MinerU-4_models_onnx
./.venv/bin/mineru-kit models verify MinerU-4_models_torch
./.venv/bin/mineru-kit models verify MinerU2.5-Pro-2605-1.2B-GGUF
./.venv/bin/mineru-kit models verify MinerU2.5-Pro-2605-1.2B
./.venv/bin/mineru-kit models show
```

四组文件齐全不会让单次任务同时加载四组，也不会自动切换引擎。macOS 自动选择 llama.cpp；使用 MLX 必须安装 `mlx-vlm>=0.7.0,<0.8.0` 并显式设置 `MINERU_MODEL_VLM_ENGINE=mlx`。Torch 和 MLX 的文件校验不代表已完成实际推理验证。只使用本机默认组合时，无需下载全部四组。模型来源也可改为 `--source huggingface`。

## 3. 启动 MinerU 4.1.6 API

模型准备完毕后，在 MinerU 仓库根目录启动独立服务：

```bash
cd /path/to/MinerU
MINERU_MODEL_SOURCE=local MINERU_MODEL_SMALL_BACKEND=onnx MINERU_MODEL_VLM_ENGINE=llama-cpp \
  ./.venv/bin/mineru-kit api-server --host 127.0.0.1 --port 18000 --tier standard --preload-models
```

`MINERU_MODEL_SOURCE=local` 防止解析时自动下载缺失模型；`--preload-models` 在启动阶段预加载所选模型，适合本项目将下载与解析分开的流程。它是可选开关，不代表健康检查可替代一次真实解析。`--tier standard` 是 PDF／图片档位的**上限**，可用 Flash、Basic、Standard，**不包含 Advanced**；如需 Advanced，服务须开放该档位（例如以 `--tier advanced` 启动），并确认设备与依赖支持。Office、HTML 等原生文档固定使用 Flash，不受 PDF／图片档位限制。

此命令默认不启用 API Key，且只监听本机 `127.0.0.1`，适合本项目后端直连。服务在前台运行，按 `Ctrl+C` 停止。若换用 Torch、MLX 或其他后端，下载、校验和启动时的后端／引擎配置必须一致；修改后重启服务。

## 4. 核对服务与实际解析

```bash
curl -fsS http://127.0.0.1:18000/v1/health
curl -fsS http://127.0.0.1:18000/v1/tiers
```

`/v1/health` 应返回 `status: "ok"`、`version: "4.1.6"`，以及 `features.task_output_formats` 中的 `default` 和 `features.sources` 中的 `upload`、`url`。健康检查路径是 `/v1/health`，不是 `/health`。本项目后端的 `/status` 会分别报告 v4.0 与 v4.1 的 `ok`、`version`；同一 4.1 服务即使填入两个地址，也只会被 v4.1 适配器判为可用。

用本项目网页选择“本地 v4.1”，上传一个 PDF，确认任务从“解析中”变为“已完成”，结果页同时显示原 PDF、布局框和解析内容。模型文件校验之外，仍建议在新环境运行一次端到端解析。

也可以从 MinerU 仓库用官方 Tasks 示例脚本验证。将示例中的两个路径替换为实际仓库位置：

```bash
cd /path/to/MinerU
MINERU_API_URL=http://127.0.0.1:18000 RESULT_DIR=/tmp/mineru-4.1-result \
  bash scripts/http_task_example.sh /path/to/example.pdf
```

4.1 主 API 不再提供 `/v1/file_parse`；如需同步等待接口，需单独启动 `mineru-kit file-parse-server`。4.1 的异步流程为：`POST /v1/tasks` 提交 JSON 文件清单 → 按 `files[].upload.url` 按需 PUT 原始字节 → `GET /v1/tasks/{task_id}` 轮询 → 从成功文件的 `files[].result_url` 下载 ZIP。默认 ZIP 含 `markdown.md`、`middle_json.json`、`structured_content.json` 和 `images/`。API 定义见本地服务的 `/docs`，或 MinerU 仓库的 `docs/zh/usage/tasks.md`。
