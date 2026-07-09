/* ===========================================================
   SHADERS
   Two ways to render the built-in WebGL effect:

   1. INLINE WINDOW — a `shader` block renders a small live canvas embedded in the
      content flow (.shader-window > .shader-canvas). These are per-page: created on
      each page view and disposed (context released) on navigation.

   2. FULL-SCREEN TAKEOVER — `:effect takeover` drives ONE persistent canvas at body
      level (#fxcanvas) that survives navigation; pages only reconfigure it.

   A single makeRenderer() powers both. Everything is gated off when fx is off,
   reduced-motion is requested, the tab is hidden, JS is absent, or a perf watchdog
   decides the device can't sustain it (software WebGL etc.).
   =========================================================== */
window.Shader = (function(){
  "use strict";

  // floating shares ambient's visuals (an opaque inline window) — it's a layout
  // treatment applied in CSS, not a different shader, so it maps to the same value.
  const EFFECTS = { ambient:0, floating:0, takeover:1 };

  const VERT = `
    attribute vec2 a_pos;
    void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

  const FRAG = `
    precision mediump float;
    uniform vec2  u_res;
    uniform float u_time;
    uniform float u_intensity;
    uniform float u_effect;
    uniform float u_opaque;
    uniform vec3  u_accent;
    uniform vec3  u_bg;

    float wave(vec2 p, float t){
      return sin(p.x*3.0 + t)*0.5
           + sin(p.y*2.3 - t*0.7)*0.5
           + sin((p.x+p.y)*1.7 + t*1.3)*0.5
           + sin(length(p-vec2(sin(t*0.3),cos(t*0.2)))*4.0 - t)*0.5;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p  = (uv - 0.5) * vec2(u_res.x/u_res.y, 1.0) * 3.0;
      float t = u_time;

      float v = wave(p, t);
      float field = 0.5 + 0.25 * v;

      float rings = sin(length(p)*6.0 - t*2.0)*0.5 + 0.5;
      field = mix(field, field*0.6 + rings*0.6, u_effect);

      float scan = 0.92 + 0.08 * sin(gl_FragCoord.y * 1.4 + t*2.0);
      field *= scan;

      float baseA = mix(0.16, 0.45, u_effect);
      float a = field * baseA * u_intensity;

      vec3 col = u_accent * (0.6 + 0.7 * field);
      // inline windows render OPAQUE (a solid little screen: accent plasma over the
      // theme background, so it suits light and dark palettes); the full-screen
      // background renders translucent so the page shows through it as a wash.
      vec3 solid = mix(u_bg, col, clamp(field, 0.0, 1.0));
      gl_FragColor = mix(vec4(col, a), vec4(solid, 1.0), u_opaque);
    }`;

  // Custom shaders (literate blocks) supply a Shadertoy-style mainImage(); we wrap
  // it with this preamble + main. #line 1 makes compile errors report the user's
  // own line numbers. Available inputs: iResolution (vec3), iTime, iAccent (vec3).
  const CUSTOM_PREAMBLE =
    // derivatives (fwidth/dFdx/dFdy) are an opt-in extension in WebGL1/GLSL ES 1.00;
    // `: enable` is a harmless warning where unsupported, so non-derivative shaders
    // are unaffected. The context must also gl.getExtension() it (see getContext below).
    "#extension GL_OES_standard_derivatives : enable\n" +
    // a free-running iTime needs more than mediump: mediump's step size grows with
    // magnitude (~value*2^-10), so after a while frame-to-frame time deltas round to
    // zero and the animation stutters. Prefer highp where the hardware has it; the
    // macro guard falls back to mediump rather than failing to compile.
    "#ifdef GL_FRAGMENT_PRECISION_HIGH\n" +
    "precision highp float;\n" +
    "#else\n" +
    "precision mediump float;\n" +
    "#endif\n" +
    "uniform vec3 iResolution;\n" +
    "uniform float iTime;\n" +
    "uniform vec3 iAccent;\n" +
    "uniform vec3 iBackground;\n" +
    "#line 1\n";
  const CUSTOM_MAIN =
    "\nvoid main(){ vec4 c = vec4(0.0,0.0,0.0,1.0); mainImage(c, gl_FragCoord.xy); gl_FragColor = c; }\n";

  // ---- shared state ---------------------------------------------------------
  const SCALES = [1, 0.66, 0.4];                 // render-resolution steps under load
  let perfKilled = false;
  let softwareChecked = false;
  let accent = [0.87, 0.64, 0.17];               // amber fallback (#dfa22c)
  let bgcol  = [0.04, 0.05, 0.04];               // theme --bg, base for opaque inline windows

  try { if(sessionStorage.getItem("shader-perf") === "slow") perfKilled = true; } catch(e){}
  if(navigator.connection && navigator.connection.saveData) perfKilled = true;

  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function hexToRgb(hex){
    if(!hex) return null;
    hex = hex.replace("#","").trim();
    if(hex.length === 3) hex = hex.split("").map(c=>c+c).join("");
    if(hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) return null;
    return [parseInt(hex.slice(0,2),16)/255, parseInt(hex.slice(2,4),16)/255, parseInt(hex.slice(4,6),16)/255];
  }
  function readAccent(){
    const c = hexToRgb(cssVar("--accent")) || hexToRgb(cssVar("--fg-bright"));
    if(c) accent = c;
    const b = hexToRgb(cssVar("--bg"));
    if(b) bgcol = b;
  }

  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fxOff = () => document.body.classList.contains("no-fx");
  const blocked = () => perfKilled || document.hidden || fxOff() || reduceMotion();

  function compile(gl, type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      const err = gl.getShaderInfoLog(s) || "compile failed";
      gl.deleteShader(s);
      return { err: err };
    }
    return { shader: s };
  }
  // Build a program from a fragment source (built-in FRAG or a wrapped custom one).
  // Returns { prog, loc } on success or { err } with the GLSL info log on failure.
  function buildProgram(gl, fragSrc){
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    if(vs.err) return { err: vs.err };
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    if(fs.err) return { err: fs.err };
    const prog = gl.createProgram();
    gl.attachShader(prog, vs.shader); gl.attachShader(prog, fs.shader); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { err: gl.getProgramInfoLog(prog) || "link failed" };
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(prog, n);   // null for uniforms a given program omits -> ignored on set
    return { prog, loc: {
      res: u("u_res"), time: u("u_time"), intensity: u("u_intensity"),
      effect: u("u_effect"), opaque: u("u_opaque"), accent: u("u_accent"), bg: u("u_bg"),
      iRes: u("iResolution"), iTime: u("iTime"), iAccent: u("iAccent"), iBg: u("iBackground"),
    }};
  }
  function checkSoftware(gl){
    if(softwareChecked) return;
    softwareChecked = true;
    try {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "") : "";
      if(/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(r)) perfKilled = true;
    } catch(e){}
  }

  // ---- declarative panel inputs ---------------------------------------------
  // A literate shader can declare panel controls in its GLSL as line comments; the
  // panel renders each and feeds the chosen value into a matching uniform — a
  // slider drives a `uniform float`, a select a `uniform int` (the chosen index):
  //   // @slider NAME MIN MAX DEFAULT [STEP]      -> a range slider (uniform float)
  //   // @select NAME DEFAULT_INDEX OPT0 OPT1 ..  -> a dropdown (uniform int = index)
  // and may declare that its iTime is periodic, which makes the panel grow a
  // video-style transport scrubber and wraps iTime to [0, DURATION):
  //   // @loop DURATION                            -> iTime loops over DURATION
  // Or bind a webfont glyph rendered offline to a `uniform sampler2D` — the
  // engine renders CHAR into an offscreen canvas at high resolution using the
  // site's monospace webfont (Inconsolata) and uploads it as an RGBA texture.
  // Three flavors, distinguished by the texture's alpha semantics and layout:
  //   // @glyph   NAME "TEXT"                      -> raster coverage mask
  //   // @sdf     NAME "TEXT" [SPREAD]             -> signed distance field
  //   // @tileset NAME "CHARS" [SPREAD]            -> SDF, one cell per char
  // The raster mask carries Canvas2D's 1-pixel-wide antialiased edge — cheap
  // but softens under magnification. The SDF post-processes the raster with a
  // 2D Felzenszwalb distance transform so every texel holds the (clipped)
  // signed distance to the nearest edge in pixels, packed into the alpha
  // channel over ±SPREAD (default 24) pixels. Alpha semantics match the mask
  // (0.5 at the edge, higher inside) so the shader math is identical — but
  // the boundary now ramps over 2·SPREAD texels, so `fwidth`-scaled AA keeps
  // the edge one-output-pixel crisp at any zoom. The tileset variant lays
  // each character into its own cell of an 8×8 grid, giving the shader a
  // lookup table indexed by character number — pick a slot and sample.
  // Companion uniforms the engine auto-sets when the shader declares them:
  //   uniform float <NAME>Aspect  = atlas W/H
  //   uniform vec2  <NAME>Grid    = (cols, rows)     [tileset]
  //   uniform float <NAME>Count   = filled cell count [tileset]
  function defaultStep(min, max){ const r = Math.abs(max - min); return r < 5 ? 0.01 : (r < 50 ? 0.1 : 1); }
  // a shader's iTime period (in iTime units), or 0 when it doesn't loop.
  function parseLoop(glsl){
    const m = glsl && /\/\/\s*@loop\s+([0-9.]+)/.exec(glsl);
    const v = m ? parseFloat(m[1]) : NaN;
    return isFinite(v) && v > 0 ? v : 0;
  }
  function parseInputs(glsl){
    const out = [];
    if(!glsl) return out;
    const re = /\/\/\s*@(slider|select)\s+([^\n]+)/g;
    let m;
    while((m = re.exec(glsl))){
      const parts = m[2].trim().split(/\s+/);
      const name = parts[0];
      if(!name) continue;
      if(m[1] === "slider"){
        const min = parseFloat(parts[1]), max = parseFloat(parts[2]), def = parseFloat(parts[3]);
        if([min, max, def].some(isNaN)) continue;
        const step = parts[4] != null ? parseFloat(parts[4]) : defaultStep(min, max);
        out.push({ kind:"slider", name, min, max, step, value:def, loc:null });
      } else {
        const def = parseInt(parts[1], 10) || 0;
        const opts = parts.slice(2);
        if(!opts.length) continue;
        out.push({ kind:"select", name, opts, value:Math.max(0, Math.min(opts.length - 1, def)), loc:null });
      }
    }
    return out;
  }
  // parse `@glyph NAME "TEXT"` and `@sdf NAME "TEXT" [SPREAD]` declarations.
  // TEXT is a character or string — quoted or a single bare token — that will
  // be rendered into an offscreen canvas and uploaded as a sampler2D. Single
  // characters get a square atlas; multi-character strings get a rectangular
  // one wide enough to fit the whole string, and the engine also sets a
  // companion `<NAME>Aspect` uniform (float, W/H) if the shader declares one.
  // SPREAD (SDF only) is the half-width of the distance-field ramp in pixels;
  // defaults to 24, which resolves cleanly on both the 2048² single-glyph
  // atlas and the 512-tall string atlas.
  function parseGlyphs(glsl){
    const out = [];
    if(!glsl) return out;
    const re = /\/\/\s*@(glyph|sdf|tileset)\s+(\S+)\s+(?:"([^"]*)"|(\S+))(?:\s+(\d+))?/g;
    let m;
    while((m = re.exec(glsl))){
      const kind = m[1];
      const name = m[2];
      const raw  = (m[3] != null ? m[3] : m[4]) || "";
      const text = raw || "?";
      const spread = (kind === "sdf" || kind === "tileset")
        ? (parseInt(m[5], 10) || 24) : 0;
      out.push({ name, text, kind, spread, tex: null, loc: null,
                 aspectLoc: null, aspect: 1.0,
                 gridLoc: null, countLoc: null, grid: [1, 1], count: 1,
                 unit: 0, ready: false });
    }
    return out;
  }
  // Felzenszwalb & Huttenlocher 2004: one-dimensional distance transform of a
  // sampled function in O(N). Overwrites f[q] with min_r (f0[r] + (q-r)²).
  // Scratch buffers `v` (parabola sources) and `z` (their boundaries) are
  // passed in so the 2D driver can reuse them across all rows and columns.
  function dt1d(f, n, v, z){
    // capture the original values so we can rewrite f in place
    const src = new Float64Array(n);
    for(let i = 0; i < n; i++) src[i] = f[i];
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] =  Infinity;
    for(let q = 1; q < n; q++){
      // intersection of the parabola from q with the current envelope
      let s = ((src[q] + q*q) - (src[v[k]] + v[k]*v[k])) / (2*(q - v[k]));
      while(s <= z[k]){
        k--;
        s = ((src[q] + q*q) - (src[v[k]] + v[k]*v[k])) / (2*(q - v[k]));
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k+1] = Infinity;
    }
    k = 0;
    for(let q = 0; q < n; q++){
      while(z[k+1] < q) k++;
      const dx = q - v[k];
      f[q] = dx*dx + src[v[k]];
    }
  }
  // 2D squared-Euclidean distance transform: rewrites f[i] with the squared
  // distance from pixel i to the nearest pixel where the input was 0.
  // Achieved as two sweeps of the 1D transform — down columns, then rows.
  function dt2d(f, w, h){
    const N = Math.max(w, h);
    const v = new Int32Array(N);
    const z = new Float64Array(N + 1);
    const col = new Float64Array(h);
    for(let x = 0; x < w; x++){
      for(let y = 0; y < h; y++) col[y] = f[y*w + x];
      dt1d(col, h, v, z);
      for(let y = 0; y < h; y++) f[y*w + x] = col[y];
    }
    const row = new Float64Array(w);
    for(let y = 0; y < h; y++){
      for(let x = 0; x < w; x++) row[x] = f[y*w + x];
      dt1d(row, w, v, z);
      for(let x = 0; x < w; x++) f[y*w + x] = row[x];
    }
  }
  // Build a signed-distance-field ImageData from a rasterized glyph. Reads the
  // canvas's alpha as the input mask (alpha > 127 = inside the glyph), runs a
  // squared-distance transform on both the mask and its inverse, subtracts to
  // get a signed distance in pixels (positive outside, negative inside), and
  // packs `alpha = clamp(0.5 - s/(2·spread), 0, 1)` — same convention as the
  // raster mask (high alpha inside, 0.5 at the edge), just with a ramp that
  // now spans 2·spread texels instead of 1.
  function canvasToSDF(canvas, spread){
    const w = canvas.width, h = canvas.height, N = w * h;
    const ctx = canvas.getContext("2d");
    const src = ctx.getImageData(0, 0, w, h).data;
    // finite "infinity" larger than any real squared distance so downstream
    // Felzenszwalb arithmetic stays defined (real max ≈ w² + h²)
    // must exceed w²+h² (the largest real squared distance on a w×h canvas);
    // the ×2 keeps intermediates safe for wide non-square string atlases too
    const INF = (w*w + h*h + 1) * 2;
    const fIn  = new Float64Array(N);   // 0 at glyph pixels — → dist to inside
    const fOut = new Float64Array(N);   // 0 at background   — → dist to outside
    for(let i = 0; i < N; i++){
      const inside = src[i*4 + 3] > 127;
      fIn[i]  = inside ? 0 : INF;
      fOut[i] = inside ? INF : 0;
    }
    dt2d(fIn,  w, h);
    dt2d(fOut, w, h);
    const out = new Uint8ClampedArray(N * 4);
    const denom = 2 * spread;
    for(let i = 0; i < N; i++){
      // signed distance in pixels: positive outside, negative inside
      const s = Math.sqrt(fIn[i]) - Math.sqrt(fOut[i]);
      let a = 0.5 - s / denom;
      if(a < 0) a = 0; else if(a > 1) a = 1;
      const j = i * 4;
      out[j] = 255; out[j+1] = 255; out[j+2] = 255;
      out[j+3] = Math.round(a * 255);
    }
    // Return the SDF as a canvas rather than raw ImageData. Some WebGL
    // implementations (notably ANGLE/SwiftShader) don't apply LINEAR
    // texture filtering correctly when texImage2D is fed an ImageData
    // object — they render as if NEAREST — so we always upload the
    // baked canvas, which drives the standard DOM-source upload path.
    const dst = document.createElement("canvas");
    dst.width = w; dst.height = h;
    dst.getContext("2d").putImageData(new ImageData(out, w, h), 0, 0);
    return dst;
  }
  // Render `text` into an offscreen canvas using the site's monospace webfont.
  // Single character -> square canvas at `size × size`; multi-character string
  // -> shorter, wider canvas whose width is measured from the text (so the
  // string SDF stays a manageable size regardless of length). The font is
  // loaded on demand via the Font Loading API; the returned promise resolves
  // to the canvas once the rasterizer has drawn the glyphs.
  const GLYPH_TEX_SIZE = 2048;      // single-character atlas dimension
  const GLYPH_STRING_H = 512;       // string-atlas height (per-glyph resolution)
  const GLYPH_FONT = "Inconsolata";
  async function renderGlyphCanvas(text, size){
    const isMulti = Array.from(text).length > 1;
    const height = isMulti ? GLYPH_STRING_H : size;
    const fontPx = Math.round(height * 0.9);
    const font = '700 ' + fontPx + 'px "' + GLYPH_FONT + '", monospace';
    // wait for the webfont before drawing so we don't rasterize the fallback
    if(document.fonts && document.fonts.load){
      try { await document.fonts.load(font); } catch(e){}
    }
    let width;
    if(isMulti){
      // measure the text so the canvas is exactly wide enough to fit it plus
      // a small horizontal margin for the SDF ramp to breathe past the edges
      const meas = document.createElement("canvas").getContext("2d");
      meas.font = font;
      const measured = Math.ceil(meas.measureText(text).width);
      const marginX = Math.round(height * 0.1);
      width = Math.max(height, measured + 2 * marginX);
    } else {
      width = height;
    }
    const cv = document.createElement("canvas");
    cv.width = width; cv.height = height;
    const ctx = cv.getContext("2d");
    if(!ctx) return cv;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Inconsolata's optical bounds sit slightly above the em center; nudge
    // the baseline down so uppercase letters land visually centered.
    ctx.font = font;
    ctx.fillText(text, width * 0.5, height * 0.53);
    return cv;
  }
  // Render each character of `chars` into its own cell of a `size × size`
  // canvas laid out as an 8×8 grid. Every cell is drawn at 90% of the cell
  // height (same as single-glyph rendering) so glyphs pack tightly on screen
  // — that still leaves a horizontal margin ~2× SPREAD around every character
  // (monospace glyph width ≈ 60% of font size), and a vertical margin
  // comfortably wider than SPREAD, so the whole-canvas distance transform
  // saturates fully between neighboring characters and cell A's SDF never
  // bleeds into cell B. Font is centered per-cell.
  const GLYPH_TILESET_COLS = 8;
  async function renderTilesetCanvas(chars, size){
    const arr = Array.from(chars);
    const cols = GLYPH_TILESET_COLS;
    const rows = cols;                             // square POT atlas
    const cellW = size / cols;
    const cellH = size / rows;
    const fontPx = Math.round(cellH * 0.9);
    const font = '700 ' + fontPx + 'px "' + GLYPH_FONT + '", monospace';
    if(document.fonts && document.fonts.load){
      try { await document.fonts.load(font); } catch(e){}
    }
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");
    if(!ctx) return { cv, grid: [cols, rows], count: 0 };
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = font;
    const count = Math.min(arr.length, cols * rows);
    for(let i = 0; i < count; i++){
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = (col + 0.5) * cellW;
      // Inconsolata's optical bounds sit slightly above the em center — same
      // 0.53 nudge as single-glyph rendering keeps uppercase visually centered
      const y = (row + 0.5) * cellH + cellH * 0.03;
      ctx.fillText(arr[i], x, y);
    }
    return { cv, grid: [cols, rows], count };
  }
  // Create a texture pre-populated with a 1×1 transparent pixel so shaders
  // that sample the sampler before the real glyph has uploaded see 0 alpha
  // (nothing) rather than an undefined sampler read.
  function createPlaceholderTexture(gl){
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  function elem(tag, cls, txt){ const e = document.createElement(tag); if(cls) e.className = cls; if(txt != null) e.textContent = txt; return e; }
  const fmtVal = v => String(Math.round(v * 100) / 100);
  const fmtTime = v => (Math.round(v * 10) / 10) + "s";
  function rangeRow(label, min, max, step, value, onInput){
    const row = elem("div", "shader-row");
    row.appendChild(elem("label", null, label));
    const input = elem("input"); input.type = "range";
    input.min = min; input.max = max; input.step = step; input.value = value;
    const out = elem("span", "shader-val", fmtVal(value));
    input.addEventListener("input", ()=>{ const v = parseFloat(input.value); out.textContent = fmtVal(v); onInput(v); });
    row.appendChild(input); row.appendChild(out);
    return row;
  }
  // speed gets a dedicated row: a logarithmic track so the useful range is reachable
  // across two-plus decades — far left is stopped, then 0.1x .. 100x with 1x ~a third
  // of the way in. The readout shows the actual multiplier.
  function speedRow(value, onInput){
    const LO = Math.log(0.1), SPAN = Math.log(100) - LO;
    const toSpeed = s => s <= 0 ? 0 : Math.exp(LO + s * SPAN);
    const toPos   = v => v <= 0 ? 0 : (Math.log(v) - LO) / SPAN;
    const fmt = v => (v <= 0 ? "0" : v < 10 ? String(Math.round(v * 100) / 100) : String(Math.round(v))) + "x";
    const row = elem("div", "shader-row");
    row.appendChild(elem("label", null, "speed"));
    const input = elem("input"); input.type = "range";
    input.min = 0; input.max = 1; input.step = 0.005; input.value = toPos(value);
    const out = elem("span", "shader-val", fmt(value));
    input.addEventListener("input", ()=>{ const v = toSpeed(parseFloat(input.value)); out.textContent = fmt(v); onInput(v); });
    row.appendChild(input); row.appendChild(out);
    return row;
  }
  // a video-style transport for looped shaders: scrub iTime across one loop. The
  // caller pauses accrual on onScrubStart, follows `phase` via onScrub while the
  // user drags (or arrow-keys) the track, and resumes from there on onScrubEnd.
  function transportRow(dur, value, onScrub, onScrubStart, onScrubEnd){
    const row = elem("div", "shader-row");
    row.appendChild(elem("label", null, "time"));
    const input = elem("input"); input.type = "range";
    input.min = 0; input.max = dur; input.step = Math.max(0.001, dur / 1000); input.value = value;
    const out = elem("span", "shader-val", fmtTime(value));
    input.addEventListener("pointerdown", onScrubStart);
    input.addEventListener("keydown", onScrubStart);
    input.addEventListener("pointerup", onScrubEnd);
    input.addEventListener("pointercancel", onScrubEnd);
    input.addEventListener("blur", onScrubEnd);
    input.addEventListener("change", onScrubEnd);
    input.addEventListener("input", ()=>{ const v = parseFloat(input.value); out.textContent = fmtTime(v); onScrub(v); });
    row.appendChild(input); row.appendChild(out);
    return { row, input, out };
  }
  function selectRow(label, opts, value, onChange){
    const row = elem("div", "shader-row shader-row-half");   // selects pack two per line
    row.appendChild(elem("label", null, label));
    const sel = elem("select");
    opts.forEach((o, i)=>{ const op = elem("option", null, o); op.value = String(i); if(i === value) op.selected = true; sel.appendChild(op); });
    sel.addEventListener("change", ()=> onChange(parseInt(sel.value, 10)));
    row.appendChild(sel);
    return row;
  }

  // ---- one renderer (drives a single canvas) --------------------------------
  function makeRenderer(canvas, isBg, controlsEl){
    let gl = null, prog = null, loc = {}, raf = 0, ro = null;
    let phase = 0, lastNow = 0;
    let running = false, ready = false, active = false, paused = false;
    let intensity = 0, targetIntensity = 0, effect = 0, targetEffect = 0;
    let scaleIdx = 0, pfFrames = 0, pfAccum = 0, pfLast = 0, pfWarm = 0;

    const opaque = isBg ? 0 : 1;   // inline = solid screen; background = translucent wash

    // control panel: an inline window's figure, or the floating background panel
    const playBtn = controlsEl && controlsEl.querySelector(".shader-play");

    // literate shaders: an inline window may carry its own GLSL (a Shadertoy-style
    // mainImage) in a <script class="shader-glsl">. If present, compile that instead
    // of the built-in shader; compile errors surface in the .shader-error overlay.
    // The background renderer starts empty and is fed a shader via setUserGlsl()
    // by the manager when a page's takeover marker carries custom GLSL.
    const figure = isBg ? null : canvas.closest(".shader-window");
    const glslEl = figure && figure.querySelector(".shader-glsl");
    const errEl  = figure && figure.querySelector(".shader-error");
    let userGlsl = glslEl ? glslEl.textContent.trim() : "";
    let fragSrc = userGlsl ? (CUSTOM_PREAMBLE + userGlsl + CUSTOM_MAIN) : FRAG;

    // controls panel: a global time-speed multiplier (every shader) + any custom
    // uniforms the literate GLSL declared via @slider/@select. The panel lives in
    // the figure and is revealed on pointer activity (see theme CSS + UI wiring below).
    let customInputs = parseInputs(userGlsl);
    let glyphInputs = parseGlyphs(userGlsl);              // @glyph -> sampler2D uniforms fed from an offscreen canvas
    let loopDur = parseLoop(userGlsl);                    // >0 -> iTime wraps + transport scrubber
    const panelEl = figure && figure.querySelector(".shader-panel");
    let speed = 1;
    let scrubbing = false;                               // user dragging the transport: pause accrual
    let transportInput = null, transportOut = null;

    function showError(msg){
      if(errEl){ errEl.textContent = msg; errEl.hidden = false; }
      else console.warn("[shader] " + msg);
    }
    function disposeGlyphTextures(){
      if(!gl) return;
      for(const g of glyphInputs){ if(g.tex){ gl.deleteTexture(g.tex); g.tex = null; } }
    }
    function build(){
      const b = buildProgram(gl, fragSrc);
      if(b.prog){
        if(prog) gl.deleteProgram(prog);        // release the previous one on a rebuild (setUserGlsl path)
        prog = b.prog; loc = b.loc; if(errEl) errEl.hidden = true;
        for(const c of customInputs) c.loc = gl.getUniformLocation(prog, c.name);
        // (re)create glyph textures on every build. Each glyph gets its own
        // texture unit; the placeholder makes the sampler safe to read while
        // the font-based rasterization completes asynchronously.
        disposeGlyphTextures();
        glyphInputs.forEach((g, i)=>{
          g.loc = gl.getUniformLocation(prog, g.name);
          // Optional companion uniforms the engine sets when the shader
          // declares them: aspect for any atlas, grid+count for tilesets.
          g.aspectLoc = gl.getUniformLocation(prog, g.name + "Aspect");
          g.gridLoc   = gl.getUniformLocation(prog, g.name + "Grid");
          g.countLoc  = gl.getUniformLocation(prog, g.name + "Count");
          g.unit = i;
          g.tex = createPlaceholderTexture(gl);
          g.ready = false;
          g.aspect = 1.0;
          g.grid = [1, 1];
          g.count = 1;
          const renderPromise = g.kind === "tileset"
            ? renderTilesetCanvas(g.text, GLYPH_TEX_SIZE)
            : renderGlyphCanvas(g.text, GLYPH_TEX_SIZE).then(cv => ({ cv }));
          renderPromise.then(result=>{
            if(!gl || !g.tex) return;           // context lost or shader swapped away
            const cv = result.cv;
            // SDF and tileset variants both run the whole-canvas distance
            // transform before upload; @glyph uploads the raw canvas.
            const payload = (g.kind === "sdf" || g.kind === "tileset")
              ? canvasToSDF(cv, g.spread) : cv;
            gl.bindTexture(gl.TEXTURE_2D, g.tex);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, payload);
            g.aspect = cv.width / cv.height;
            if(result.grid){ g.grid = result.grid; g.count = result.count; }
            g.ready = true;
            if(!running && active && !blocked()) renderStill();   // paused: repaint once the glyph lands
          }).catch(()=>{});
        });
        return true;
      }
      if(prog){ gl.deleteProgram(prog); prog = null; }
      showError(b.err);                          // keep the context; draw nothing; show the log
      return false;
    }

    // Swap the shader body and recompile in place. Called by the manager on the
    // persistent takeover canvas when a new page's takeover marker carries a
    // different custom GLSL body (or none -> revert to the built-in wave). No-op
    // when the source hasn't changed. Returns true on a successful compile.
    function setUserGlsl(next){
      next = (next || "").trim();
      if(next === userGlsl && prog) return true;
      disposeGlyphTextures();                    // drop old textures before parseGlyphs overwrites the list
      userGlsl = next;
      fragSrc = userGlsl ? (CUSTOM_PREAMBLE + userGlsl + CUSTOM_MAIN) : FRAG;
      customInputs = parseInputs(userGlsl);
      glyphInputs = parseGlyphs(userGlsl);
      loopDur = parseLoop(userGlsl);
      stop(false);                               // release current frame; caller re-activates
      if(!gl) return false;
      const ok = build();
      if(ok) size();
      return ok;
    }

    try {
      gl = canvas.getContext("webgl", { alpha:true, depth:false, antialias:false, premultipliedAlpha:false })
        || canvas.getContext("experimental-webgl", { alpha:true, depth:false, antialias:false });
    } catch(e){ gl = null; }
    // enable screen-space derivatives so literate shaders can use fwidth/dFdx/dFdy
    // (paired with the #extension line in CUSTOM_PREAMBLE); harmless null if absent.
    if(gl){ gl.getExtension("OES_standard_derivatives"); build(); checkSoftware(gl); }

    // Align the persistent background canvas with the reading column (<main>)
    // so a takeover shader centers on the prose rather than the whole viewport.
    // The measurement + CSS-var publication lives in Takeover.measureReadingColumn
    // (shared with the intro λ-logo, which also opts into the takeover chrome);
    // we just read the result back and apply it to the canvas.
    function positionBg(){
      const m = window.Takeover && Takeover.measureReadingColumn();
      if(!m) return null;
      canvas.style.left = m.left + "px";
      canvas.style.width = m.width + "px";
      // The canvas covers 100vh via the base CSS (inset:0), so use the
      // viewport height for the buffer — not main's height, which is the
      // whole scrolled page and would get squished into the viewport-tall
      // CSS box (pancake). Width follows main's box (aligned above).
      return { width: m.width, height: window.innerHeight };
    }

    function size(){
      if(!gl) return;
      const cap = Math.min(window.devicePixelRatio || 1, 1.5) * SCALES[scaleIdx];
      // Match the drawing buffer to the canvas's actual CSS box so the shader
      // renders 1:1. For the persistent background canvas we first align it
      // with <main> (positionBg), then read those dimensions back; inline
      // windows just use their own layout box.
      let cw, ch;
      if(isBg){
        const p = positionBg();
        cw = p ? p.width  : window.innerWidth;
        ch = p ? p.height : window.innerHeight;
      } else {
        cw = canvas.clientWidth  || 1;
        ch = canvas.clientHeight || 1;
      }
      const w = Math.max(1, Math.round(cw * cap));
      const h = Math.max(1, Math.round(ch * cap));
      if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    function clear(){ if(gl){ gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); } }

    function perfTick(now){
      if(pfWarm < 20){ pfWarm++; pfLast = now; return; }   // ignore warmup
      if(pfLast){ pfAccum += now - pfLast; pfFrames++; }
      pfLast = now;
      if(pfFrames < 45) return;                            // ~0.75s window
      const avg = pfAccum / pfFrames; pfFrames = 0; pfAccum = 0;
      if(avg <= 28) return;                                // >= ~36fps: fine
      if(scaleIdx < SCALES.length - 1){ scaleIdx++; size(); }   // shed pixels first
      else if(avg > 45) killAll();                         // minimal & still < ~22fps -> stop everything
    }

    function paint(){                                      // draw current state once
      gl.useProgram(prog);
      gl.uniform2f(loc.res, canvas.width, canvas.height);
      gl.uniform1f(loc.time, phase);
      gl.uniform1f(loc.intensity, intensity);
      gl.uniform1f(loc.effect, effect);
      gl.uniform1f(loc.opaque, opaque);
      gl.uniform3f(loc.accent, accent[0], accent[1], accent[2]);
      gl.uniform3f(loc.bg, bgcol[0], bgcol[1], bgcol[2]);
      // Shadertoy-style inputs for custom shaders (null locations are ignored)
      gl.uniform3f(loc.iRes, canvas.width, canvas.height, 1.0);
      gl.uniform1f(loc.iTime, phase);
      gl.uniform3f(loc.iAccent, accent[0], accent[1], accent[2]);
      gl.uniform3f(loc.iBg, bgcol[0], bgcol[1], bgcol[2]);
      // per-shader panel uniforms: a select drives a `uniform int`, a slider a
      // `uniform float` (null locations — unused/optimized-out — are ignored)
      for(const c of customInputs){
        if(!c.loc) continue;
        if(c.kind === "select") gl.uniform1i(c.loc, c.value | 0);
        else gl.uniform1f(c.loc, c.value);
      }
      // per-shader glyph textures: bind each to its assigned unit and point
      // its sampler2D uniform at that unit (unused samplers ignored); also
      // publish the atlas's W/H to the companion `<name>Aspect` uniform when
      // the shader has declared it
      for(const g of glyphInputs){
        if(!g.loc || !g.tex) continue;
        gl.activeTexture(gl.TEXTURE0 + g.unit);
        gl.bindTexture(gl.TEXTURE_2D, g.tex);
        gl.uniform1i(g.loc, g.unit);
        if(g.aspectLoc) gl.uniform1f(g.aspectLoc, g.aspect);
        if(g.gridLoc)   gl.uniform2f(g.gridLoc, g.grid[0], g.grid[1]);
        if(g.countLoc)  gl.uniform1f(g.countLoc, g.count);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if(!ready){ ready = true; canvas.classList.add("fx-ready"); }
      // keep the transport thumb tracking playback — but not while the user drags it
      if(transportInput && !scrubbing){ transportInput.value = phase; transportOut.textContent = fmtTime(phase); }
    }
    function frame(now){
      raf = 0;
      if(!running) return;
      perfTick(now);
      if(!running) return;                                 // perfTick may have killed us
      intensity += (targetIntensity - intensity) * 0.05;
      effect    += (targetEffect    - effect)    * 0.05;
      // scrubbing the transport pauses iTime accrual: the slider drives `phase`
      // directly and we resume from there on release (lastNow=0 avoids a dt jump).
      if(scrubbing){
        lastNow = 0;
      } else {
        if(!lastNow) lastNow = now;
        const dt = Math.min(0.05, (now - lastNow) / 1000); // clamp big gaps
        lastNow = now;
        phase += dt * (0.5 + 0.5 * effect) * speed;        // ambient half speed, takeover full; panel slider scales it
        if(loopDur > 0) phase %= loopDur;                  // looped shaders wrap iTime to the loop window
      }
      paint();
      raf = requestAnimationFrame(frame);
    }
    function renderStill(){                                 // one static frame at full strength (paused preview)
      if(!gl || !prog) return;
      intensity = targetIntensity; effect = targetEffect;
      paint();
    }

    function start(){
      if(running || !gl || !prog) return;
      running = true;
      lastNow = 0; pfFrames = 0; pfAccum = 0; pfWarm = 0;
      if(!raf) raf = requestAnimationFrame(frame);
    }
    function stop(keepFrame){
      running = false;
      if(raf){ cancelAnimationFrame(raf); raf = 0; }
      if(!keepFrame){ ready = false; canvas.classList.remove("fx-ready"); clear(); }
    }
    function sync(){
      if(active && gl && !blocked() && !paused){ start(); return; }
      const freeze = paused && active && !blocked();       // user-paused: hold a static frame
      stop(freeze);
      if(freeze && !ready) renderStill();                  // first paused view -> static preview
    }

    function configure(cfg){
      cfg = cfg || {};
      const e = typeof cfg.effect === "string" ? (EFFECTS[cfg.effect] ?? 0) : (cfg.effect || 0);
      targetEffect = e;
      if(cfg.intensity != null){
        const n = parseFloat(cfg.intensity);
        if(!isNaN(n)){ targetIntensity = Math.max(0, Math.min(1, n)); return; }
      }
      targetIntensity = e >= 1 ? 1.0 : 0.8;
    }

    // single play/stop toggle: stopping rewinds to the start (t=0) so play always
    // begins fresh — there's no separate reset.
    function setPaused(p){
      paused = !!p;
      if(paused){ phase = 0; lastNow = 0; }
      if(controlsEl){
        controlsEl.classList.toggle("paused", paused);
        if(playBtn) playBtn.setAttribute("aria-label", paused ? "Play" : "Stop");
      }
      sync();
      if(paused && gl && active && !blocked()) renderStill();   // show the rewound t=0 frame
    }

    function activate(on){
      active = !!on;
      if(isBg && controlsEl) controlsEl.classList.toggle("on", active);   // show the floating panel only while a takeover is live
      size(); sync();
    }

    // theme changed: running renderers pick up `accent` on the next frame, but a
    // paused/stopped window holds a static frame — repaint it with the new color.
    function refreshColor(){ if(!running && gl && prog && active && !blocked()) renderStill(); }

    // fill the panel: a speed slider for every shader, then any declared uniforms.
    // A paused window repaints on change so the new value shows; speed only matters
    // while running, so it skips the repaint.
    function buildPanel(){
      const rows = panelEl && panelEl.querySelector(".shader-rows");
      if(!rows) return;
      const repaint = ()=>{ if(!running && active && !blocked()) renderStill(); };
      // a looped shader leads with a transport scrubber: drag it and accrual pauses
      // while iTime follows the slider; release and it resumes from that point.
      if(loopDur > 0){
        const t = transportRow(loopDur, phase,
          v=>{ scrubbing = true; phase = v; repaint(); },   // follow the slider (and show the frame when paused)
          ()=>{ scrubbing = true; },                        // begin: pause accrual
          ()=>{ scrubbing = false; lastNow = 0; });         // end: resume from here without a dt jump
        transportInput = t.input; transportOut = t.out;
        rows.appendChild(t.row);
      }
      rows.appendChild(speedRow(speed, v=>{ speed = v; }));
      customInputs.forEach(inp=>{
        if(inp.kind === "slider")
          rows.appendChild(rangeRow(inp.name, inp.min, inp.max, inp.step, inp.value, v=>{ inp.value = v; repaint(); }));
        else
          rows.appendChild(selectRow(inp.name, inp.opts, inp.value, v=>{ inp.value = v; repaint(); }));
      });
    }

    function dispose(){
      active = false; stop(false);
      disposeGlyphTextures();
      if(ro){ ro.disconnect(); ro = null; }
      try { const ext = gl && gl.getExtension("WEBGL_lose_context"); if(ext) ext.loseContext(); } catch(e){}
      gl = null;
    }

    if(gl){
      canvas.addEventListener("webglcontextlost", e=>{ e.preventDefault(); stop(false); }, false);
      canvas.addEventListener("webglcontextrestored", ()=>{ if(build()){ size(); sync(); } }, false);
      if(!isBg && window.ResizeObserver){
        ro = new ResizeObserver(()=>{ size(); if(!running && paused && active && !blocked()) renderStill(); });
        ro.observe(canvas);
      }
      if(playBtn) playBtn.addEventListener("click", ()=> setPaused(!paused));
      buildPanel();   // CSS reveals it on pointer activity; no-op when there's no panel
      // video-player chrome: ease the controls in on pointer activity, then ease
      // them (and the cursor) out once the pointer holds still for a moment.
      if(figure){
        let idle = 0;
        const wake = ()=>{
          figure.classList.add("ui-on");
          clearTimeout(idle);
          idle = setTimeout(()=> figure.classList.remove("ui-on"), 2000);
        };
        figure.addEventListener("pointerenter", wake);
        figure.addEventListener("pointermove", wake);
        figure.addEventListener("pointerleave", ()=>{ clearTimeout(idle); figure.classList.remove("ui-on"); });
      }
      size();
    }
    return { configure, activate, setPaused, refreshColor, sync, size, dispose, setUserGlsl, ok: !!gl };
  }

  // The takeover cinema chrome (body.has-takeover class, --fx-opacity fade,
  // --scroll-hint-opacity, .content opacity ramp, reading-column CSS vars) is
  // shared with the intro λ-logo and lives in Takeover (see takeover.js). This
  // file only claims/releases the "shader-bg" slot when scan() sees a takeover
  // marker on the page.
  const TAKEOVER_ID = "shader-bg";

  // ---- manager: one persistent background + N per-page inline windows -------
  let bg = null, inlines = [];

  function ensureBg(){
    if(bg) return bg;
    const c = document.getElementById("fxcanvas");
    if(!c) return null;
    const r = makeRenderer(c, true, document.getElementById("fxctl"));
    bg = r.ok ? r : null;
    return bg;
  }
  function clearInlines(){ inlines.forEach(r=> r.dispose()); inlines = []; }
  const cfgFromEl = el => ({ effect: el.dataset.effect || "ambient", intensity: el.dataset.intensity });

  // read the current page: activate the takeover background if present, and (re)build
  // an inline renderer for every .shader-window. Called at startup + after soft-nav.
  function scan(root){
    root = root || document;
    const bgCfg = root.querySelector('.shader-config[data-effect="takeover"]');
    // Flag the page for CSS (cinema padding on main) + the fade-on-scroll
    // updater; the shared Takeover module owns the body class and its chrome.
    if(window.Takeover){
      if(bgCfg) Takeover.claim(TAKEOVER_ID);
      else Takeover.release(TAKEOVER_ID);
    }
    if(bgCfg){
      const r = ensureBg();
      if(r){
        // Takeover markers may carry a Shadertoy-style mainImage in a nested
        // <script class="shader-glsl">. Swap the persistent canvas to it (or
        // back to the built-in wave when the marker has no body).
        const gEl = bgCfg.querySelector(".shader-glsl");
        r.setUserGlsl(gEl ? gEl.textContent : "");
        r.configure(cfgFromEl(bgCfg));
        r.setPaused(bgCfg.hasAttribute("data-paused"));
        r.activate(true);
      }
    }
    else if(bg){ bg.activate(false); }

    clearInlines();
    root.querySelectorAll(".shader-window .shader-canvas").forEach(cv=>{
      const fig = cv.closest(".shader-window");
      const r = makeRenderer(cv, false, fig.querySelector(".shader-ctl"));
      if(!r.ok) return;
      r.configure(cfgFromEl(fig));
      r.setPaused(!fig.hasAttribute("data-autoplay"));   // autoplay defaults OFF -> start paused on a preview
      r.activate(true);
      inlines.push(r);
    });

    // a `:effect floating` window pops out to the right gutter at wide viewports;
    // flag the page so the reading column can hug the left and free that space (CSS).
    document.body.classList.toggle("has-floating-shader",
      !!root.querySelector('.shader-window[data-effect="floating"]'));
  }

  function syncAll(){ if(bg) bg.sync(); inlines.forEach(r=> r.sync()); }
  function refreshColors(){ readAccent(); if(bg) bg.refreshColor(); inlines.forEach(r=> r.refreshColor()); }
  function sizeAll(){ if(bg) bg.size(); inlines.forEach(r=> r.size()); }
  function killAll(){
    perfKilled = true;
    try { sessionStorage.setItem("shader-perf", "slow"); } catch(e){}
    syncAll();
  }

  function init(){
    window.addEventListener("resize", sizeAll);
    // Reading-column measurement + scroll fade + sidebar-overlay tracking all
    // live in Takeover (shared with the λ-logo). The sidebar-toggle listener
    // there rewrites --reading-left/-width; we still need to resize the canvas
    // buffer to follow the new width when it changes.
    const navToggle = document.getElementById("navtoggle");
    if(navToggle) navToggle.addEventListener("change", sizeAll);
    document.addEventListener("visibilitychange", syncAll);
    if(window.MutationObserver){
      new MutationObserver(syncAll).observe(document.body, { attributes:true, attributeFilter:["class"] });             // fx toggle
      new MutationObserver(refreshColors).observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] }); // palette
    }
    const mm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if(mm && mm.addEventListener) mm.addEventListener("change", syncAll);
    readAccent();
    scan(document);
  }

  // clear an auto-disable and retry (console: Shader.reset())
  function reset(){
    perfKilled = false;
    try { sessionStorage.removeItem("shader-perf"); } catch(e){}
    scan(document);
  }

  return { init, scan, sync: syncAll, reset, isKilled: ()=> perfKilled };
})();
