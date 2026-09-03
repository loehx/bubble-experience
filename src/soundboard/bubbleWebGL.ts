const BUBBLE_REFRACTION_MAG = 1.22

const VERTEX_SHADER = `
attribute vec2 aUnit;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec2 uViewport;
varying vec2 vPixelPos;

void main() {
  vec2 pixel = uCenter + aUnit * uRadius;
  vPixelPos = pixel;
  gl_Position = vec4(
    (pixel.x / uViewport.x) * 2.0 - 1.0,
    1.0 - (pixel.y / uViewport.y) * 2.0,
    0.0,
    1.0
  );
}
`

const FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uBackground;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uHue;
uniform float uImmune;

varying vec2 vPixelPos;

vec3 hslToRgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = h / 60.0;
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  vec3 rgb;
  if (hp < 1.0) rgb = vec3(c, x, 0.0);
  else if (hp < 2.0) rgb = vec3(x, c, 0.0);
  else if (hp < 3.0) rgb = vec3(0.0, c, x);
  else if (hp < 4.0) rgb = vec3(0.0, x, c);
  else if (hp < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  float m = l - c * 0.5;
  return rgb + vec3(m);
}

void main() {
  vec2 delta = vPixelPos - uCenter;
  float dist = length(delta / uRadius);
  if (dist > 1.0) discard;

  vec2 samplePixel = uCenter + delta / ${BUBBLE_REFRACTION_MAG.toFixed(2)};
  vec2 uv = vec2(
    samplePixel.x / uViewport.x,
    1.0 - samplePixel.y / uViewport.y
  );
  vec3 color = texture2D(uBackground, uv).rgb;

  float edgeShade = smoothstep(0.68, 1.0, dist);
  color *= 1.0 - edgeShade * mix(0.0, 0.22, smoothstep(0.82, 1.0, dist));

  vec2 local = delta / uRadius;
  vec2 gradCenter = vec2(-0.28, -0.32);
  float gradDist = length(local - gradCenter) / 1.05;
  float immune = uImmune;

  vec3 tint = mix(vec3(1.0), hslToRgb(uHue, 0.72, 0.68), 0.35);
  float tintAlpha = mix(
    mix(0.3, 0.16, smoothstep(0.05, 0.42, gradDist)),
    mix(0.22, 0.1, smoothstep(0.05, 0.42, gradDist)),
    immune
  );
  tintAlpha *= 1.0 - smoothstep(0.42, 0.95, gradDist);
  color = mix(color, tint, tintAlpha);

  vec3 deepTint = hslToRgb(uHue, 0.55, 0.42);
  float deepAlpha = mix(0.06, 0.04, immune) * smoothstep(0.35, 0.72, gradDist) * (1.0 - smoothstep(0.72, 1.0, gradDist));
  color = mix(color, deepTint, deepAlpha);

  float strokeWidth = 1.2 / uRadius;
  if (dist > 1.0 - strokeWidth) {
    color = mix(color, vec3(1.0), mix(0.38, 0.22, immune));
  }

  if (immune < 0.5) {
    vec2 highlightCenter = vec2(-0.22, -0.26);
    float highlightDist = length(local - highlightCenter);
    if (highlightDist < 0.12) {
      color = mix(color, vec3(1.0), 0.82 * (1.0 - highlightDist / 0.12));
    }
  }

  float alpha = 1.0 - smoothstep(0.88, 1.0, dist);
  gl_FragColor = vec4(color, alpha);
}
`

export type BubbleDrawState = {
  x: number
  y: number
  radius: number
  hue: number
  immune: boolean
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader error'
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown program error'
    gl.deleteProgram(program)
    throw new Error(log)
  }
  return program
}

export class BubbleWebGLRenderer {
  private glCanvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private displayCanvas: HTMLCanvasElement
  private displayCtx: CanvasRenderingContext2D
  private program: WebGLProgram
  private quadBuffer: WebGLBuffer
  private texture: WebGLTexture
  private viewport = { width: 0, height: 0 }
  private unitLocation: number

  private readonly uniforms: {
    center: WebGLUniformLocation | null
    radius: WebGLUniformLocation | null
    viewport: WebGLUniformLocation | null
    background: WebGLUniformLocation | null
    hue: WebGLUniformLocation | null
    immune: WebGLUniformLocation | null
  }

  constructor(displayCanvas: HTMLCanvasElement) {
    this.displayCanvas = displayCanvas
    const displayCtx = displayCanvas.getContext('2d')
    if (!displayCtx) throw new Error('2D display context required')
    this.displayCtx = displayCtx

    this.glCanvas = document.createElement('canvas')
    const gl =
      this.glCanvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: true,
      }) ??
      this.glCanvas.getContext('experimental-webgl', {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: true,
      })

    if (!gl) throw new Error('WebGL not supported')

    this.gl = gl as WebGLRenderingContext
    this.program = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER)
    this.unitLocation = this.gl.getAttribLocation(this.program, 'aUnit')
    this.uniforms = {
      center: this.gl.getUniformLocation(this.program, 'uCenter'),
      radius: this.gl.getUniformLocation(this.program, 'uRadius'),
      viewport: this.gl.getUniformLocation(this.program, 'uViewport'),
      background: this.gl.getUniformLocation(this.program, 'uBackground'),
      hue: this.gl.getUniformLocation(this.program, 'uHue'),
      immune: this.gl.getUniformLocation(this.program, 'uImmune'),
    }

    this.quadBuffer = this.gl.createBuffer()
    if (!this.quadBuffer) throw new Error('Failed to create quad buffer')

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer)
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]),
      this.gl.STATIC_DRAW,
    )

    const texture = this.gl.createTexture()
    if (!texture) throw new Error('Failed to create texture')
    this.texture = texture

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)

    this.gl.useProgram(this.program)
    this.gl.uniform1i(this.uniforms.background, 0)
    this.gl.enable(this.gl.BLEND)
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA)
  }

  resize(width: number, height: number, dpr: number) {
    this.viewport = { width, height }
    const pixelWidth = Math.floor(width * dpr)
    const pixelHeight = Math.floor(height * dpr)

    this.glCanvas.width = pixelWidth
    this.glCanvas.height = pixelHeight
    this.gl.viewport(0, 0, pixelWidth, pixelHeight)
  }

  setBackground(source: HTMLCanvasElement | HTMLImageElement) {
    const { gl, texture } = this
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  render(bubbles: BubbleDrawState[]) {
    const { gl, uniforms, viewport, displayCtx, displayCanvas, glCanvas } = this

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.enableVertexAttribArray(this.unitLocation)
    gl.vertexAttribPointer(this.unitLocation, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform2f(uniforms.viewport, viewport.width, viewport.height)

    for (const bubble of bubbles) {
      if (bubble.radius <= 0) continue

      gl.uniform2f(uniforms.center, bubble.x, bubble.y)
      gl.uniform1f(uniforms.radius, bubble.radius)
      gl.uniform1f(uniforms.hue, bubble.hue)
      gl.uniform1f(uniforms.immune, bubble.immune ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    displayCtx.setTransform(1, 0, 0, 1, 0, 0)
    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
    displayCtx.drawImage(glCanvas, 0, 0, displayCanvas.width, displayCanvas.height)
  }

  destroy() {
    const { gl } = this
    gl.deleteBuffer(this.quadBuffer)
    gl.deleteTexture(this.texture)
    gl.deleteProgram(this.program)
  }
}
