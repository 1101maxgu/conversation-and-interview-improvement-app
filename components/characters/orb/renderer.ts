// Draws every orb on the page with one WebGL2 context. Browsers allow only a handful of WebGL contexts per page, so
// each orb is a plain 2D canvas: one shared loop renders an orb into a hidden WebGL canvas, then copies the picture
// across. Orbs that are off screen are skipped. If WebGL2 is missing or the context is lost, nothing is drawn and the
// CSS gradient circle under each canvas stays visible.
import type { OrbSpec } from "./specs";

/** The orb's radius as a share of half its box. The rest is room for the rim bumps and the glow. */
export const ORB_RADIUS = 0.72;

/** What an orb looks like right now. `time` is its own flow clock; the levels are 0..1. */
export type OrbFrame = {
  time: number;
  level: number;
  think: number;
  listen: number;
  gain: number;
  tint: [number, number, number];
  /** Mood looks, all eased by the caller: colour strength, dark pockets, tremble, sparkle, lean direction, tight shape. */
  sat: number;
  deep: number;
  trem: number;
  spark: number;
  lean: [number, number];
  tight: number;
};

const MAX_PX = 900;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uClock, uLevel, uThink, uListen, uGain, uRipple, uSwirl, uSeed, uSat, uDeep, uTrem, uSpark, uTight;
uniform vec2 uLean;
uniform vec3 uCol[7];
uniform vec3 uTint;
uniform vec3 uHarm[3]; // lobes, phase, size
out vec4 o;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// Integer hash: exact for every grid point, so neighbouring cells always agree and no seams appear.
float lat(vec2 i) {
  uvec2 u = uvec2(ivec2(i) + 4096) * uvec2(1597334673u, 3812015801u);
  return float((u.x ^ u.y) * 1597334673u) * (1. / 4294967295.);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(lat(i), lat(i + vec2(1., 0.)), f.x), mix(lat(i + vec2(0., 1.)), lat(i + vec2(1., 1.)), f.x), f.y);
}
// Soft cloud noise: three layers, each finer and much fainter, so the clouds stay big and smooth.
float fbm(vec2 p) {
  float a = .6, v = 0.;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 1.9 + 7.3; a *= .38; }
  return v;
}
void main() {
  vec2 p = gl_FragCoord.xy / uRes * 2. - 1.;
  float d = length(p), th = atan(p.y, p.x);

  // The rim: a circle that swells and wobbles with the voice, plus rounded bumps, plus one soft bump circling while thinking.
  float bump = 0.;
  for (int i = 0; i < 3; i++) bump += uHarm[i].z * pow(.5 + .5 * sin(uHarm[i].x * th + uHarm[i].y), 1.6);
  float r = ${ORB_RADIUS} * (1. - .06 * uTight + .01 * sin(uClock * .9) + .07 * uLevel + uLevel * uGain * bump
    + uLevel * .025 * sin(2. * th + uClock * 4.5)
    + uTrem * (.007 * sin(9. * th + uClock * 13.) + .005 * sin(5. * th - uClock * 9.))
    + uThink * .028 * pow(max(0., cos(th - uClock * 1.7)), 6.));
  float aa = 3.5 / uRes.x;
  float mask = 1. - smoothstep(r - aa, r + aa, d);

  // Position on the sphere, then clouds of gas: noise bent by more noise, so it billows instead of folding.
  vec2 q = p / r;
  float z = sqrt(max(0., 1. - dot(q, q)));
  float ang = uSwirl * (uTime * .06 + .5 * (1. - length(q)));
  vec2 s = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (q * (1.15 - .35 * z)) * .6 + uSeed + uLean * .55;
  float t = uTime;
  float churn = 1. + 1.5 * uLevel; // the gas is stirred harder while speaking
  vec2 wv = vec2(fbm(s * 1.2 + vec2(0., t * .12)), fbm(s * 1.2 + vec2(5.2, -t * .1)));
  vec2 sw = s + (wv - .5) * 1.1 * churn;
  float n1 = fbm(sw + vec2(t * .05, 0.));
  float n2 = fbm(sw * .9 + vec2(3.7, t * .06));
  float n3 = fbm(sw * 1.3 + vec2(-t * .04, 8.1));
  float n4 = fbm(sw * .8 + vec2(11.3, 2.4 + t * .05));
  // A slow pressure wave from a wandering point. Stronger while speaking.
  vec2 c = .35 * vec2(sin(t * .31), cos(t * .23));
  n1 += sin(length(q - c) * uRipple * .6 - t * 2.) * (.01 + .05 * uLevel);

  // Each colour owns a cloud. Deep pockets where the gas is thin, pale cores where it is dense.
  vec3 deep = uCol[4] * (.8 - .25 * uDeep);
  vec3 col = mix(uCol[0], uCol[1], smoothstep(.2, .75, n1));
  col = mix(col, uCol[2], smoothstep(.3, .8, n2) * .85);
  col = mix(col, uCol[5], smoothstep(.35, .85, n3) * .8);
  col = mix(col, uCol[6], smoothstep(.4, .85, n4) * .7);
  col = mix(col, deep, (1. - smoothstep(.22, .62, n1 * .5 + n3 * .5)) * (.85 + .15 * uDeep));
  col = mix(col, uCol[3], smoothstep(.58, .92, n2 * .5 + n4 * .5) * .32); // pale cores, kept small so the colour stays

  // Nearly flat, like the reference orbs: just a soft sphere in the shading and a little depth at the edge.
  vec3 L = normalize(vec3(-.45 + uLean.x * .5, .6 + uLean.y * .5, .75));
  col *= .9 + .16 * (dot(normalize(vec3(q, z + .15)), L) * .5 + .5);
  col *= mix(.84, 1., smoothstep(0., .5, z));
  col *= 1. + .1 * uLevel; // it brightens a touch with the voice
  col = pow(max(col, 0.), vec3(1.08)); // a little more contrast
  col = mix(vec3(dot(col, vec3(.299, .587, .114))), col, 1.2 * uSat);
  col *= uTint;
  // Sparkle: a few tiny bright specks, only in happy and surprised moods.
  col += step(.9965, hash(floor(gl_FragCoord.xy / 2.) + floor(uClock * 14.))) * uSpark * .4;
  col += (hash(gl_FragCoord.xy + fract(uClock) * 91.) - .5) * .055; // moderate film grain

  // Outside the rim: a soft glow in the orb's colour, and a faint breathing ring while listening.
  float halo = exp(-max(d - r, 0.) * 9.) * (.12 + .4 * uLevel);
  float ring = uListen * .3 * (1. - smoothstep(0., .012, abs(d - r * 1.2 - .012 * sin(uClock * 2.2))));
  float a = mask + (1. - mask) * clamp(halo + ring, 0., 1.) * (1. - smoothstep(.82, 1., d));
  o = vec4(mix(mix(uCol[1], uCol[2], .5), clamp(col, 0., 1.), mask) * a, a);
}`;

const VERT = `#version 300 es
void main() { gl_Position = vec4(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1., 0., 1.); }`;

type Orb = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  spec: OrbSpec;
  colors: Float32Array;
  frame: (dt: number) => OrbFrame;
  /** Drawn once and left alone (portraits, reduced motion). */
  still: boolean;
  visible: boolean;
  dirty: boolean;
};

const orbs = new Set<Orb>();
let gl: WebGL2RenderingContext | null | undefined; // undefined = not tried yet, null = unavailable
let loc: Record<string, WebGLUniformLocation | null> = {};
let raf = 0;
let last = 0;
let odd = false;
let coarse: MediaQueryList | undefined;
let seen: IntersectionObserver | undefined;
let resized: ResizeObserver | undefined;

function setup(): WebGL2RenderingContext | null {
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!g) return null;
  const prog = g.createProgram();
  for (const [type, src] of [[g.VERTEX_SHADER, VERT], [g.FRAGMENT_SHADER, FRAG]] as const) {
    const sh = g.createShader(type);
    if (!sh) return null;
    g.shaderSource(sh, src);
    g.compileShader(sh);
    if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
      if (process.env.NODE_ENV !== "production") console.warn("[orb] shader did not compile", g.getShaderInfoLog(sh));
      return null;
    }
    g.attachShader(prog, sh);
  }
  g.linkProgram(prog);
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
    if (process.env.NODE_ENV !== "production") console.warn("[orb] shader failed", g.getProgramInfoLog(prog));
    return null;
  }
  g.useProgram(prog);
  loc = {};
  for (const name of ["uRes", "uTime", "uClock", "uLevel", "uThink", "uListen", "uGain", "uRipple", "uSwirl", "uSeed", "uSat", "uDeep", "uTrem", "uSpark", "uTight", "uLean", "uCol", "uTint", "uHarm"]) {
    loc[name] = g.getUniformLocation(prog, name);
  }
  // Lost context (GPU reset, too many tabs): fall back to the CSS circles for good.
  canvas.addEventListener("webglcontextlost", () => {
    gl = null;
    cancelAnimationFrame(raf);
    // Wipe the last frame too, or it would sit on top of the CSS circle that takes over.
    orbs.forEach((o) => {
      o.canvas.removeAttribute("data-live");
      o.ctx.clearRect(0, 0, o.canvas.width, o.canvas.height);
    });
  });
  return g;
}

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function tick(now: number) {
  raf = 0;
  const g = gl;
  if (!g) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Phones and tablets: every other frame (about 30 a second) is plenty and saves battery.
  odd = !odd;
  coarse ??= matchMedia("(pointer: coarse)");
  const skip = odd && coarse.matches;
  let again = false;

  for (const o of orbs) {
    if (!o.visible) continue;
    if (o.still && !o.dirty) continue;
    again ||= !o.still;
    if (skip && !o.dirty) continue;
    const size = Math.min(MAX_PX, Math.round(o.canvas.clientWidth * Math.min(2, devicePixelRatio)));
    if (size < 2) continue;
    if (o.canvas.width !== size) o.canvas.width = o.canvas.height = size;
    const gc = g.canvas as HTMLCanvasElement;
    if (gc.width < size || gc.height < size) gc.width = gc.height = size;

    const f = o.frame(skip ? dt * 2 : dt);
    const clock = now / 1000;
    g.viewport(0, 0, size, size);
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
    g.uniform2f(loc.uRes, size, size);
    g.uniform1f(loc.uTime, f.time);
    g.uniform1f(loc.uClock, o.still ? 0 : clock); // no wrap: a wrap would make the motion jump once an hour
    g.uniform1f(loc.uLevel, f.level);
    g.uniform1f(loc.uThink, f.think);
    g.uniform1f(loc.uListen, f.listen);
    g.uniform1f(loc.uGain, f.gain);
    g.uniform1f(loc.uRipple, o.spec.ripple);
    g.uniform1f(loc.uSwirl, o.spec.swirl);
    g.uniform1f(loc.uSeed, o.spec.harmonics[0].phase * 7 + o.spec.ripple);
    g.uniform3fv(loc.uCol, o.colors);
    g.uniform3fv(loc.uTint, f.tint);
    g.uniform1f(loc.uSat, f.sat);
    g.uniform1f(loc.uDeep, f.deep);
    g.uniform1f(loc.uTrem, f.trem);
    g.uniform1f(loc.uSpark, f.spark);
    g.uniform1f(loc.uTight, f.tight);
    g.uniform2f(loc.uLean, f.lean[0], f.lean[1]);
    g.uniform3fv(loc.uHarm, o.spec.harmonics.flatMap((h) => [h.k, h.phase + (o.still ? 0 : clock) * h.speed, h.amp]));
    g.drawArrays(g.TRIANGLES, 0, 3);

    o.ctx.clearRect(0, 0, size, size);
    // The viewport sits in the bottom-left corner of the shared canvas.
    o.ctx.drawImage(gc, 0, gc.height - size, size, size, 0, 0, size, size);
    o.dirty = false;
    o.canvas.setAttribute("data-live", "");
  }
  if (again) raf = requestAnimationFrame(tick);
}

function kick() {
  if (!raf && gl) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

/** Starts drawing `spec` into `canvas`. Returns the function that stops it. */
export function mountOrb(canvas: HTMLCanvasElement, spec: OrbSpec, frame: (dt: number) => OrbFrame, still: boolean): () => void {
  if (gl === undefined) gl = setup();
  const ctx = canvas.getContext("2d");
  if (!gl || !ctx) return () => {};
  const orb: Orb = { canvas, ctx, spec, frame, still, visible: false, dirty: true, colors: new Float32Array(spec.colors.flatMap(hexToRgb)) };
  const find = (el: Element) => [...orbs].find((o) => o.canvas === el);
  seen ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const o = find(e.target);
      if (o) o.visible = e.isIntersecting;
    }
    kick();
  });
  resized ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const o = find(e.target);
      if (o) o.dirty = true;
    }
    kick();
  });
  orbs.add(orb);
  seen.observe(canvas);
  resized.observe(canvas);
  return () => {
    orbs.delete(orb);
    seen?.unobserve(canvas);
    resized?.unobserve(canvas);
  };
}
