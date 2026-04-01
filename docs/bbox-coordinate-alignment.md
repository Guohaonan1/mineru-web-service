# MinerU bbox 坐标对齐原理与调试记录

## 背景

在实现 PDF 左右联动（点击内容块高亮对应 PDF 区域）时，需要将 MinerU 返回的 `content_list` 中每个 block 的 `bbox` 坐标映射到 pdfjs 渲染的 PDF 画面上。

调试过程中发现坐标系存在多层不一致，本文记录完整排查过程和最终结论。

---

## 一、MinerU bbox 坐标系

### 字段含义

```json
{
  "type": "text",
  "bbox": [x1, y1, x2, y2],
  "page_idx": 0
}
```

| 字段 | 含义 |
|------|------|
| `x1` | 框左边缘，距页面左侧距离（MinerU 像素） |
| `y1` | 框**上**边缘，距页面**顶部**距离（MinerU 像素） |
| `x2` | 框右边缘 |
| `y2` | 框下边缘 |

**原点在左上角，y 向下增大**，与 CSS/屏幕坐标一致（非 PDF 标准底部原点）。

### 验证方法

以 "Attention Is All You Need" 论文为例：

| y1 小（靠上） | 内容 |
|---|---|
| 146 | 顶部水印 |
| 229 | **标题**（应在页面上方）|

| y1 大（靠下） | 内容 |
|---|---|
| 828 | 脚注 |
| 862 | **页脚**（应在页面下方）|

---

## 二、坐标系差异：MinerU vs pdfjs

### 核心问题

`bbox` 坐标**不是** PDF 点坐标（1pt = 1/72 inch），而是 MinerU 内部渲染图片的**像素坐标**。

| | 单位 | A4 页面宽度 |
|---|---|---|
| PDF 标准 | points（72 DPI） | 595 pt |
| pdfjs `getViewport({scale:1}).width` | CSS px（≈ 72 DPI） | 595 px |
| MinerU bbox | 像素（≈ 120 DPI） | **≈ 992 px** |

### 实测数据（A4 论文标题）

```
标题 bbox: [351, 229, 645, 248]
标题中心 x = (351 + 645) / 2 = 498
页面宽度推算 = 498 × 2 = 996 ≈ 992 px
缩放比 = 992 / 595 ≈ 1.667 = 120 / 72
```

**结论：MinerU 以约 120 DPI 渲染 PDF 提取坐标。**

---

## 三、MinerU 使用固定正方形坐标系

### 关键发现

MinerU 对所有 PDF（无论页面尺寸）使用**固定边长 N ≈ 992 的正方形**坐标系：

```
N = 595 × (120 / 72) ≈ 991.7
```

验证：

- A4（595 × 842 pt）：bbox x 最大 ≈ 803，推算页宽 ≈ 992 ✓
- Letter（612 × 792 pt）：bbox x 最大理论上也 ≈ 992（同一个 N）

### 为什么不随页面尺寸变化

MinerU 的 ML 模型接受固定尺寸输入，将任意页面缩放/压缩到 N×N 正方形后推理，返回的 bbox 坐标在这个固定正方形空间内。

---

## 四、Y 轴额外的不对称性

X 和 Y 方向的等效 DPI 并不完全相同：

| 方向 | 等效 DPI | 推算过程 |
|---|---|---|
| X | ≈ 120 DPI | `592 / 595 × 72 ≈ 120` |
| Y | ≈ 115-120 DPI | 实测 0.845 系数反推 |

Y 方向存在约 0.5% 的微小差异，原因推测是 ML 模型内部的坐标后处理。

---

## 五、最终实现：SVG viewBox 方案

### 核心思路

用 SVG 的 `viewBox` + `preserveAspectRatio="none"` 替代手动计算像素坐标：

- `viewBox="0 0 N N"`（正方形，N≈992，固定值）
- SVG 元素覆盖整个页面画布（`absolute inset-0 w-full h-full`）
- 浏览器自动按页面实际宽高比独立缩放 X/Y

### 关键代码

```typescript
// 固定正方形边长，由 A4（595pt）× 120/72 推导
const MINERU_N = 595 * (120 / 72)  // ≈ 991.7

// SVG 覆盖层
<svg
  className="absolute inset-0 w-full h-full"
  viewBox={`0 0 ${MINERU_N} ${MINERU_N}`}
  preserveAspectRatio="none"   // X/Y 独立缩放，自适应任意页面比例
>
  <rect x={x1} y={y1} width={x2-x1} height={y2-y1} ... />
</svg>
```

### 各页面尺寸的等效缩放系数（containerWidth=405.5px 为例）

| PDF 尺寸 | pdfjs 报告 | N | scaleX | scaleY |
|---|---|---|---|---|
| A4 595×842 | 595×842 pt | 991.7 | 0.4089 | 0.5787 |
| Letter 612×792 | 612×792 pt | **991.7**（固定）| **0.4087** | **0.5291** |

---

## 六、排查过程中的坑

### 1. Y 轴方向翻转

**现象**：框的上下顺序完全颠倒。

**原因**：PDF 标准坐标系原点在**左下角**，y 向上增大。最初按此假设翻转了 y 轴。但 MinerU 基于 PyMuPDF 处理，PyMuPDF 已将坐标转换为左上角原点（y 向下），不需要翻转。

**修复**：`top = y1 * scale`（直接用 y1，去掉翻转）

---

### 2. Mac Preview 重存会改变页面尺寸

**现象**：同一篇论文，Mac Preview 重存的 PDF 框对齐正常，原始 PDF 框错乱。

**原因**：Mac Preview 重存时将 Letter（612×792）转换成了 A4（595×842），导致：
- 重存版：A4，N=992，代码逻辑正确
- 原始版：Letter，代码错误地用了 N=1020（612×120/72），偏移 2.8%

**排查方法**：

```bash
python3 -c "
import zlib, re
with open('file.pdf', 'rb') as f:
    raw = f.read()
for m in re.finditer(b'stream\r?\n', raw):
    try:
        dec = zlib.decompress(raw[m.start()+7:m.start()+50000])
        mb = re.findall(r'/MediaBox\s*\[([^\]]+)\]', dec.decode('latin-1','ignore'))
        if mb: print(mb)
    except: pass
"
```

---

### 3. 使用可变 N（随页面尺寸变化）导致 Letter 错误

**错误假设**：N = pdf_width × 120/72（每种页面尺寸对应不同 N）

**实际情况**：MinerU 使用**固定 N ≈ 992**，与页面尺寸无关。

**修复**：`const MINERU_N = 595 * (120 / 72)`（常量，不随页面变化）

---

## 七、调试技巧

在 `onLoadSuccess` 回调中打印各比例参数：

```typescript
console.log(
  `[PDFViewer] page=${pageNum}`,
  `pdf=${vp.width}×${vp.height}pt`,
  `N=${MINERU_N.toFixed(1)}`,
  `scaleX=${(containerWidth / MINERU_N).toFixed(4)}`,
  `scaleY=${(renderedH / MINERU_N).toFixed(4)}`,
)
```

判断标准：不同页面尺寸的 **scaleX 应该接近相等**（因为 N 固定），scaleY 随页面高宽比变化。
