// StormCloudTransition renderer and CloudTransitionMask: volumetric storm clouds drawn by a small
// fragment shader (domain-warped fractal noise in three drifting layers). WebGL is used because organic,
// non-repeating, internally lit clouds are not achievable with sprites at this cost; without WebGL a
// soft 2D cloud veil stands in. Output is premultiplied alpha, so the page shows through thin cloud.

export type CloudFrame = {
  /** Cloud cover 0..1. */
  cover: number;
  /** 0 = clouds arriving from the edges, 1 = clouds parting from the centre. */
  phase: number;
  /** Lightning 0..1 at (flashX, flashY) in 0..1 screen space (y up). */
  flash: number; flashX: number; flashY: number;
  /** Upper bound on opacity (the entrance keeps a little of the page visible). */
  maxAlpha: number;
};

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime, uCover, uPhase, uFlash, uSeed, uMaxAlpha; uniform vec2 uFlashPos;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= .5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime;
  // Clouds roll apart from the centre as they part.
  vec2 away = p - vec2(.5 * aspect, .5);
  float open = uPhase * (1. - uCover);
  vec2 drift = normalize(away + 1e-4) * open * .38;
  vec2 q1 = (p - drift * .6) * 1.5 + vec2(t * .035, t * .006) + uSeed;
  vec2 q2 = (p - drift) * 2.6 + vec2(-t * .048, t * .011) + uSeed * 1.7;
  vec2 q3 = (p - drift * 1.45) * 4.3 + vec2(t * .085, -t * .018) + uSeed * 2.3;
  vec2 w = vec2(fbm(q1 + 3.1), fbm(q1 + 7.7));
  float far = fbm(q1 + w * 1.4);
  float mid = fbm(q2 + w * .9);
  float near = fbm(q3 + w * .6);
  float density = clamp(far * .55 + mid * .35 + near * .22 - .04, 0., 1.);
  // Arrival order: entry edges first while covering; the centre opens first while parting.
  float edge = min(min(uv.x, 1. - uv.x), 1. - uv.y * .8);
  float centre = length((uv - .5) * vec2(aspect * .8, 1.));
  float order = mix(clamp(edge * 2.3, 0., 1.), clamp(1. - centre * 1.3, 0., 1.), uPhase);
  // Fully clear at cover 0, fully opaque at cover 1 whatever the local density.
  float m = uCover * 1.8 - order * .8 - .3 + (density - .5) * .7;
  float alpha = smoothstep(0., .34, m) * smoothstep(0., .1, uCover) * uMaxAlpha;
  float thick = smoothstep(.28, .82, density);
  // Light from above scatters on thin billow edges (no glowing outlines).
  float lit = clamp((mid - fbm(q2 + w * .9 + vec2(-.05, .09))) * 4.5, 0., 1.) * (1. - thick * .55);
  vec3 col = mix(vec3(.23, .26, .31), vec3(.07, .075, .09), thick);
  col = mix(col, vec3(.05, .07, .14), smoothstep(.42, .9, far) * .6);
  col = mix(col, vec3(.078, .169, .349), smoothstep(.5, .95, mid) * (1. - uv.y) * .4);
  col = mix(col, vec3(.16, .22, .33), near * .22);
  col += vec3(.58, .63, .71) * lit * .3;
  // Distant rain curtains hanging below the cloud base.
  float curtain = fbm(vec2(p.x * 22. + t * .35, p.y * 1.3 - t * 2.4));
  col += vec3(.5, .56, .66) * smoothstep(.56, .8, curtain) * (1. - uv.y) * .07 * thick;
  // Lightning lights the cloud from within: through thin cloud, softly inside thick cloud. Capped.
  float d = length((uv - uFlashPos) * vec2(aspect, 1.));
  float glow = uFlash * exp(-d * 3.1) * (.35 + .65 * (1. - thick * .7));
  col += vec3(.7, .76, .93) * glow * .5 + vec3(.36, .4, .5) * uFlash * .07;
  gl_FragColor = vec4(min(col, vec3(.85)) * alpha, alpha);
}`;

export class StormClouds {
  readonly webgl: boolean;
  private gl: WebGLRenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private seed = Math.random() * 40;
  private scale = 0.5;

  constructor(readonly canvas: HTMLCanvasElement) {
    let gl: WebGLRenderingContext | null = null;
    try { gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch { gl = null; }
    if (gl && this.init(gl)) { this.gl = gl; this.webgl = true; }
    else { this.webgl = false; this.ctx2d = canvas.getContext('2d'); }
  }

  private init(gl: WebGLRenderingContext) {
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type); if (!s) return null;
      gl.shaderSource(s, src); gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return false;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uTime', 'uCover', 'uPhase', 'uFlash', 'uFlashPos', 'uSeed', 'uMaxAlpha']) this.uniforms[n] = gl.getUniformLocation(prog, n);
    return true;
  }

  /** Sizes the drawing buffer; soft clouds render at a fraction of the screen resolution. */
  resize(width: number, height: number, mobile: boolean) {
    this.scale = mobile ? 0.34 : 0.5;
    this.canvas.width = Math.max(2, Math.round(width * this.scale));
    this.canvas.height = Math.max(2, Math.round(height * this.scale));
    this.seed = Math.random() * 40;
  }

  render(timeMs: number, f: CloudFrame) {
    const { width, height } = this.canvas;
    if (this.gl) {
      const gl = this.gl, u = this.uniforms;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(u['uRes']!, width, height);
      gl.uniform1f(u['uTime']!, (timeMs / 1000) % 1000);
      gl.uniform1f(u['uCover']!, f.cover);
      gl.uniform1f(u['uPhase']!, f.phase);
      gl.uniform1f(u['uFlash']!, f.flash);
      gl.uniform2f(u['uFlashPos']!, f.flashX, f.flashY);
      gl.uniform1f(u['uSeed']!, this.seed);
      gl.uniform1f(u['uMaxAlpha']!, f.maxAlpha);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    // Fallback: overlapping soft cloud masses in storm tones.
    const ctx = this.ctx2d; if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const a = Math.min(1, f.cover) * f.maxAlpha;
    if (a <= 0) return;
    for (let i = 0; i < 14; i++) {
      const fx = (i * 0.6180339 + this.seed) % 1, fy = (i * 0.4142135 + this.seed * 0.3) % 1;
      const spread = f.phase ? (1 - f.cover) * 0.4 : 0;
      const x = (fx + (fx - 0.5) * spread) * width, y = (fy + (fy - 0.5) * spread) * height;
      const r = Math.max(width, height) * (0.28 + (i % 4) * 0.07);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = i % 3 === 0 ? '20,43,89' : i % 3 === 1 ? '28,31,38' : '52,60,74';
      g.addColorStop(0, `rgba(${tone},${(a * 0.9).toFixed(3)})`);
      g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
    }
    if (f.flash > 0) { ctx.fillStyle = `rgba(190,205,235,${(f.flash * 0.12 * a).toFixed(3)})`; ctx.fillRect(0, 0, width, height); }
  }

  clear() {
    if (this.gl) { this.gl.clearColor(0, 0, 0, 0); this.gl.clear(this.gl.COLOR_BUFFER_BIT); }
    else this.ctx2d?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
