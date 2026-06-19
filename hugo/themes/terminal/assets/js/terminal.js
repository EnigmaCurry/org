/* ===========================================================
   DECODE "RAIN" REVEAL — first screen only
   Scrambles each non-whitespace character through random
   glyphs, then locks it to the real value. Lock time keys off
   the element's vertical position so the reveal cascades down
   the page like rain. Operates on text nodes via TreeWalker so
   inline markup (links, <code>) is preserved.
   =========================================================== */
// ASCII only — every glyph must exist in Inconsolata with the SAME advance width,
// or substituted/wider glyphs reflow the page mid-animation. No block/box chars here.
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&@$*?/<>=+-_".split("");
const rnd = () => GLYPHS[(Math.random()*GLYPHS.length)|0];

function textNodesIn(root){
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n){
      if(!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if(!p) return NodeFilter.FILTER_REJECT;
      if(p.tagName==="SCRIPT"||p.tagName==="STYLE") return NodeFilter.FILTER_REJECT;
      if(p.closest(".mermaid, .no-rain")) return NodeFilter.FILTER_REJECT;   // mermaid source is parsed as code — scrambling it breaks rendering
      // running prose is set in a proportional reading font; the scramble assumes
      // a monospace grid, so decoding it would reflow each line. Leave it static.
      if(p.closest(".content") && p.closest("p, li, blockquote, dd, dt")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const out=[]; let n; while((n=w.nextNode())) out.push(n); return out;
}

/* Timing knobs — tune the feel here:
   SETTLE   ms global delay before anything starts resolving
   DOWN     ms per pixel the resolve falls DOWN each column (smaller = faster fall)
   COLSPREAD ms of random head-start between columns (the staggered rain look)
   SCRAMBLE ms each char briefly flickers glyphs before locking (0 = dot straight to letter)
   FLIP     ms between glyph changes during the scramble window                       */
const SETTLE = 60, DOWN = 0.5, COLSPREAD = 220, SCRAMBLE = 110, FLIP = 45;
const DOT = ".";

function rain(root, firstScreenOnly=true){
  // accessibility: never strobe for users who ask for reduced motion
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const vh = window.innerHeight;
  let nodes = textNodesIn(root);
  if(firstScreenOnly){
    nodes = nodes.filter(n=>{ const r=n.parentElement.getBoundingClientRect(); return r.top < vh && r.bottom > 0; });
  }

  // PASS 1 (read-only): measure every character's on-screen position. The font is
  // monospace, so left/charW buckets each glyph into a vertical column of the grid.
  const range = document.createRange();
  let charW = 0;
  const items = nodes.map(node=>{
    const final = node.nodeValue;
    const chars = [];
    for(let i=0;i<final.length;i++){
      const ch = final[i], ws = /\s/.test(ch);
      let x=0, y=0;
      if(!ws){
        range.setStart(node,i); range.setEnd(node,i+1);
        const r = range.getBoundingClientRect();
        x=r.left; y=r.top;
        if(!charW && r.width) charW = r.width;
      }
      chars.push({ch, ws, x, y});
    }
    return {node, chars, done:false};
  });
  if(!charW) charW = 8;

  // assign each char a lock time: column head-start + how far DOWN it sits in that column
  const colDelay = {};
  const colOffset = col => (colDelay[col] ??= Math.random()*COLSPREAD);
  for(const it of items){
    for(const c of it.chars){
      if(c.ws) continue;
      const col = Math.round(c.x / charW);
      c.lockAt  = SETTLE + colOffset(col) + Math.max(0,c.y)*DOWN + Math.random()*40;
      c.startAt = c.lockAt - SCRAMBLE;     // dots until the column's drop reaches it
      c.glyph   = DOT; c.nextFlip = 0;
    }
  }

  // PASS 2 (write): paint the initial field of dots (spaces preserved)
  for(const it of items) it.node.nodeValue = it.chars.map(c=> c.ws ? c.ch : DOT).join("");

  const t0 = performance.now();
  function frame(now){
    const t = now - t0; let allDone=true;
    for(const it of items){
      if(it.done) continue;
      let done=true, out="";
      for(const c of it.chars){
        if(c.ws || t>=c.lockAt){ out+=c.ch; }          // whitespace / resolved
        else if(t<c.startAt){ out+=DOT; done=false; }  // waiting — calm dot, no flicker
        else {                                         // brief decode flicker, throttled
          if(t>=c.nextFlip){ c.glyph=rnd(); c.nextFlip=t+FLIP*(0.6+Math.random()*0.8); }
          out+=c.glyph; done=false;
        }
      }
      it.node.nodeValue=out;
      if(done) it.done=true; else allDone=false;
    }
    if(!allDone) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ===========================================================
   DECOMPRESS REVEAL — proportional prose (reading column)
   The decode-rain assumes a monospace grid, so it can't run on the
   variable-width reading font without reflowing every line. Instead each
   WORD is given a fixed-width box measured from its real glyphs, then its
   content resolves: a dim field of garbled glyphs (slow shimmer) -> a brief
   bright garble at the head -> the real word, a decode head crawling linearly
   through the paragraph (reading order). Fixed boxes => zero reflow; each box
   is released back to natural width the instant its word locks, so the resting
   text keeps real kerning. */
const DC_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&@$*?/<>=+-_".split("");
const dcGarble = n => { let s=""; for(let i=0;i<n;i++) s += DC_GLYPHS[(Math.random()*DC_GLYPHS.length)|0]; return s; };

function decompress(root){
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const vh = window.innerHeight;

  // only the prose blocks on the first screen take part
  const blocks = [...root.querySelectorAll("p, li, blockquote, dd, dt")].filter(el=>{
    const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0;
  });

  // wrap each word in a span (whitespace stays as text, preserving break points);
  // text inside code stays monospace + static, so skip it
  const words = [];
  for(const el of blocks){
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(n){
        if(!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if(!p || p.closest("code, kbd, samp")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; let n; while((n=walker.nextNode())) nodes.push(n);
    for(const node of nodes){
      const frag = document.createDocumentFragment();
      for(const tok of node.nodeValue.split(/(\s+)/)){
        if(!tok) continue;
        if(/\s/.test(tok)){ frag.appendChild(document.createTextNode(tok)); }
        else { const s=document.createElement("span"); s.className="dc"; s.textContent=tok; frag.appendChild(s); words.push(s); }
      }
      node.parentNode.replaceChild(frag, node);
    }
  }

  // PASS 1 (read): measure each word's natural box; drop any now below the fold
  const items = [];
  for(const s of words){
    const r = s.getBoundingClientRect();
    if(r.top >= vh) continue;                 // below first screen -> leave as real text
    items.push({ s, w:r.width, text:s.textContent });
  }
  if(!items.length) return;

  // PASS 2 (write): pin each box to its measured width, dim it, and seed it with garble
  for(const it of items){
    it.s.style.cssText = "display:inline-block;overflow:hidden;white-space:pre;vertical-align:baseline;color:var(--fg-dim);width:" + it.w + "px";
    it.s.textContent = dcGarble(it.text.length);
    it.nextFlip = 0; it.locked = false; it.lit = false;
  }

  // linear crawl: word i lights up at i*STEP, garbles brightly for GARBLE ms, then locks.
  // STEP shrinks with length so the first screen always finishes in ~SPAN ms. Words still
  // ahead of the head shimmer slowly (WAIT_FLIP) as a dim field of "compressed" data.
  const SPAN = 1100, GARBLE = 200, FLIP = 45, WAIT_FLIP = 260;
  const STEP = Math.min(22, SPAN / items.length);
  items.forEach((it,i)=>{ it.startAt = i*STEP; it.lockAt = i*STEP + GARBLE; });

  const t0 = performance.now();
  function frame(now){
    const t = now - t0; let allDone = true;
    for(const it of items){
      if(it.locked) continue;
      if(t >= it.lockAt){                       // lock: real word, release the box (natural width = measured)
        it.s.style.cssText = ""; it.s.textContent = it.text; it.locked = true;
      } else if(t >= it.startAt){               // head: brighten + fast garble flicker
        if(!it.lit){ it.s.style.color = ""; it.lit = true; }
        if(t >= it.nextFlip){ it.s.textContent = dcGarble(it.text.length); it.nextFlip = t + FLIP*(0.6+Math.random()*0.8); }
        allDone = false;
      } else {                                  // waiting: dim, slow shimmer of garbled data
        if(t >= it.nextFlip){ it.s.textContent = dcGarble(it.text.length); it.nextFlip = t + WAIT_FLIP*(0.6+Math.random()*0.8); }
        allDone = false;
      }
    }
    if(!allDone) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* toggles ---------------------------------------------------- */
const content = document.getElementById("content");

// localStorage, guarded (file:// can throw)
const lsGet = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
const lsSet = (k,v) => { try{ localStorage.setItem(k,v); }catch(e){} };
// sessionStorage, guarded — scoped to this tab, cleared when the tab closes
const ssGet = k => { try{ return sessionStorage.getItem(k); }catch(e){ return null; } };
const ssSet = (k,v) => { try{ sessionStorage.setItem(k,v); }catch(e){} };

// tri-state palette toggle (persisted): amber -> green -> mono -> amber
const PALETTES = ["amber","green","mono","lite"];
const palBtn = document.getElementById("palette");
// theme was already resolved + applied by the early head script; just sync state here
let palIdx = Math.max(0, PALETTES.indexOf(document.documentElement.dataset.theme));
function applyPalette(){
  document.documentElement.dataset.theme = PALETTES[palIdx];   // on <html> so --bg reaches the root background
  palBtn.textContent = PALETTES[palIdx];
}
palBtn.addEventListener("click", ()=>{
  palIdx = (palIdx+1) % PALETTES.length;
  applyPalette();
  lsSet("theme", PALETTES[palIdx]);                          // persist only when the user picks
});
applyPalette();

// fx on/off toggle (persisted): gates the text reveal + box circuit beam
let fxOn = lsGet("fx") !== "off";
const fxBtn = document.getElementById("fx");
function applyFx(){
  fxBtn.textContent = fxOn ? "on" : "off";
  document.body.classList.toggle("no-fx", !fxOn);
  lsSet("fx", fxOn ? "on" : "off");
}
fxBtn.addEventListener("click", ()=>{ fxOn = !fxOn; applyFx(); });
applyFx();

// off-canvas sidebar on narrow screens
const menutoggle = document.getElementById("menutoggle");
const navBackdrop = document.getElementById("navBackdrop");
const sidebarEl = document.querySelector(".sidebar");
function setNav(open){
  document.body.classList.toggle("nav-open", open);
  if(menutoggle) menutoggle.setAttribute("aria-expanded", String(open));
  if(open && sidebarEl && fxOn) rain(sidebarEl, false);   // redraw the menu like a terminal, decoding in
}
if(menutoggle) menutoggle.addEventListener("click", ()=> setNav(!document.body.classList.contains("nav-open")));
if(navBackdrop) navBackdrop.addEventListener("click", ()=> setNav(false));
document.querySelectorAll(".sidebar .tree a").forEach(a=> a.addEventListener("click", ()=> setNav(false)));

// page outline: build the SECOND index (this page's h2/h3 sections) into the
// header "#" expander. The sidebar handles site/book/chapter nav; this handles
// the sub-headings that don't belong there.
(function(){
  const toggle = document.getElementById("tocToggle");
  const panel  = document.getElementById("toc");
  if(!toggle || !panel || !content) return;
  const list  = panel.querySelector("ul");
  const slug  = s => s.toLowerCase().trim().replace(/[^\w]+/g,"-").replace(/^-+|-+$/g,"");
  const links = [];
  // the page title (h1) is the first list item, styled like the rest
  const heads = [...content.querySelectorAll("h1, h2, h3")];
  let h1link = null;
  heads.forEach(h=>{
    if(!h.id) h.id = slug(h.textContent);
    const li = document.createElement("li");
    li.className = h.tagName === "H1" ? "lvl1" : (h.tagName === "H3" ? "lvl3" : "lvl2");
    const a = document.createElement("a");
    a.href = "#" + h.id; a.textContent = h.textContent;
    li.appendChild(a); list.appendChild(li); links.push(a);
    if(h.tagName === "H1") h1link = a;
  });
  const setOpen = open => { panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); };
  toggle.addEventListener("click", e=>{ e.stopPropagation(); setOpen(panel.hidden); });
  panel.addEventListener("click", e=>{
    const a = e.target.closest("a"); if(!a) return;
    e.preventDefault();
    if(a === h1link){                                 // title -> all the way to the very top
      window.scrollTo({ top:0, behavior:"smooth" });
    } else {
      const el = document.getElementById(a.getAttribute("href").slice(1));
      if(el) el.scrollIntoView({ behavior:"smooth", block:"start" });
    }
    setOpen(false);
  });
  document.addEventListener("click", e=>{ if(!panel.hidden && !panel.contains(e.target) && e.target !== toggle) setOpen(false); });
  document.addEventListener("keydown", e=>{ if(e.key === "Escape") setOpen(false); });
  // scroll-spy: highlight whichever section is nearest the top of the viewport
  if("IntersectionObserver" in window){
    let active = null;
    const io = new IntersectionObserver(ents=>{
      ents.forEach(en=>{ if(en.isIntersecting) active = en.target.id; });
      links.forEach(a=> a.classList.toggle("active", a.getAttribute("href") === "#" + active));
    }, { rootMargin:"-80px 0px -70% 0px", threshold:0 });
    heads.forEach(h=> io.observe(h));
  }
})();

// left / right arrow keys flip pages, mirroring the top-right nav buttons.
// (this is the same action as clicking .navprev / .navnext in pagenav.html)
(function(){
  document.addEventListener("keydown", e=>{
    if(e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    let sel = null;
    if(e.key === "ArrowLeft")       sel = ".navprev";
    else if(e.key === "ArrowRight") sel = ".navnext";
    else return;
    const a = document.querySelector(".topnav " + sel);
    if(a && a.getAttribute("href") && a.getAttribute("aria-disabled") !== "true"){
      e.preventDefault();
      location.href = a.href;
    }
  });
})();

// clicking the prompt path replays the intro animation (simplest: reload the page)
const cmdLink = document.querySelector(".topbar a.cmd");
if(cmdLink) cmdLink.addEventListener("click", e=>{ e.preventDefault(); location.reload(); });

// keep the prompt on ONE line: drop the visitor@host: prefix when the whole line
// won't fit, then left-truncate the path (…suffix) so the current page stays visible.
// Monospace => exact character math, no CSS bidi/ellipsis tricks needed.
(function(){
  const cmd = document.querySelector(".topbar .cmd");
  const pathEl = cmd && cmd.querySelector(".path");
  if(!cmd || !pathEl) return;
  const prefix = cmd.querySelector(".prefix");
  const fullPath = pathEl.textContent;
  const prefixLen = prefix ? prefix.textContent.length : 0;
  function charW(){
    const r = document.createElement("span");
    r.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:inherit;";
    r.textContent = "0".repeat(40); cmd.appendChild(r);
    const w = r.getBoundingClientRect().width / 40; r.remove();
    return w || 8;
  }
  function fitPrompt(){
    const cols = Math.floor(cmd.clientWidth / charW()) - 1;   // -1 char safety margin
    const showPrefix = (prefixLen + fullPath.length) <= cols;
    cmd.classList.toggle("hide-prefix", !showPrefix);
    const room = cols - (showPrefix ? prefixLen : 0);
    pathEl.textContent = fullPath.length <= room
      ? fullPath
      : "…" + fullPath.slice(-Math.max(1, room - 1));     // leading … keeps the suffix
  }
  let raf;
  window.addEventListener("resize", ()=>{ cancelAnimationFrame(raf); raf = requestAnimationFrame(fitPrompt); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(fitPrompt);
  fitPrompt();
})();

// copy-to-clipboard on run boxes: check morph + re-run the circuit beam for that box
function fallbackCopy(text){
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.focus(); ta.select();
  try{ document.execCommand("copy"); }catch(e){}
  ta.remove();
}
function doCopy(text, onDone){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(onDone).catch(()=>{ fallbackCopy(text); onDone(); });
  } else { fallbackCopy(text); onDone(); }
}
// reverse-video "select all" sweep over EL: selection grows to the end, flashes
// once, then clears. Chars are wrapped in spans lazily on first copy.
function sweepElement(el){
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if(!el.dataset.wrapped){
    const frag = document.createDocumentFragment();
    for(const ch of el.textContent){
      const s = document.createElement("span"); s.className = "ch"; s.textContent = ch;
      frag.appendChild(s);
    }
    el.textContent = ""; el.appendChild(frag); el.dataset.wrapped = "1";
  }
  const chars = el.querySelectorAll(".ch");
  if(!chars.length) return;
  if(el._sweepTimers) el._sweepTimers.forEach(clearTimeout);
  if(el._sweepRAF) cancelAnimationFrame(el._sweepRAF);
  el._sweepTimers = [];
  chars.forEach(c=> c.classList.remove("sel"));
  const DURATION = 300;              // fixed total scan time -> longer content just covers faster
  const t0 = performance.now();
  let done = 0;
  (function frame(now){
    const progress = Math.min(1, (now - t0) / DURATION);
    const target = Math.floor(progress * chars.length);
    while(done < target) chars[done++].classList.add("sel");
    if(progress < 1){ el._sweepRAF = requestAnimationFrame(frame); return; }
    while(done < chars.length) chars[done++].classList.add("sel");   // ensure the tail is selected
    el._sweepRAF = null;
    const at = (t,fn)=> el._sweepTimers.push(setTimeout(fn, t));
    const all = on => chars.forEach(c=> c.classList.toggle("sel", on));
    at(85,  ()=> all(false));   // off
    at(140, ()=> all(true));    // flash on
    at(220, ()=> all(false));   // off -> gone
  })(performance.now());
}
function copied(btn){
  const box = btn.closest(".box");
  btn.classList.add("copied");
  clearTimeout(btn._t); btn._t = setTimeout(()=> btn.classList.remove("copied"), 1200);
  const pre = box && box.querySelector(".body pre");
  if(pre && fxOn) sweepElement(pre);          // reverse-video select-all sweep
}
document.querySelectorAll(".run .copy").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const pre = btn.closest(".box").querySelector(".body pre");
    doCopy(pre ? pre.textContent : "", ()=> copied(btn));
  });
});
// inline code pills: click to copy, with the same reverse-video sweep
document.querySelectorAll(".content code").forEach(code=>{
  if(code.closest("pre")) return;   // block code (fenced) is not an inline copy pill
  code.addEventListener("click", ()=>{
    doCopy(code.textContent, ()=>{ if(fxOn) sweepElement(code); });
  });
});

// reveal the page only once the web font is ready (no fallback->webfont reflow),
// then run the decode. Guarded + timeout so it always reveals even if fonts hang.
// point each box's draw-on start at its top-right CORNER (angle depends on aspect ratio)
function setBeamStarts(){
  document.querySelectorAll(".box").forEach(box=>{
    const w = box.offsetWidth, h = box.offsetHeight;
    if(w && h) box.style.setProperty("--beam-start", (Math.atan2(w, h) * 180 / Math.PI).toFixed(2) + "deg");
  });
}
let beamRAF;
window.addEventListener("resize", ()=>{ cancelAnimationFrame(beamRAF); beamRAF = requestAnimationFrame(setBeamStarts); });
setBeamStarts();

let revealed=false;
function reveal(){
  if(revealed) return; revealed=true;
  document.documentElement.classList.remove("wait-fonts");
  if(!fxOn) return;                         // fx off: everything is already static
  setBeamStarts();                          // corner angles current after font-load layout
  document.body.classList.add("go");        // border-beam draws the boxes
  rain(content, true);                      // headings, code + run boxes decode on the monospace grid
  decompress(content);                      // proportional reading prose streams in linearly
  // decode the sidebar only on the first load of this tab; on later in-tab
  // navigations it appears instantly (the content area still rains every page)
  if(sidebarEl && getComputedStyle(sidebarEl).display !== "none" && !ssGet("sidebar-rained")){
    rain(sidebarEl, false);
    ssSet("sidebar-rained", "1");
  }
}
if(document.fonts && document.fonts.ready){ document.fonts.ready.then(reveal); }
window.addEventListener("load", ()=> setTimeout(reveal, 50));  // fallback
setTimeout(reveal, 1500);                                       // hard safety
