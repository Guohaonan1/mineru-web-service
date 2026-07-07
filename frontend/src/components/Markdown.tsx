import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface Props {
  text: string
}

/**
 * 行内 markdown 渲染（加粗/斜体/行内代码/链接/$...$ 公式等）。
 * 去掉 react-markdown 默认包的 <p>，交由调用方自己决定外层标签（h1/h2/p/li...）。
 * MinerU 文本里的公式是 $...$/$$...$$ 包着的 LaTeX，需要 remark-math 识别语法 + rehype-katex 渲染。
 * remark-gfm 提供裸邮箱/裸链接自动转 <a> 等 GFM 扩展语法，跟官网渲染效果对齐。
 */
export default function Markdown({ text }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <>{children}</>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-700">
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="px-1 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono">{children}</code>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  )
}
