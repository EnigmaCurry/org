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

  const EFFECTS = { ambient:0, takeover:1 };

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
      // inline windows render OPAQUE (a solid little screen: accent plasma on a near
      // black panel); the full-screen background renders translucent so the page
      // shows through it as an ambient wash.
      vec3 solid = mix(vec3(0.02, 0.02, 0.03), col, clamp(field, 0.0, 1.0));
      gl_FragColor = mix(vec4(col, a), vec4(solid, 1.0), u_opaque);
    }`;

  // ---- shared state ---------------------------------------------------------
  const SCALES = [1, 0.66, 0.4];                 // render-resolution steps under load
  let perfKilled = false;
  let softwareChecked = false;
  let accent = [0.87, 0.64, 0.17];               // amber fallback (#dfa22c)

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
  }

  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fxOff = () => document.body.classList.contains("no-fx");
  const blocked = () => perfKilled || document.hidden || fxOff() || reduceMotion();

  function compile(gl, type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ gl.deleteShader(s); return null; }
    return s;
  }
  function buildProgram(gl){
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if(!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    return { prog, loc: {
      res: gl.getUniformLocation(prog, "u_res"),
      time: gl.getUniformLocation(prog, "u_time"),
      intensity: gl.getUniformLocation(prog, "u_intensity"),
      effect: gl.getUniformLocation(prog, "u_effect"),
      opaque: gl.getUniformLocation(prog, "u_opaque"),
      accent: gl.getUniformLocation(prog, "u_accent"),
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

  // ---- one renderer (drives a single canvas) --------------------------------
  function makeRenderer(canvas, isBg, controlsEl){
    let gl = null, prog = null, loc = {}, raf = 0, ro = null;
    let phase = 0, lastNow = 0;
    let running = false, ready = false, active = false, paused = false;
    let intensity = 0, targetIntensity = 0, effect = 0, targetEffect = 0;
    let scaleIdx = 0, pfFrames = 0, pfAccum = 0, pfLast = 0, pfWarm = 0;

    const opaque = isBg ? 0 : 1;   // inline = solid screen; background = translucent wash

    // control panel: an inline window's figure, or the floating background panel
    const playBtn  = controlsEl && controlsEl.querySelector(".shader-play");
    const resetBtn = controlsEl && controlsEl.querySelector(".shader-reset");

    try {
      gl = canvas.getContext("webgl", { alpha:true, depth:false, antialias:false, premultipliedAlpha:false })
        || canvas.getContext("experimental-webgl", { alpha:true, depth:false, antialias:false });
    } catch(e){ gl = null; }
    if(gl){ const b = buildProgram(gl); if(b){ prog = b.prog; loc = b.loc; } else gl = null; }
    if(gl) checkSoftware(gl);

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
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if(!ready){ ready = true; canvas.classList.add("fx-ready"); }
    }
    function frame(now){
      raf = 0;
      if(!running) return;
      perfTick(now);
      if(!running) return;                                 // perfTick may have killed us
      intensity += (targetIntensity - intensity) * 0.05;
      effect    += (targetEffect    - effect)    * 0.05;
      if(!lastNow) lastNow = now;
      const dt = Math.min(0.05, (now - lastNow) / 1000);   // clamp big gaps
      lastNow = now;
      phase += dt * (0.5 + 0.5 * effect);                  // ambient half speed, takeover full
      paint();
      raf = requestAnimationFrame(frame);
    }
    function renderStill(){                                 // one static frame at full strength (paused preview)
      if(!gl) return;
      intensity = targetIntensity; effect = targetEffect;
      paint();
    }

    function start(){
      if(running || !gl) return;
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

    // play/pause + reset/clear panel control (inline windows only)
    function setPaused(p){
      paused = !!p;
      if(controlsEl){
        controlsEl.classList.toggle("paused", paused);
        if(playBtn)  playBtn.setAttribute("aria-label",  paused ? "Play"  : "Pause");
        if(resetBtn) resetBtn.setAttribute("aria-label", paused ? "Clear" : "Reset");
      }
      sync();
    }
    // reset while playing = restart from t0; clear while paused = blank the canvas
    function resetOrClear(){ if(paused) clear(); else { phase = 0; lastNow = 0; } }

    function activate(on){
      active = !!on;
      if(isBg && controlsEl) controlsEl.classList.toggle("on", active);   // show the floating panel only while a takeover is live
      size(); sync();
    }

    function dispose(){
      active = false; stop(false);
      if(ro){ ro.disconnect(); ro = null; }
      try { const ext = gl && gl.getExtension("WEBGL_lose_context"); if(ext) ext.loseContext(); } catch(e){}
      gl = null;
    }

    if(gl){
      canvas.addEventListener("webglcontextlost", e=>{ e.preventDefault(); stop(false); }, false);
      canvas.addEventListener("webglcontextrestored", ()=>{ const b = buildProgram(gl); if(b){ prog = b.prog; loc = b.loc; size(); sync(); } }, false);
      if(!isBg && window.ResizeObserver){
        ro = new ResizeObserver(()=>{ size(); if(!running && paused && active && !blocked()) renderStill(); });
        ro.observe(canvas);
      }
      if(playBtn)  playBtn.addEventListener("click", ()=> setPaused(!paused));
      if(resetBtn) resetBtn.addEventListener("click", resetOrClear);
      size();
    }
    return { configure, activate, setPaused, sync, size, dispose, ok: !!gl };
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
    if(bgCfg){ const r = ensureBg(); if(r){ r.configure(cfgFromEl(bgCfg)); r.setPaused(!bgCfg.hasAttribute("data-paused")); r.activate(true); } }
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
  }

  function syncAll(){ if(bg) bg.sync(); inlines.forEach(r=> r.sync()); }
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
      new MutationObserver(syncAll).observe(document.body, { attributes:true, attributeFilter:["class"] });          // fx toggle
      new MutationObserver(readAccent).observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] }); // palette
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
