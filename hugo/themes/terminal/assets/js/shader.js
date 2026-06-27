/* ===========================================================
   PERSISTENT SHADER BACKGROUND
   One WebGL context for the whole tab, living on a body-level <canvas> that the
   soft-nav router (spa.js) never tears down — so the animation runs unbroken
   across page navigations. Pages don't create contexts; they only RECONFIGURE
   this one (which effect, how intense) via Shader.configure / Shader.scan.

   Layering: the canvas is position:fixed; z-index:-1 (see theme-additions.css),
   so it paints above the page's --bg but behind the (translucent) content. It is
   gated off entirely when fx is off, reduced-motion is requested, or JS is absent
   — matching the rest of the theme's progressive-enhancement contract.
   =========================================================== */
window.Shader = (function(){
  "use strict";

  const EFFECTS = { ambient:0, takeover:1 };

  // ---- fullscreen triangle + fragment shader --------------------------------
  const VERT = `
    attribute vec2 a_pos;
    void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

  // u_intensity scales the overall alpha; u_effect selects the pattern. Output
  // is accent-tinted with a low alpha so --bg shows through behind the text.
  const FRAG = `
    precision mediump float;
    uniform vec2  u_res;
    uniform float u_time;
    uniform float u_intensity;
    uniform float u_effect;
    uniform vec3  u_accent;

    // cheap value-noise plasma
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

      float v = wave(p, t);                       // -2..2-ish
      float field = 0.5 + 0.25 * v;               // ~0..1

      // takeover (u_effect=1): tighter, brighter rings layered on the plasma
      float rings = sin(length(p)*6.0 - t*2.0)*0.5 + 0.5;
      field = mix(field, field*0.6 + rings*0.6, u_effect);

      // faint scanlines for the terminal feel
      float scan = 0.92 + 0.08 * sin(gl_FragCoord.y * 1.4 + t*2.0);
      field *= scan;

      // base alpha: subtle when ambient, stronger on takeover
      float baseA = mix(0.16, 0.45, u_effect);
      float a = field * baseA * u_intensity;

      vec3 col = u_accent * (0.6 + 0.7 * field);
      gl_FragColor = vec4(col, a);
    }`;

  // ---- state ----------------------------------------------------------------
  let canvas, gl, prog, loc = {}, raf = 0, t0 = 0;
  let running = false, ready = false, started = false;
  let accent = [0.87, 0.64, 0.17];               // amber fallback (#dfa22c)
  let intensity = 0, targetIntensity = 0;
  let effect = 0, targetEffect = 0;

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
  const shouldRun = () => !!gl && !document.hidden && !fxOff() && !reduceMotion();

  // ---- gl helpers -----------------------------------------------------------
  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ gl.deleteShader(s); return null; }
    return s;
  }
  function buildProgram(){
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if(!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    loc.res = gl.getUniformLocation(prog, "u_res");
    loc.time = gl.getUniformLocation(prog, "u_time");
    loc.intensity = gl.getUniformLocation(prog, "u_intensity");
    loc.effect = gl.getUniformLocation(prog, "u_effect");
    loc.accent = gl.getUniformLocation(prog, "u_accent");
    return true;
  }

  function resize(){
    if(!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(window.innerWidth  * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function clear(){
    if(!gl) return;
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function frame(now){
    raf = 0;
    if(!running) return;
    if(!t0) t0 = now;
    const t = (now - t0) / 1000;
    // ease the intensity/effect toward their targets for smooth ambient<->takeover
    intensity += (targetIntensity - intensity) * 0.05;
    effect    += (targetEffect    - effect)    * 0.05;
    gl.uniform2f(loc.res, canvas.width, canvas.height);
    gl.uniform1f(loc.time, t);
    gl.uniform1f(loc.intensity, intensity);
    gl.uniform1f(loc.effect, effect);
    gl.uniform3f(loc.accent, accent[0], accent[1], accent[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if(!ready){ ready = true; canvas.classList.add("fx-ready"); }
    raf = requestAnimationFrame(frame);
  }

  function start(){
    if(running || !gl) return;
    running = true;
    if(!raf) raf = requestAnimationFrame(frame);
  }
  function stop(){
    running = false;
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    ready = false; canvas && canvas.classList.remove("fx-ready");
    clear();
  }
  // single place that reconciles the loop with fx/motion/visibility state
  function sync(){ if(shouldRun()) start(); else stop(); }

  // ---- public API -----------------------------------------------------------
  function configure(cfg){
    cfg = cfg || {};
    const e = typeof cfg.effect === "string" ? (EFFECTS[cfg.effect] ?? 0) : (cfg.effect || 0);
    targetEffect = e;
    if(cfg.intensity != null){
      const n = parseFloat(cfg.intensity);
      if(!isNaN(n)) { targetIntensity = Math.max(0, Math.min(1, n)); return; }
    }
    // sensible defaults per effect when no explicit intensity is given
    targetIntensity = e >= 1 ? 1.0 : 0.8;
  }

  // read a page's optional <div class="shader-config"> marker and reconfigure.
  // absent -> fall back to the calm ambient default. Called at startup and after
  // every soft-nav swap (by spa.js).
  function scan(root){
    const cfg = (root || document).querySelector(".shader-config");
    if(cfg){
      configure({
        effect: cfg.dataset.effect || "ambient",
        fullscreen: cfg.hasAttribute("data-fullscreen"),
        intensity: cfg.dataset.intensity,
      });
    } else {
      configure({ effect: "ambient" });
    }
  }

  function init(){
    if(started) return;
    started = true;
    canvas = document.getElementById("fxcanvas");
    if(!canvas) return;
    try {
      gl = canvas.getContext("webgl", { alpha:true, depth:false, antialias:false, premultipliedAlpha:false })
        || canvas.getContext("experimental-webgl", { alpha:true, depth:false, antialias:false });
    } catch(e){ gl = null; }
    if(!gl || !buildProgram()){ gl = null; return; }   // no WebGL -> stay blank, site unaffected

    resize();
    readAccent();

    // context loss: pause; on restore, rebuild + resume
    canvas.addEventListener("webglcontextlost", e=>{ e.preventDefault(); stop(); }, false);
    canvas.addEventListener("webglcontextrestored", ()=>{ if(buildProgram()){ resize(); sync(); } }, false);

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", sync);
    // fx toggle flips body.no-fx; adopt it live
    if(window.MutationObserver){
      new MutationObserver(sync).observe(document.body, { attributes:true, attributeFilter:["class"] });
      new MutationObserver(readAccent).observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] });
    }
    const mm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if(mm && mm.addEventListener) mm.addEventListener("change", sync);

    scan(document);   // pick up a shader-config on the first page, else ambient
    sync();
  }

  return { init, configure, scan, sync };
})();
