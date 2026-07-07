import katex from 'katex'

/**
 * MinerU 表格 HTML 里公式用非标准的 <eq>LaTeX</eq> 标签包裹，浏览器不认识这个标签，
 * 会被当成裸文本显示。这里在注入 DOM 前把每个 <eq> 里的 LaTeX 换成 KaTeX 渲染好的 HTML。
 */
export function renderTableEquations(html: string): string {
  return html.replace(/<eq>([\s\S]*?)<\/eq>/g, (_, latex: string) => {
    try {
      return katex.renderToString(latex, { throwOnError: false })
    } catch {
      return latex
    }
  })
}
