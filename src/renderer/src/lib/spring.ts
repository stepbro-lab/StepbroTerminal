export interface SpringConfig {
  stiffness: number
  damping: number
  mass?: number
  restSpeed?: number
  restDelta?: number
}

const active = new Set<Spring>()
let frame = 0
let last = 0

function tick(now: number): void {
  const dt = Math.min(0.064, Math.max(0, (now - last) / 1000))
  last = now
  for (const s of [...active]) {
    if (s.step(dt)) continue
    active.delete(s)
    s.rested()
  }
  frame = active.size ? requestAnimationFrame(tick) : 0
}

function wake(s: Spring): void {
  active.add(s)
  if (frame) return
  last = performance.now()
  frame = requestAnimationFrame(tick)
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export class Spring {
  value: number
  target: number
  velocity = 0
  private config: Required<SpringConfig> | null = null

  constructor(
    value: number,
    private readonly onChange: (value: number) => void,
    private readonly onRest?: () => void
  ) {
    this.value = value
    this.target = value
  }

  to(target: number, config: SpringConfig): void {
    if (reducedMotion()) return this.set(target)
    this.target = target
    this.config = { mass: 1, restSpeed: 0.01, restDelta: 0.001, ...config }
    if (this.value === target && this.velocity === 0) return this.onRest?.()
    wake(this)
  }

  set(value: number): void {
    active.delete(this)
    this.value = value
    this.target = value
    this.velocity = 0
    this.onChange(value)
    this.onRest?.()
  }

  stop(): void {
    active.delete(this)
    this.velocity = 0
  }

  get moving(): boolean {
    return active.has(this)
  }

  rested(): void {
    this.onRest?.()
  }

  step(dt: number): boolean {
    const c = this.config
    if (!c) return false
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const force = -c.stiffness * (this.value - this.target) - c.damping * this.velocity
      this.velocity += (force / c.mass) * h
      this.value += this.velocity * h
    }
    if (Math.abs(this.velocity) <= c.restSpeed && Math.abs(this.target - this.value) <= c.restDelta) {
      this.value = this.target
      this.velocity = 0
      this.onChange(this.value)
      return false
    }
    this.onChange(this.value)
    return true
  }
}
