import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'

interface Props {
  value: unknown
}

export default function JsonViewer({ value }: Props) {
  const text = JSON.stringify(value, null, 2)

  return (
    <div className="h-full overflow-auto text-xs">
      <CodeMirror
        value={text}
        extensions={[json()]}
        editable={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
        }}
        style={{ height: '100%', fontSize: '12px' }}
      />
    </div>
  )
}
