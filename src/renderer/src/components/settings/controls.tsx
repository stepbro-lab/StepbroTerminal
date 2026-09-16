import { useId } from 'react'

/** A titled block: bold 13 px title, muted description, then rows. `action` sits at the title's right. */
export function Section({ title, description, action, children }: { title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {action}
      </div>
      {description && <p className="mt-1 max-w-[560px] text-[12.5px] leading-[1.5] text-muted">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Label on the left, control on the right. Rows separate themselves with hairlines. */
export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-fg">{label}</div>
        {hint && (
          <div className="max-w-[360px] truncate text-[11.5px] text-muted" title={hint}>
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

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={value}
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

/** One of a list, for lists longer than a row of segments: the machine's microphones, say. */
export function Select<T extends string>({
  value,
  options,
  width = 260,
  onChange
}: {
  value: T
  options: Array<{ value: T; label: string }>
  width?: number
  onChange: (v: T) => void
}) {
  return (
    <select className="field h-7 text-[12.5px]" style={{ width }} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
