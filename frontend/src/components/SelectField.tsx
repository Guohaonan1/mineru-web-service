import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption<T extends string> {
  value: T
  label: string
  description?: string
}

interface Props<T extends string> {
  label: string
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
}

/** Compact, keyboard-accessible select used by task and default settings. */
export default function SelectField<T extends string>({ label, value, options, onChange }: Props<T>) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [menuMaxHeight, setMenuMaxHeight] = useState(256)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()
  const selected = options.find(option => option.value === value)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus()
  }, [open, activeIndex])

  const openMenu = (direction: 'selected' | 'first' | 'last' = 'selected') => {
    const trigger = triggerRef.current?.getBoundingClientRect()
    const dialog = rootRef.current?.closest('[role="dialog"]')?.getBoundingClientRect()
    if (trigger) {
      const lowerBound = dialog ? Math.min(dialog.bottom, window.innerHeight) : window.innerHeight
      const upperBound = dialog ? Math.max(dialog.top, 0) : 0
      const spaceBelow = lowerBound - trigger.bottom
      const spaceAbove = trigger.top - upperBound
      const upwards = spaceBelow < 272 && spaceAbove > spaceBelow
      setDropUp(upwards)
      setMenuMaxHeight(Math.max(96, Math.min(256, (upwards ? spaceAbove : spaceBelow) - 12)))
    }
    setActiveIndex(direction === 'first' ? 0 : direction === 'last' ? options.length - 1
      : Math.max(0, options.findIndex(option => option.value === value)))
    setOpen(true)
  }

  const choose = (option: SelectOption<T>) => {
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onOptionKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1)
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false)
      if (event.key === 'Escape') { event.preventDefault(); triggerRef.current?.focus() }
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 text-sm" ref={rootRef}>
      <span className="shrink-0 font-medium text-gray-600">{label}</span>
      <div className="relative w-48 max-w-[60%]">
        <button ref={triggerRef} type="button" aria-label={label} aria-haspopup="listbox"
          aria-expanded={open} aria-controls={open ? menuId : undefined}
          onClick={() => open ? setOpen(false) : openMenu()}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); openMenu(event.key === 'ArrowDown' ? 'first' : 'last')
            }
          }}
          className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-1.5 text-left text-gray-700 shadow-sm outline-none transition-colors hover:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-200 ${open ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}>
          <span className="truncate">{selected?.label ?? value}</span>
          <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div id={menuId} role="listbox" aria-label={label}
            style={{ maxHeight: menuMaxHeight }}
            className={`absolute left-0 right-0 z-50 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg ${dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
            {options.map((option, index) => (
              <button key={option.value} ref={element => { optionRefs.current[index] = element }}
                type="button" role="option" aria-selected={option.value === value}
                onClick={() => choose(option)} onKeyDown={event => onOptionKeyDown(event, index)}
                className={`flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1 text-left outline-none transition-colors hover:bg-blue-50 focus-visible:bg-blue-50 ${option.value === value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>
                <span className="min-w-0"><span className="block truncate text-xs font-medium">{option.label}</span>
                  {option.description && <span className="mt-0.5 block text-[10px] leading-3 text-gray-400">{option.description}</span>}
                </span>
                {option.value === value && <Check size={15} className="mt-0.5 shrink-0 text-blue-600" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
