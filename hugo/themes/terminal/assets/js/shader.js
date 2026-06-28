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
    const figure = isBg ? null : canvas.closest(".shader-window");
    const glslEl = figure && figure.querySelector(".shader-glsl");
    const errEl  = figure && figure.querySelector(".shader-error");
    const userGlsl = glslEl ? glslEl.textContent.trim() : "";
    const fragSrc = userGlsl ? (CUSTOM_PREAMBLE + userGlsl + CUSTOM_MAIN) : FRAG;

    // controls panel: a global time-speed multiplier (every shader) + any custom
    // uniforms the literate GLSL declared via @slider/@select. The panel lives in
    // the figure and is revealed on pointer activity (see theme CSS + UI wiring below).
    const customInputs = parseInputs(userGlsl);
    const loopDur = parseLoop(userGlsl);                  // >0 -> iTime wraps + transport scrubber
    const panelEl = figure && figure.querySelector(".shader-panel");
    let speed = 1;
    let scrubbing = false;                               // user dragging the transport: pause accrual
    let transportInput = null, transportOut = null;

    function showError(msg){
      if(errEl){ errEl.textContent = msg; errEl.hidden = false; }
      else console.warn("[shader] " + msg);
    }
    function build(){
      const b = buildProgram(gl, fragSrc);
      if(b.prog){
        prog = b.prog; loc = b.loc; if(errEl) errEl.hidden = true;
        for(const c of customInputs) c.loc = gl.getUniformLocation(prog, c.name);
        return true;
      }
      prog = null; showError(b.err);   // keep the context; draw nothing; show the log
      return false;
    }

    try {
      gl = canvas.getContext("webgl", { alpha:true, depth:false, antialias:false, premultipliedAlpha:false })
        || canvas.getContext("experimental-webgl", { alpha:true, depth:false, antialias:false });
    } catch(e){ gl = null; }
    // enable screen-space derivatives so literate shaders can use fwidth/dFdx/dFdy
    // (paired with the #extension line in CUSTOM_PREAMBLE); harmless null if absent.
    if(gl){ gl.getExtension("OES_standard_derivatives"); build(); checkSoftware(gl); }

    function size(){
      if(!gl) return;
      const cap = Math.min(window.devicePixelRatio || 1, 1.5) * SCALES[scaleIdx];
      const cw = isBg ? window.innerWidth  : (canvas.clientWidth  || 1);
      const ch = isBg ? window.innerHeight : (canvas.clientHeight || 1);
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
    return { configure, activate, setPaused, refreshColor, sync, size, dispose, ok: !!gl };
  }

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
    if(bgCfg){ const r = ensureBg(); if(r){ r.configure(cfgFromEl(bgCfg)); r.setPaused(bgCfg.hasAttribute("data-paused")); r.activate(true); } }
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
