/**
 * The colourful light that rises from the bottom of the terminal while you talk to the voice agent.
 *
 * All of it is one small canvas and one shader. Each frame hands the shader five numbers (the time,
 * how loud, where, how visible, which theme) and the graphics card works every pixel out at once,
 * softness included: nothing is blurred afterwards and no style changes, so the page has almost no
 * work to do. The canvas is drawn at half the screen's resolution, which a light this soft never
 * shows, and only while there is something to see.
 */

/** Moves toward a target, quickly on the way up and slowly on the way down, the way a meter does. */
export function approach(current: number, target: number, dt: number, attack: number, release: number): number {
  if (dt <= 0 || current === target) return current
  const tau = target > current ? attack : release
  return current + (target - current) * (1 - Math.exp(-dt / tau))
}

/** A voice's loudness, 0 to 1: the hiss of a quiet room is nothing, and ordinary speech fills most of it. */
export function loudness(level: number): number {
  return Math.min(1, Math.max(0, level - 0.03) / 0.55)
}

/** Where the light is, 0 to 1 across, while the agent works its answer out: side to side, from the middle. */
export function sweep(seconds: number): number {
  return 0.5 + 0.32 * Math.sin(seconds * 1.7)
}

export interface GlowInput {
  /** Someone is talking or being answered, or an answer is being worked out. */
  active: boolean
  /** The answer is being worked out: the light travels instead of following a voice. */
  processing: boolean
  /** How loud the voice being followed is, 0 to 1, before shaping. */
  level: number
  light: boolean
}

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uSize;
uniform float uTime;
uniform float uLevel;
uniform float uCenter;
uniform float uAlpha;
uniform float uLight;

// One patch of coloured light standing on the bottom edge, softer the further from its middle.
vec3 lobe(vec2 p, float x, float w, float h, vec3 c) {
  float dx = (p.x - x) / w;
  float dy = p.y / h;
  return c * exp(-dx * dx - dy * dy);
}

// Turns a colour around the grey axis: the slow drift of the whole light through its hues.
vec3 turn(vec3 c, float a) {
  vec3 k = vec3(0.57735);
  float co = cos(a);
  return c * co + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - co);
}

void main() {
  float aspect = uSize.x / uSize.y;
  float lv = uLevel;
  // How wide and how tall the light stands, in heights of the canvas; both grow with the voice.
  float w = 0.4 + 0.22 * lv;
  float h = 0.14 + 0.46 * lv;
  vec2 p = vec2((vUv.x - uCenter) * aspect / w, vUv.y / h);
  float t = uTime;

  // Green and teal lean in from the left, pink and violet from the right, each swelling in its
  // own time and drifting slowly across, with a pale core where they meet the edge.
  float flow = 0.22 * sin(t * 0.5);
  float b1 = 0.78 + 0.22 * sin(t * 3.1);
  float b2 = 0.78 + 0.22 * sin(t * 2.3 + 1.7);
  float b3 = 0.78 + 0.22 * sin(t * 2.7 + 3.1);
  vec3 col = vec3(0.0);
  col += lobe(p, -0.95 + flow, 0.75, 0.55 * b1, vec3(0.30, 0.72, 0.52));
  col += lobe(p, -0.35 + flow * 0.6, 0.70, 0.85 * b2, vec3(0.26, 0.62, 0.80));
  col += lobe(p, 0.35 - flow * 0.6, 0.72, 0.95 * b3, vec3(0.86, 0.36, 0.62));
  col += lobe(p, 0.98 - flow, 0.72, 0.60 * b1, vec3(0.62, 0.34, 0.78));
  col *= 0.5;
  // Lilac on a dark terminal; on a light one a pale core would be white on white, so it is mint there.
  col += lobe(p, 0.0, 0.38, 0.32, mix(vec3(0.55, 0.62, 0.90), vec3(0.40, 0.85, 0.72), uLight)) * 0.2;
  col = turn(col, 0.35 * sin(t * 0.22));
  // A touch of grey in every colour: the light reads as glass rather than neon.
  col = mix(vec3(dot(col, vec3(0.3333))), col, 0.85);

  // A thin bright line along the bottom edge under the light, teal on one side and lilac on the other.
  float px = vUv.y * uSize.y;
  float line = exp(-px / 1.6) * exp(-pow(p.x / 1.6, 2.0)) * (0.35 + 0.5 * lv);
  col += mix(vec3(0.35, 0.85, 0.80), vec3(0.75, 0.55, 0.95), smoothstep(-1.2, 1.2, p.x)) * line;

  col = max(col, 0.0);
  float glow = min(1.0, max(col.r, max(col.g, col.b)));
  // Dark: light added to the terminal. Light: the same hues laid over it thinly, as pastels.
  vec4 dark = vec4(min(col, vec3(1.0)), glow);
  // Where the colours meet they tend to white, which vanishes on white: they are pulled apart there.
  // Measured by the colour's length rather than its brightest channel, which creased where two met.
  float amount = length(col);
  vec3 hue = clamp(1.0 - (1.0 - col / max(amount * 0.62, 0.001)) * 1.5, 0.0, 1.0);
  float thin = min(1.0, amount * 0.85) * 0.6;
  vec4 light = vec4(hue * thin, thin);
  gl_FragColor = mix(dark, light, uLight) * uAlpha;
}`

/** Draws half as many pixels each way as the screen has: the light is soft enough that it never shows. */
const RESOLUTION = 0.5
/**
 * About forty frames a second, whatever the screen's rate. Every frame of the light makes the whole
 * window be put together again, and at sixty that alone cost a quarter of a core; a light this soft
 * and slow looks no different at forty, at a small part of that.
 */
const FRAME_MS = 1000 / 40 - 2

export class VoiceGlowRenderer {
  private gl: WebGLRenderingContext | null
  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  private frame = 0
  private last = 0
  private start = performance.now()
  private level = 0
  private alpha = 0
  private center = 0.5
  private phase = 0
  /** The canvas's size on the page, kept from the last resize so no frame has to ask for it. */
  private width = 1
  private height = 1
  private sized = new ResizeObserver(() => this.resize())
  /**
   * A canvas of its own, made here and thrown away with the renderer. Its graphics context is let
   * go on the way out, since the page only keeps a few and the terminals need theirs, and a canvas
   * whose context was let go cannot draw again: handed the same one twice, as React does when it
   * mounts a component twice in development, the glow came out as a white box with a broken image.
   */
  private canvas = document.createElement('canvas')

  constructor(
    host: HTMLElement,
    private read: () => GlowInput
  ) {
    host.appendChild(this.canvas)
    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
    this.gl = gl && this.compile(gl) ? gl : null
    this.sized.observe(this.canvas)
    this.resize()
  }

  /** Starts drawing if it had stopped; it stops by itself once the light has faded out. */
  wake(): void {
    if (!this.gl || this.frame) return
    this.last = 0
    this.frame = requestAnimationFrame((t) => this.tick(t))
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.sized.disconnect()
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
    this.gl = null
    this.canvas.remove()
  }

  private tick(now: number): void {
    this.frame = 0
    const gl = this.gl
    if (!gl) return
    if (this.last && now - this.last < FRAME_MS) {
      this.frame = requestAnimationFrame((t) => this.tick(t))
      return
    }
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60
    this.last = now
    const input = this.read()
    // While the answer is worked out the light keeps a steady size and travels; otherwise it follows the voice.
    const target = input.processing ? 0.35 : input.active ? Math.max(0.08, loudness(input.level)) : 0
    this.level = approach(this.level, target, dt, 0.06, 0.28)
    this.alpha = approach(this.alpha, input.active ? 1 : 0, dt, 0.12, 0.3)
    if (input.processing) this.phase += dt
    this.center = approach(this.center, input.processing ? sweep(this.phase) : 0.5, dt, 0.15, 0.15)
    if (!input.processing && Math.abs(this.center - 0.5) < 0.001) this.phase = 0

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(this.uniforms.uSize!, this.width, this.height)
    gl.uniform1f(this.uniforms.uTime!, (now - this.start) / 1000)
    gl.uniform1f(this.uniforms.uLevel!, this.level)
    gl.uniform1f(this.uniforms.uCenter!, this.center)
    gl.uniform1f(this.uniforms.uAlpha!, this.alpha)
    gl.uniform1f(this.uniforms.uLight!, input.light ? 1 : 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // Faded out with nothing to show: stop until woken, leaving the canvas clear.
    if (!input.active && this.alpha < 0.004) {
      this.alpha = 0
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }
    this.frame = requestAnimationFrame((t) => this.tick(t))
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1
    this.width = this.canvas.clientWidth || 1
    this.height = this.canvas.clientHeight || 1
    const w = Math.max(1, Math.round(this.width * dpr * RESOLUTION))
    const h = Math.max(1, Math.round(this.height * dpr * RESOLUTION))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.gl?.viewport(0, 0, w, h)
  }

  private compile(gl: WebGLRenderingContext): boolean {
    const shader = (type: number, source: string): WebGLShader | null => {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, source)
      gl.compileShader(s)
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
    }
    const vs = shader(gl.VERTEX_SHADER, VERTEX)
    const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return false
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false
    gl.useProgram(program)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    for (const name of ['uSize', 'uTime', 'uLevel', 'uCenter', 'uAlpha', 'uLight']) this.uniforms[name] = gl.getUniformLocation(program, name)
    return true
  }
}
