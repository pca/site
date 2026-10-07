import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"

export interface SelectOption {
  value: string
  label: string
  description?: string
  group?: string
  leading?: ReactNode
  /** Extra text matched by the search box. */
  keywords?: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  id?: string
  placeholder?: string
  searchable?: boolean
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

interface Position {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

const GAP = 6
const MAX_HEIGHT = 340

export function Select({
  value,
  onChange,
  options,
  id,
  placeholder = "Select…",
  searchable = options.length > 8,
  searchPlaceholder = "Search…",
  disabled,
  className = "",
  "aria-label": ariaLabel,
}: SelectProps) {
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef({ text: "", at: 0 })

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<Position | null>(null)

  const selected = options.find(o => o.value === value)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => `${o.label} ${o.description ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(q))
  }, [options, query])

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(rect.width, 260)
    const left = Math.min(rect.left, window.innerWidth - width - 8)
    const below = window.innerHeight - rect.bottom - GAP - 8
    const above = rect.top - GAP - 8
    if (below < 220 && above > below) {
      setPosition({ left, width, bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.min(MAX_HEIGHT, above) })
    } else {
      setPosition({ left, width, top: rect.bottom + GAP, maxHeight: Math.min(MAX_HEIGHT, below) })
    }
  }, [])

  const show = (start?: "first" | "last") => {
    if (disabled) return
    const index = options.findIndex(o => o.value === value)
    setQuery("")
    setActive(start === "last" ? options.length - 1 : start === "first" || index < 0 ? Math.max(0, index) : index)
    place()
    setOpen(true)
  }

  const hide = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const choose = (option: SelectOption | undefined) => {
    if (!option) return
    if (option.value !== value) onChange(option.value)
    hide()
  }

  useLayoutEffect(() => {
    if (!open) return
    if (searchable) searchRef.current?.focus()
    else listRef.current?.focus()
  }, [open, searchable])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) hide(false)
    }
    const onMove = (e: Event) => {
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return
      place()
    }
    document.addEventListener("pointerdown", onPointer)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", onMove, true)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", onMove, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [open, active, filtered])

  const onListKey = (e: KeyboardEvent) => {
    const last = filtered.length - 1
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActive(i => (i >= last ? 0 : i + 1))
        return
      case "ArrowUp":
        e.preventDefault()
        setActive(i => (i <= 0 ? last : i - 1))
        return
      case "Home":
        if (searchable && e.target === searchRef.current) return
        e.preventDefault()
        setActive(0)
        return
      case "End":
        if (searchable && e.target === searchRef.current) return
        e.preventDefault()
        setActive(last)
        return
      case "PageDown":
        e.preventDefault()
        setActive(i => Math.min(last, i + 6))
        return
      case "PageUp":
        e.preventDefault()
        setActive(i => Math.max(0, i - 6))
        return
      case "Enter":
        e.preventDefault()
        choose(filtered[active])
        return
      case "Escape":
        e.preventDefault()
        hide()
        return
      case "Tab":
        hide(false)
        return
    }
    if (!searchable && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === " ") {
        e.preventDefault()
        choose(filtered[active])
        return
      }
      const now = Date.now()
      const t = typeahead.current
      t.text = now - t.at > 600 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
      t.at = now
      const match = filtered.findIndex(o => o.label.toLowerCase().startsWith(t.text))
      if (match >= 0) setActive(match)
    }
  }

  const onTriggerKey = (e: KeyboardEvent) => {
    if (open) return
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      show()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      show("last")
    }
  }

  const activeId = filtered[active] ? `${listId}-${active}` : undefined

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onTriggerKey}
        data-open={open || undefined}
        className={`select-trigger ${className}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected?.leading}
          <span className={`max-w-full shrink-0 truncate ${selected ? "" : "text-zinc-400"}`}>{selected?.label ?? placeholder}</span>
          {selected?.description && <span className="hidden min-w-0 truncate text-xs text-zinc-400 sm:inline">{selected.description}</span>}
        </span>
        <Chevron open={open} />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            className={`select-popover ${position.bottom !== undefined ? "origin-bottom" : "origin-top"}`}
            style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
          >
            {searchable && (
              <div className="flex items-center gap-2 border-b border-zinc-100 px-3">
                <SearchIcon />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value)
                    setActive(0)
                  }}
                  onKeyDown={onListKey}
                  placeholder={searchPlaceholder}
                  role="searchbox"
                  aria-controls={listId}
                  aria-activedescendant={activeId}
                  className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-400"
                />
              </div>
            )}
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={searchable ? undefined : activeId}
              onKeyDown={searchable ? undefined : onListKey}
              className="overflow-y-auto overscroll-contain p-1 outline-none"
            >
              {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-zinc-400">No matches for “{query}”</div>}
              {filtered.map((option, i) => {
                const header = option.group && option.group !== filtered[i - 1]?.group
                const isSelected = option.value === value
                return (
                  <div key={option.value || "__empty"}>
                    {header && (
                      <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{option.group}</div>
                    )}
                    {!option.group && filtered[i - 1]?.group && <div className="my-1 h-px bg-zinc-100" />}
                    <div
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={isSelected}
                      data-active={i === active || undefined}
                      onPointerMove={() => i !== active && setActive(i)}
                      onClick={() => choose(option)}
                      className="select-option"
                    >
                      {option.leading}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${isSelected ? "font-medium" : ""}`}>{option.label}</span>
                        {option.description && <span className="block truncate text-xs text-zinc-400">{option.description}</span>}
                      </span>
                      <Check visible={isSelected} />
                    </div>
                    {!option.group && filtered[i + 1]?.group && <div className="my-1 h-px bg-zinc-100" />}
                  </div>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={`size-4 shrink-0 text-zinc-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
      <path d="m5.5 7.75 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Check({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={`size-4 shrink-0 text-zinc-900 ${visible ? "" : "invisible"}`}>
      <path d="m4.75 10.5 3.5 3.5 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-4 shrink-0 text-zinc-400">
      <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="m13 13 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
