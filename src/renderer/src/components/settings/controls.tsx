import { Children, useId } from 'react'

/**
 * A titled block: bold 13 px title, muted description, then its rows grouped on one rounded
 * surface, the way System Settings and Codex lay them out. `action` sits at the title's right,
 * `footnote` under the group. `plain` leaves the rows loose, for content that brings its own cards.
 */
export function Section({
  title,
  description,
  action,
  footnote,
  plain,
  children
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  footnote?: React.ReactNode
  plain?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {action}
      </div>
      {description && <p className="mt-1 max-w-[560px] text-[12.5px] leading-[1.5] text-muted">{description}</p>}
      {/* Nothing to list (no terminals running, say): no empty card, the description says so. */}
      {Children.toArray(children).length > 0 && <div className={plain ? 'mt-3' : 'settings-group mt-3'}>{children}</div>}
      {footnote && <div className="mt-2 px-1 text-[11.5px] leading-relaxed text-muted">{footnote}</div>}
    </section>
  )
}

/**
 * Label on the left, control on the right. Rows separate themselves with hairlines. A hint stays on
 * one line (paths, versions) unless `wrapHint`, for a sentence that explains the row.
 */
export function Row({ label, hint, wrapHint, children }: { label: string; hint?: string; wrapHint?: boolean; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-fg">{label}</div>
        {hint && (
          <div className={wrapHint ? 'max-w-[380px] text-[11.5px] leading-[1.45] text-muted' : 'max-w-[360px] truncate text-[11.5px] text-muted'} title={wrapHint ? undefined : hint}>
            {hint}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="seg-mac" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} data-on={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  format,
  onChange
}: {
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <>
      <input
        type="range"
        className="slider-mac"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-14 whitespace-nowrap text-right text-[12.5px] tabular-nums text-muted">{format ? format(value) : value}</span>
    </>
  )
}

export function Toggle({ value, onChange, disabled, label }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors disabled:opacity-40"
      style={{ background: value ? 'var(--accent)' : 'var(--border-strong)' }}
    >
      <span
        className="absolute top-[2px] h-[16px] w-[16px] rounded-full transition-all"
        style={{ left: value ? 16 : 2, background: value ? 'var(--on-accent)' : '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
      />
    </button>
  )
}

export function TextField({
  value,
  placeholder,
  mono,
  secret,
  width = 260,
  list,
  onChange
}: {
  value: string
  placeholder?: string
  mono?: boolean
  /** Shown as dots: a key or a password. */
  secret?: boolean
  width?: number
  list?: string[]
  onChange: (v: string) => void
}) {
  const id = useId()
  return (
    <>
      <input
        className={`field h-7 text-[12.5px] ${mono ? 'font-mono text-[12.5px]' : ''}`}
        style={{ width }}
        type={secret ? 'password' : 'text'}
        value={value}
        placeholder={placeholder}
        list={list ? id : undefined}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {list && (
        <datalist id={id}>
          {list.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      )}
    </>
  )
}

export function SmallButton({ children, onClick, tone = 'secondary' }: { children: React.ReactNode; onClick: () => void; tone?: 'secondary' | 'danger' }) {
  return (
    <button
      className="btn btn-secondary h-7 px-3 text-[12.5px]"
      style={tone === 'danger' ? { color: 'var(--danger)' } : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex justify-end gap-2 border-t border-line pt-4">{children}</div>
}

export function TextArea({ value, placeholder, mono, rows = 3, onChange }: { value: string; placeholder?: string; mono?: boolean; rows?: number; onChange: (v: string) => void }) {
  return (
    <textarea
      className={`field w-full resize-y py-1.5 text-[12.5px] ${mono ? 'font-mono text-[12.5px]' : ''}`}
      style={{ height: 'auto', minHeight: 0 }}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
    />
  )
}
