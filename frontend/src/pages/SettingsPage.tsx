import { useState } from 'react'
import SelectField from '../components/SelectField'
import { cloudModelOptions, getParseSettings, ocrOptions, saveParseSettings, tierOptions, v3ModeOptions } from '../utils/parseSettings'
import type { ParseSettings } from '../utils/parseSettings'

export default function SettingsPage() {
  const [settings, setSettings] = useState(getParseSettings)
  const update = <K extends keyof ParseSettings>(key: K, value: ParseSettings[K]) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    saveParseSettings(next)
  }
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div><h1 className="text-xl font-semibold text-gray-800">默认解析设置</h1>
          <p className="mt-1 text-sm text-gray-500">保存于当前浏览器；新建任务时可临时调整。</p></div>
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-medium text-gray-800">本地 v4</h2>
          <SelectField label="解析质量" value={settings.v4Tier} options={tierOptions} onChange={value => update('v4Tier', value)} />
          <SelectField label="OCR 模式" value={settings.v4Ocr} options={ocrOptions} onChange={value => update('v4Ocr', value)} />
          <p className="text-xs text-gray-400">首页的模型状态仅校验 Standard；其他质量档位需由 MinerU 服务启动时提供。</p>
        </section>
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-medium text-gray-800">在线 API</h2>
          <SelectField label="解析模型" value={settings.cloudModel} options={cloudModelOptions} onChange={value => update('cloudModel', value)} />
          {([['cloudOcr', '强制 OCR'], ['cloudTable', '表格识别'], ['cloudFormula', '公式识别']] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-sm text-gray-600">{label}
              <input type="checkbox" checked={settings[key]} onChange={e => update(key, e.target.checked)} className="h-4 w-4 accent-blue-600" />
            </label>
          ))}
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <SelectField label="本地 v3 默认调用方式" value={settings.v3Mode} options={v3ModeOptions} onChange={value => update('v3Mode', value)} />
        </section>
      </div>
    </div>
  )
}
