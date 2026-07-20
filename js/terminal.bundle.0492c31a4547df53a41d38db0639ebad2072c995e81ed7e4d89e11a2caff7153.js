/* ===========================================================
   TAKEOVER CHROME (shared by the WebGL shader background + the λ-logo canvas)

   A "takeover" page opens with a 70vh empty "cinema" above .content (via a
   body.has-takeover CSS rule). As the reader scrolls, .content's opacity ramps
   from 0 to 1 over the first 50vh (and back on scroll up). A fixed "scroll ↓"
   hint fades out inversely, and --fx-opacity dims the decorative visual
   (WebGL canvas OR .lambda-logo) so the shader/logo recedes to a hint behind
   the prose.

   The chrome is decoupled from any single visual: shader.js opts in when it
   sees a `.shader-config[data-effect="takeover"]` marker; the intro λ-logo on
   the home page opts in by its mere presence. Both compose — the body class is
   set if EITHER contributes.

   Two CSS variables are also published from here so anything using
   position:fixed can align to the reading column (main minus the sidebar
   overlay when it's open on narrow screens):
     --reading-left  --reading-width
   =========================================================== */
window.Takeover = (function(){
  "use strict";

  // Reading column = main's box, minus any overlay from the off-canvas sidebar
  // (its fixed panel can cover main's left edge on narrow screens). Publishes
  // the result to :root style so any positioned element can hug it.
  function measureReadingColumn(){
    const main = document.querySelector("main");
    if(!main) return null;
    const r = main.getBoundingClientRect();
    let left = r.left, width = r.width;
    const sb = document.querySelector(".sidebar");
    if(sb){
      const s = sb.getBoundingClientRect();
      if(s.width > 0 && s.right > left){
        const shift = Math.min(s.right - left, width);
        left += shift; width -= shift;
      }
    }
    width = Math.max(1, width);
    document.body.style.setProperty("--reading-left", left + "px");
    document.body.style.setProperty("--reading-width", width + "px");
    return { left, width, height: window.innerHeight };
  }

  // Fade .content in as the reader scrolls into the cinema; fade the "scroll ↓"
  // hint out; dim --fx-opacity (from 1 to 0.25) so the decorative background
  // recedes behind the prose. Off-takeover pages: clear all three inline
  // properties so they don't linger after nav.
  function updateFade(){
    const content = document.getElementById("content");
    if(!content) return;
    if(!document.body.classList.contains("has-takeover")){
      if(content.style.opacity) content.style.opacity = "";
      document.body.style.removeProperty("--scroll-hint-opacity");
      document.body.style.removeProperty("--fx-opacity");
      return;
    }
    const range = window.innerHeight * 0.5;
    const t = range > 0 ? Math.max(0, Math.min(1, window.scrollY / range)) : 1;
    content.style.opacity = String(t);
    document.body.style.setProperty("--scroll-hint-opacity", String(1 - t));
    document.body.style.setProperty("--fx-opacity", String(1 - t * 0.75));
  }

  // Recompute both after a state change (initial load, nav, resize).
  function apply(){
    measureReadingColumn();
    updateFade();
  }

  // Callers name themselves so multiple visuals can compose the takeover
  // (e.g. a shader marker + the λ-logo on the same page). has-takeover stays
  // set while any claim is live.
  const claims = new Set();
  function claim(id){
    if(!id || claims.has(id)) return;
    claims.add(id);
    document.body.classList.add("has-takeover");
    apply();
  }
  function release(id){
    if(!id || !claims.has(id)) return;
    claims.delete(id);
    if(claims.size === 0) document.body.classList.remove("has-takeover");
    apply();
  }

  // Bound once (persistent across soft-nav). measureReadingColumn re-runs on
  // resize + when the sidebar overlay opens/closes; updateFade tracks scroll.
  function init(){
    window.addEventListener("resize", measureReadingColumn);
    window.addEventListener("scroll", updateFade, { passive: true });
    const navToggle = document.getElementById("navtoggle");
    if(navToggle) navToggle.addEventListener("change", measureReadingColumn);
  }

  return { init, claim, release, apply, measureReadingColumn, updateFade };
})();

;
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
const SETTLE = 30, DOWN = 0.25, COLSPREAD = 110, SCRAMBLE = 55, FLIP = 22.5;
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
      c.lockAt  = SETTLE + colOffset(col) + Math.max(0,c.y)*DOWN + Math.random()*20;
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
  const SPAN = 550, GARBLE = 100, FLIP = 22.5, WAIT_FLIP = 130;
  const STEP = Math.min(11, SPAN / items.length);
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

/* ===========================================================
   INTRO λ LOGO — a small swarm of phosphor glyph "entities" roaming a
   2D grid behind the oversized lambda (home page only). Each entity
   walks cell-to-cell (up/down/left/right), keeps some momentum, turns,
   pauses to "think", and drifts its own step rate — leaving a fading
   glyph trail as it goes. A shared, jumping "focus" cell gives them a
   loose common goal (a cryptographic problem they converge on, flare
   over, then chase to its next position). Trails fade via
   destination-out so the page bg shows through on any palette; the
   accent/bright colours are re-read on palette change. Paused with fx.
   =========================================================== */
function lambdaRain(){
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.querySelector(".lambda-logo");
  const canvas = box && box.querySelector(".lambda-rain");
  const ctx = canvas && canvas.getContext("2d");
  if(!ctx) return;

  // weighted toward λ so the field reads as lambdas with the odd glyph mixed in
  const GLYPHS = "λλλABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$*?/<>=+-_".split("");
  const CELL = 16;                                    // glyph cell size (css px)
  const CW = [{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0},{dx:0,dy:-1}];   // E S W N, in clockwise order
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let accent  = cssVar("--accent")    || "#dfa22c";
  let bright  = cssVar("--fg-bright") || "#d6ddd0";
  const refreshColors = () => { accent = cssVar("--accent")||accent; bright = cssVar("--fg-bright")||bright; };
  const mono = cssVar("--font-mono") || "monospace";
  const rint = n => (Math.random()*n)|0;
  const rng  = (lo,hi) => lo + Math.random()*(hi-lo);
  let w=0, h=0, gc=0, gr=0, agents=[];

  // A small ecology behind the λ:
  //  · SEEDS  — lone exotic-glyph cells; snakes circle them to grow, then they
  //             EXPLODE into a MOTHER CORE (1/4/9 cells of the same glyph).
  //  · MOTHERS— dense bright cores that emit new snakes, hand snakes their glyph
  //             to ferry off and seed elsewhere, and themselves grow 1->4->9 then
  //             detonate — the survivor's glyph ASCENDS to replace the λ overlay.
  // a deep well of esoteric candidate glyphs (Greek, math, set/logic, fraktur &
  // letterlike, supplemental operators, runic, geometric). Font coverage varies by
  // OS/browser, so this pool is filtered at runtime (see pickRenderable) down to
  // the glyphs that actually render — wide ones are squeezed to the cell on draw.
  const SIGIL_POOL = (
    "ΓΔΘΛΞΠΣΦΨΩαβγδεζηθλμξπρςστφχψϝϕϖϰϱϴ" +
    "∀∂∃∄∅∆∇∈∉∋∌∏∐∑∓∕∗∘∙√∛∜∝∞∟∠∡∢∣∤∥∦∧∨∩∪∫∬∭∮∯∰∱∲∳" +
    "∴∵∸∺∻∼∽∾≀≁≂≃≄≅≆≇≈≉≊≋≌≍≎≏≐≑≒≓≖≗≘≙≚≛≜≝≞≟≠≡≢≣≤≥≦≧≨≩≪≫≬≭" +
    "⊂⊃⊄⊅⊆⊇⊈⊉⊊⊋⊌⊍⊎⊏⊐⊑⊒⊓⊔⊕⊖⊗⊘⊙⊚⊛⊜⊝⊞⊟⊠⊡⊢⊣⊤⊥⊦⊧⊨⊩⊪⊫⊰⊱⊲⊳⊴⊵⊶⊷⊸⊹⊺⊻⊼⊽⊾⊿" +
    "⋀⋁⋂⋃⋄⋅⋆⋇⋈⋉⋊⋋⋌⋍⋎⋏⋐⋑⋒⋓⋔⋕⋖⋗⋘⋙⋚⋛⋜⋝⋞⋟⋠⋡⋢⋣⋈⋔⋊⋉" +
    "ℂℇℊℋℌℍℎℏℐℑℒℓℕ℘ℙℚℛℜℝℤℨℬℭℯℰℱℲℳℴℵℶℷℸⅅⅆⅈⅉ" +
    "⟀⟁⟂⟃⟄⟇⟊⟐⟑⟒⟓⟔⟕⟖⟗⟠⟡⟢⟣⟤⟥⦀⦁⦙⦚⦛⦜⦝⦣⦤⦥⦦⦧" +
    "⨀⨁⨂⨃⨄⨅⨆⨉⨊⨍⨎⨏⨐⨑⨒⨓⨔⨕⨖⨗⨙⨚⨛⨜⨝⨞⨟⨠⨡⩀⩁⩂⩃⩄⩅⩆⩇⩈⩉⩊⩋⩌⩍" +
    "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚻᚾᛁᛃᛇᛈᛉᛊᛋᛏᛒᛖᛗᛚᛝᛟᛞᛤᛥ" +
    "◆◇◈◉◊◍◎◐◑◒◓◔◕△▽◁▷⟁✶✷✸✹✺❉❈⁂⁕⌖⍟⎔⏥"
  ).split("");

  // Keep only glyphs the font stack can actually draw: render each to an offscreen
  // canvas and drop the ones that come out blank or as tofu. Tofu is detected by
  // comparing against the .notdef rendering of codepoints guaranteed missing in
  // every font: a ".notdef box" (incl. the "hex-in-a-box" kind, whose interior
  // digits differ per codepoint) has the SAME outer rectangle + border frame as
  // the reference, so matching that signature is robust where a fixed shape test
  // isn't. One-time, at start.
  function pickRenderable(pool){
    const S = 22, pad = 4, W = S + pad*2;
    const cv = document.createElement("canvas"); cv.width = cv.height = W;
    const o = cv.getContext("2d", { willReadFrequently:true });
    if(!o) return pool;
    o.textBaseline = "top";
    // bitmap signature for one char: bounding box + how solid its border ring is
    const sig = ch => {
      o.clearRect(0,0,W,W); o.font = S + "px " + mono; o.fillStyle = "#fff";
      o.fillText(ch, pad, pad);
      const d = o.getImageData(0,0,W,W).data;
      const on = (x,y)=> d[(y*W+x)*4+3] > 40;
      let n=0, minx=W,miny=W,maxx=-1,maxy=-1;
      for(let y=0;y<W;y++) for(let x=0;x<W;x++) if(on(x,y)){ n++; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; }
      if(n < 3) return { blank:true };
      const bw = maxx-minx+1, bh = maxy-miny+1;
      let edge=0, tot=0;
      for(let x=minx;x<=maxx;x++){ edge += on(x,miny)+on(x,maxy); tot+=2; }
      for(let y=miny;y<=maxy;y++){ edge += on(minx,y)+on(maxx,y); tot+=2; }
      return { blank:false, bw, bh, frame: tot ? edge/tot : 0 };
    };
    // reference tofu: codepoints no font assigns (a noncharacter + far unassigned
    // planes). Whatever the platform draws for these IS its .notdef box.
    const refs = [0x10FFFF, 0xFDD0, 0xE0FFF].map(cp=> sig(String.fromCodePoint(cp))).filter(s=> !s.blank);
    const looksLikeRef = s => refs.some(r=>
      Math.abs(s.bw-r.bw) <= 2 && Math.abs(s.bh-r.bh) <= 2 && s.frame > 0.5 && r.frame > 0.5);
    const renderable = ch => {
      const s = sig(ch);
      if(s.blank) return false;                                 // renders nothing -> missing
      if(looksLikeRef(s)) return false;                         // matches the .notdef box -> tofu
      if(s.bw >= S*0.55 && s.bh >= S*0.65 && s.frame > 0.7) return false;  // fallback: solid cell-filling frame
      return true;
    };
    const out = pool.filter(renderable);
    return out.length >= 12 ? out : pool;                       // safety: never end up with too few
  }
  const SIGILS = pickRenderable(SIGIL_POOL);
  const MAX_SEEDS = 14, MAX_LEVEL = 5, MAX_SNAKES = 40;
  const OFFSETS = { 1:[[0,0]], 4:[[0,0],[1,0],[0,1],[1,1]], 9:[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]] };
  let seeds = [], cores = [], occupied = new Set(), sites = [], nextSpawn = 0;
  const key = (x,y) => x + "," + y;
  const glyphEl = box.querySelector(".lambda-glyph");

  // draw a glyph fitted to the grid cell — if the font substitutes a wider glyph
  // for an exotic symbol, squeeze it horizontally so it never overdraws its cell
  function drawGlyph(g, cx, cy, fontSize, color, alpha){
    ctx.font = fontSize + "px " + mono; ctx.fillStyle = color; ctx.globalAlpha = alpha;
    const wd = ctx.measureText(g).width;
    if(wd > CELL){ ctx.save(); ctx.translate(cx, cy); ctx.scale(CELL/wd, 1); ctx.fillText(g, 0, 0); ctx.restore(); }
    else ctx.fillText(g, cx, cy);
    ctx.globalAlpha = 1;
  }

  // persistent personalities so each entity reads as its own creature, not one
  // shared clock: how fast (iv ms/step), how straight (mom), how shy of reversing
  // (rev), whether it traces loops (turn: steps/side -> squares & figure-eights),
  // how strongly it's drawn to the nearest structure, and how often/long it rests.
  const KINDS = [
    {k:"dart",  iv:[42,72],   mom:7,  rev:0.15, turn:0,    focus:3.0, rest:0.16, restMs:[150,650],  flip:0.30},
    {k:"crawl", iv:[180,320], mom:3,  rev:0.30, turn:0,    focus:4.5, rest:0.05, restMs:[300,1000], flip:0.15},
    {k:"line",  iv:[80,130],  mom:16, rev:0.04, turn:0,    focus:0.8, rest:0.03, restMs:[200,500],  flip:0.08},
    {k:"loop",  iv:[70,120],  mom:0,  rev:0,    turn:[3,6],focus:0.1, rest:0.02, restMs:[150,400],  flip:0.20},
    {k:"rest",  iv:[95,170],  mom:4,  rev:0.30, turn:0,    focus:3.5, rest:0.42, restMs:[500,1700], flip:0.22},
  ];
  const rotate = (d, b) => CW[(CW.findIndex(c=> c.dx===d.dx && c.dy===d.dy) + b + 4) & 3];

  const spawn = (x, y) => {
    const t = KINDS[rint(KINDS.length)];
    return {
      t,
      x: x === undefined ? rint(gc) : x,
      y: y === undefined ? rint(gr) : y,
      dir: CW[rint(4)],
      interval: rng(t.iv[0], t.iv[1]),    // fixed characteristic cadence (+ jitter per step)
      next: performance.now() + rng(0, 500),   // de-sync the first move so they don't tick together
      glyph: GLYPHS[rint(GLYPHS.length)],
      turnEvery: t.turn ? Math.round(rng(t.turn[0], t.turn[1])) : 0,
      bias: Math.random()<0.5 ? 1 : -1,   // loop handedness (CW / CCW)
      n: 0,                               // step counter (drives looper turns)
      carry: null, carryAt: 0, cooldown: 0,   // a glyph picked up from a mother, to seed elsewhere
    };
  };

  function resize(){
    const r = box.getBoundingClientRect();
    w = r.width; h = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.max(1, Math.round(w*dpr));
    canvas.height = Math.max(1, Math.round(h*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.font = CELL + "px " + mono;
    ctx.textBaseline = "top";
    gc = Math.max(1, Math.floor(w / CELL));
    gr = Math.max(1, Math.floor(h / CELL));
    const want = Math.min(22, Math.max(6, Math.round(gc*gr/70)));
    agents = Array.from({length:want}, ()=> spawn());
    // reset the world for the new grid, then seed a few growable cells
    seeds = []; cores = []; occupied = new Set(); sites = []; nextSpawn = 0;
    for(let i=0;i<3;i++) seedCell();
  }

  const inBounds = (x,y) => x>=0 && x<gc && y>=0 && y<gr;
  const passable = (x,y) => inBounds(x,y) && !occupied.has(key(x,y));   // structure cells are walls -> snakes circle them

  function emptyCell(){
    for(let i=0;i<24;i++){ const x=rint(gc), y=rint(gr); if(!occupied.has(key(x,y))) return {x,y}; }
    return null;
  }
  // GROWABLE SEED — a lone cell snakes circle to grow; matures into a mother core
  function seedCell(x, y, glyph){
    if(seeds.length >= MAX_SEEDS) return;
    if(x === undefined){ const c = emptyCell(); if(!c) return; x = c.x; y = c.y; }
    if(!inBounds(x,y) || occupied.has(key(x,y))) return;
    seeds.push({ x, y, glyph: glyph || SIGILS[rint(SIGILS.length)], energy: 50, level: 1, flash: 0, born: performance.now() });
    occupied.add(key(x,y));
  }
  const removeSeed = s => { const k = seeds.indexOf(s); if(k>=0) seeds.splice(k,1); occupied.delete(key(s.x,s.y)); };

  // MOTHER CORE — a dense block (1/4/9 cells) of one glyph. coreCells lays out the
  // footprint; makeCore claims it; expandCore grows the footprint; remove frees it.
  const coreCells = (ax,ay,size) => OFFSETS[size].map(([dx,dy])=>({x:ax+dx,y:ay+dy})).filter(c=> inBounds(c.x,c.y));
  function makeCore(ax, ay, glyph, size, now){
    const cells = coreCells(ax,ay,size).filter(c=> !occupied.has(key(c.x,c.y)));
    if(!cells.length) return;
    for(const c of cells) occupied.add(key(c.x,c.y));
    cores.push({ ax, ay, glyph, size, cells, energy: 45, flash: now, born: now, emitAt: now + rng(1500,3500) });
  }
  function expandCore(c, size, now){
    for(const cell of c.cells) occupied.delete(key(cell.x,cell.y));        // release old footprint
    c.cells = coreCells(c.ax,c.ay,size).filter(cc=> !occupied.has(key(cc.x,cc.y)));
    for(const cell of c.cells) occupied.add(key(cell.x,cell.y));
    c.size = size; c.flash = now;
  }
  const removeCore = c => { const k = cores.indexOf(c); if(k>=0) cores.splice(k,1); for(const cell of c.cells) occupied.delete(key(cell.x,cell.y)); };

  resize();
  let rraf;
  const scheduleResize = ()=>{ cancelAnimationFrame(rraf); rraf = requestAnimationFrame(()=>{ refreshColors(); resize(); }); };
  window.addEventListener("resize", scheduleResize);
  // .lambda-logo is fixed to the reading column via --reading-left/-width vars
  // that Takeover republishes when the sidebar overlay opens/closes on narrow
  // viewports; the CSS box then changes size without a window resize firing.
  // ResizeObserver catches those layout changes so the canvas buffer stays 1:1.
  if(window.ResizeObserver) new ResizeObserver(scheduleResize).observe(box);
  // adopt the palette live when the theme toggle flips data-theme on <html>
  if(window.MutationObserver) new MutationObserver(refreshColors).observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] });

  function step(a, now){
    const t = a.t;
    // rest/think: hold still and let the trail fade — no re-stamp (no blink)
    if(Math.random() < t.rest){ a.next = now + rng(t.restMs[0], t.restMs[1]); return; }

    if(a.turnEvery){
      // looper: turn a fixed amount every few steps -> squares; flip handedness
      // once per loop -> figure-eights. bounce off walls by turning until clear.
      a.n++;
      if(a.n % a.turnEvery === 0) a.dir = rotate(a.dir, a.bias);
      if(a.n % (a.turnEvery*4) === 0) a.bias = -a.bias;
      let d = a.dir, tries = 0;
      while(!passable(a.x+d.dx, a.y+d.dy) && tries++ < 4) d = rotate(d, a.bias);
      a.dir = d; if(passable(a.x+d.dx, a.y+d.dy)){ a.x += d.dx; a.y += d.dy; }
    } else {
      // wanderer: weight in-bounds moves by momentum + reverse-aversion, plus a
      // pull toward the nearest structure. It can't step onto one (impassable),
      // so the attraction makes it orbit — circling the cell it's feeding.
      let tx=0, ty=0, best=1e9;
      if(!a.carry) for(const s of sites){ const dd = Math.abs(s.x-a.x)+Math.abs(s.y-a.y); if(dd<best){ best=dd; tx=s.x; ty=s.y; } }
      const seek = best < 1e9;   // a courier carrying a glyph ignores sites and drifts off to deposit it
      const cand = [];
      for(const d of CW){
        if(!passable(a.x+d.dx, a.y+d.dy)) continue;          // walls + structures: impassable
        let wgt = 1;
        if(d === a.dir) wgt += t.mom;                        // keep heading
        else if(d.dx === -a.dir.dx && d.dy === -a.dir.dy) wgt *= t.rev;   // seldom about-face
        if(seek){
          const pull = t.focus * (best <= 5 ? 2 : 1);     // commit harder once close -> locks into orbit
          if(Math.sign(tx-a.x) === d.dx && d.dx) wgt += pull;
          if(Math.sign(ty-a.y) === d.dy && d.dy) wgt += pull;
        }
        cand.push({d, wgt});
      }
      if(cand.length){
        let total = 0; for(const c of cand) total += c.wgt;
        let pick = Math.random()*total, chosen = cand[0].d;
        for(const c of cand){ pick -= c.wgt; if(pick <= 0){ chosen = c.d; break; } }
        a.dir = chosen; a.x += chosen.dx; a.y += chosen.dy;
      }
    }
    // keep the glyph mostly stable so the head glides instead of flickering
    if(Math.random() < t.flip && !a.carry) a.glyph = GLYPHS[rint(GLYPHS.length)];

    // circling a growable seed feeds it
    for(const s of seeds){ const dd = Math.abs(s.x-a.x)+Math.abs(s.y-a.y); if(dd<=2) s.energy += dd===1 ? 11 : 5; }
    // at a mother core: feed it, and pick up its glyph to ferry to a fresh site
    for(const c of cores){
      let dd = 1e9; for(const cell of c.cells){ const e = Math.abs(cell.x-a.x)+Math.abs(cell.y-a.y); if(e<dd) dd=e; }
      if(dd<=2){ c.energy += dd===1 ? 9 : 4; if(!a.carry && now>=a.cooldown){ a.carry = c.glyph; a.carryAt = now; } }
    }
    // carrying: once clear of every site, drop the glyph as a new growing cell
    if(a.carry){
      let near=false; for(const s of sites){ if(Math.abs(s.x-a.x)+Math.abs(s.y-a.y) <= 3){ near=true; break; } }
      if(!near && now-a.carryAt>1200 && passable(a.x,a.y) && Math.random()<0.2){ seedCell(a.x,a.y,a.carry); a.carry=null; a.cooldown=now+4000; }
      else if(now-a.carryAt > 12000){ a.carry=null; a.cooldown=now+2000; }   // gave up — drop the payload
    }

    if(a.carry){
      // couriers (the bright ones) are EATERS: they carve the trail field to black
      // in their wake — the head cell + the cell just behind it form a clean black
      // channel — then glow with the payload glyph. (Structures are repainted by
      // drawSites afterward, so only loose trail glyphs get eaten.)
      ctx.clearRect(a.x*CELL, a.y*CELL, CELL, CELL);
      ctx.clearRect((a.x-a.dir.dx)*CELL, (a.y-a.dir.dy)*CELL, CELL, CELL);
      drawGlyph(a.carry, a.x*CELL, a.y*CELL, CELL, bright, 1);
    }
    else { ctx.fillStyle = accent; ctx.fillText(a.glyph, a.x*CELL, a.y*CELL); }   // colored snakes leave a fading trail

    // light per-step jitter so the cadence isn't metronomic; base rate persists
    a.next = now + a.interval*(0.85 + Math.random()*0.3);
  }

  // grow / decay / explode the growable seeds (snapshot-safe against blasts)
  function updateSeeds(now){
    for(const s of seeds.slice()){
      if(seeds.indexOf(s) < 0) continue;                  // already gone (caught in a blast this tick)
      s.energy -= (now - s.born < 6000) ? 0.02 : 0.06;    // grace so fresh cells can attract a snake
      const need = 45 + 30*s.level;
      if(s.energy >= need){
        if(s.level >= MAX_LEVEL){ explodeSeed(s, now); continue; }   // matured -> detonate into a mother
        s.level++; s.energy = need*0.35; s.flash = now;
        const nb = CW.map(d=>({x:s.x+d.dx, y:s.y+d.dy})).filter(c=> passable(c.x,c.y));
        if(nb.length){ const c = nb[rint(nb.length)]; seedCell(c.x, c.y, s.glyph); }   // sprout the same glyph
      }
      if(s.energy <= 0){ if(--s.level <= 0) removeSeed(s); else s.energy = 12; }
    }
    if(now >= nextSpawn){ nextSpawn = now + rng(2600, 6000); seedCell(); }   // a fresh random lineage now and then
  }

  // a matured seed detonates: clear a radius (paths back to black), wipe seeds in
  // it, and GIVE RISE to a mother core (1/4/9 cells of the same glyph)
  function explodeSeed(s, now){
    const R = 4;
    ctx.clearRect((s.x-R)*CELL, (s.y-R)*CELL, (2*R+1)*CELL, (2*R+1)*CELL);
    for(const o of seeds.slice()){ if(Math.abs(o.x-s.x)<=R && Math.abs(o.y-s.y)<=R) removeSeed(o); }
    makeCore(s.x, s.y, s.glyph, 1, now);                 // mothers are always born small and must grow 1->4->9
    for(const a of agents){ if(Math.abs(a.x-s.x)<=R && Math.abs(a.y-s.y)<=R){ a.dir = a.x>=s.x?CW[0]:CW[2]; a.glyph = GLYPHS[rint(GLYPHS.length)]; } }
  }

  // mother cores: emit snakes, grow 1->4->9 as snakes feed them, then detonate
  function updateCores(now){
    for(const c of cores.slice()){
      if(cores.indexOf(c) < 0) continue;
      c.energy -= 0.04;                                    // durable: slow decay
      if(now >= c.emitAt){                                 // birth a snake from the anchor
        c.emitAt = now + rng(4000,8000) * (3/(c.size+2));  // denser cores emit faster
        if(agents.length < MAX_SNAKES) agents.push(spawn(c.ax, c.ay));
      }
      const need = c.size===1 ? 120 : c.size===4 ? 210 : 360;
      if(c.energy >= need){
        if(c.size < 9){ expandCore(c, c.size===1 ? 4 : 9, now); c.energy = need*0.4; }
        else { finalExplode(c, now); continue; }           // a 9-core grown further -> detonate + claim the overlay
      }
      if(c.energy <= 0) removeCore(c);                      // starved core dissolves
    }
  }

  // the climactic blast: a maxed mother detonates and its glyph ASCENDS to replace
  // the big λ on the overlay (the world's new sigil). Ascending costs every OTHER
  // mother one tier (9->4, 4->1, 1->dead) so the new champion reigns while they
  // recuperate — and one fresh size-1 mother of the same glyph keeps its lineage.
  function finalExplode(c, now){
    const R = 6;
    ctx.clearRect((c.ax-R)*CELL, (c.ay-R)*CELL, (2*R+1)*CELL, (2*R+1)*CELL);
    for(const s of seeds.slice()){ if(Math.abs(s.x-c.ax)<=R && Math.abs(s.y-c.ay)<=R) removeSeed(s); }
    removeCore(c);                                       // the champion is consumed by its ascent
    for(const o of cores.slice()){                       // every rival recedes one tier and must rebuild
      const ns = o.size>=9 ? 4 : o.size>=4 ? 1 : 0;
      if(ns === 0) removeCore(o);                         // a size-1 rival dies outright
      else { expandCore(o, ns, now); o.energy = 35; }
    }
    if(glyphEl){ glyphEl.textContent = c.glyph; glyphEl.classList.remove("swap"); void glyphEl.offsetWidth; glyphEl.classList.add("swap"); }
    const heir = emptyCell();                             // guarantee the lineage continues
    if(heir) makeCore(heir.x, heir.y, c.glyph, 1, now);
    let rivalGlyph = SIGILS[rint(SIGILS.length)];          // and seed a rival of a different glyph to even things out
    if(SIGILS.length > 1) while(rivalGlyph === c.glyph) rivalGlyph = SIGILS[rint(SIGILS.length)];
    const rivalAt = emptyCell();
    if(rivalAt) makeCore(rivalAt.x, rivalAt.y, rivalGlyph, 1, now);
    for(const a of agents){ if(Math.abs(a.x-c.ax)<=R && Math.abs(a.y-c.ay)<=R) a.dir = a.x>=c.ax?CW[0]:CW[2]; }
  }

  // sites are redrawn each frame so the trail-fade never erases them
  function drawSites(now){
    for(const s of seeds){                                 // growable seeds: dim accent, brightening with level
      const flaring = now - s.flash < 220;
      drawGlyph(s.glyph, s.x*CELL, s.y*CELL, CELL + (s.level-1)*3, flaring ? bright : accent,
                Math.min(1, 0.4 + 0.13*s.level + (flaring ? 0.35 : 0)));
    }
    for(const c of cores){                                 // mother cells: bright phosphene block
      for(const cell of c.cells) drawGlyph(c.glyph, cell.x*CELL, cell.y*CELL, CELL+2, bright, 1);
    }
    ctx.font = CELL + "px " + mono;                         // restore for snake glyphs
  }

  function frame(now){
    if(!canvas.isConnected) return;   // canvas was swapped out by a soft-nav -> let this loop die (a fresh one runs for the new canvas)
    if(!document.body.classList.contains("no-fx")){
      ctx.globalCompositeOperation = "destination-out";   // fade the field -> trails
      ctx.fillStyle = "rgba(0,0,0,0.025)";                 // gentle fade: instant-on glyphs ease off, not blink
      ctx.fillRect(0,0,w,h);
      ctx.globalCompositeOperation = "source-over";
      sites = [];                                          // everything snakes can sense/orbit this tick
      for(const s of seeds) sites.push(s);
      for(const c of cores) for(const cell of c.cells) sites.push(cell);
      ctx.font = CELL + "px " + mono;
      for(const a of agents){ if(now >= a.next) step(a, now); }
      updateSeeds(now);
      updateCores(now);
      drawSites(now);
    }
    requestAnimationFrame(frame);
  }
  box.classList.add("rain-on");        // CSS fades the canvas in
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

// settings modal: the gear in the sidebar action row opens a <dialog> holding the
// theme + fx controls above. Escape closes natively; we add open / close-button /
// click-on-backdrop handling.
(function(){
  const open = document.getElementById("settings-open");
  const dlg  = document.getElementById("settings");
  if(!open || !dlg || typeof dlg.showModal !== "function") return;
  open.addEventListener("click", ()=> dlg.showModal());
  const x = dlg.querySelector(".settings-close");
  if(x) x.addEventListener("click", ()=> dlg.close());
  // a click whose target is the dialog itself landed on the backdrop, not the content
  dlg.addEventListener("click", e=>{ if(e.target === dlg) dlg.close(); });
})();

// off-canvas sidebar on narrow screens. Open/closed is a pure-CSS checkbox
// (#navtoggle) so the menu works with JS disabled; here we only enhance it with
// the terminal decode-in on first open and an eager close on in-page nav.
const navToggle = document.getElementById("navtoggle");
const sidebarEl = document.querySelector(".sidebar");
function scrollActiveBlogTagIntoView(){
  const tree = sidebarEl && sidebarEl.querySelector(".tree");
  const activeLink = tree && tree.querySelector(".blog-nav a.active");
  if(!tree || !activeLink || tree.clientHeight === 0) return;
  // position the active tag at the middle of the tree *only* — scrollIntoView would
  // also bubble up and scroll the page/window (yanking the article to the top).
  // Jump there instantly (no smooth motion): it should just be where it needs to be.
  const treeRect = tree.getBoundingClientRect();
  const linkRect = activeLink.getBoundingClientRect();
  const target = tree.scrollTop + (linkRect.top - treeRect.top) - (tree.clientHeight - linkRect.height) / 2;
  tree.scrollTop = Math.max(0, Math.min(target, tree.scrollHeight - tree.clientHeight));
}
function queueActiveBlogTagScroll(){
  requestAnimationFrame(()=> requestAnimationFrame(scrollActiveBlogTagIntoView));
}
function onNavChange(){
  // decode the menu like a terminal, but only the first time it opens this tab
  // (matches the wide-view reveal gating; later opens appear instantly)
  if(navToggle && navToggle.checked && sidebarEl && fxOn && !ssGet("sidebar-rained")){
    rain(sidebarEl, false);
    ssSet("sidebar-rained", "1");
  }
  if(navToggle && navToggle.checked) queueActiveBlogTagScroll();
}
if(navToggle) navToggle.addEventListener("change", onNavChange);
queueActiveBlogTagScroll();
if(document.fonts && document.fonts.ready) document.fonts.ready.then(queueActiveBlogTagScroll);
window.addEventListener("load", queueActiveBlogTagScroll);
// the backdrop <label> already closes via CSS; closing on tree-link clicks also
// covers same-page anchor jumps that don't reload (a full navigation resets the
// checkbox on its own). The tree is swapped per page on soft-nav, so rebind after
// each swap (see reinitAfterNav).
function wireSidebarLinks(){
  document.querySelectorAll(".sidebar .tree a").forEach(a=> a.addEventListener("click", ()=>{ if(navToggle) navToggle.checked = false; }));
}
wireSidebarLinks();

// page outline: the SECOND index (this page's h2/h3 sections) shown in the
// header "#" expander. The list and open/close are rendered/handled by the
// template + a CSS checkbox (see pagenav.html), so the outline works with JS
// off; here we add smooth scrolling, close-on-pick / outside / Escape, and the
// scroll-spy highlight. The .topnav (and its #toc panel) is swapped per page on
// soft-nav, so the per-page refs are rebound by wirePagenav(); the document /
// window listeners below are wired ONCE and read those mutable refs.
let tocCb = null, tocPanel = null, tocToggle = null;
let tocLinks = [], tocHeads = [], tocById = {}, tocTitleLink = null;
const tocClose = () => { if(tocCb) tocCb.checked = false; };
// scroll-spy: highlight the section the viewport is currently in — the last
// heading whose top has scrolled past a line near the top of the viewport.
// Recomputed on every scroll (never stale); above the first heading it falls
// back to the title entry.
function tocSpy(){
  if(!tocHeads.length) return;
  let current = null;
  for(const h of tocHeads){ if(h.getBoundingClientRect().top <= 90) current = h.id; else break; }
  const want = current ? tocById["#" + current] : tocTitleLink;
  tocLinks.forEach(a=> a.classList.toggle("active", a === want));
}
function wirePagenav(){
  tocCb     = document.getElementById("toctoggle");
  tocPanel  = document.getElementById("toc");
  tocToggle = document.querySelector(".toc-toggle");
  tocLinks = []; tocHeads = []; tocById = {}; tocTitleLink = null;
  if(!tocPanel || !content) return;
  tocLinks = [...tocPanel.querySelectorAll("a[href^='#']")];
  // bound to the freshly swapped panel each navigation, so no stale handlers leak
  tocPanel.addEventListener("click", e=>{
    const a = e.target.closest("a"); if(!a) return;
    const href = a.getAttribute("href");
    if(href === "#"){                                 // title -> all the way to the very top
      e.preventDefault();
      window.scrollTo({ top:0, behavior:"smooth" });
    } else if(href && href.charAt(0) === "#"){        // in-page heading -> smooth scroll
      const el = document.getElementById(decodeURIComponent(href.slice(1)));
      if(el){ e.preventDefault(); el.scrollIntoView({ behavior:"smooth", block:"start" }); }
    }
    // any other href (a child-page link on a book/chapter index) navigates normally
    tocClose();
  });
  tocHeads = [...content.querySelectorAll("h2, h3")].filter(h=> h.id);
  tocLinks.forEach(a=>{ tocById[a.getAttribute("href")] = a; });
  tocTitleLink = tocById["#"];   // the lvl1 page-title entry (jumps to top)
  tocSpy();
}
// close on a click outside the panel. Ignore the checkbox's own toggle click
// (clicking the label synthesizes a click on the input) — otherwise the open
// click would be read as an outside click and close it again immediately.
document.addEventListener("click", e=>{ if(tocCb && tocCb.checked && e.target !== tocCb && tocPanel && !tocPanel.contains(e.target) && !(tocToggle && tocToggle.contains(e.target))) tocClose(); });
document.addEventListener("keydown", e=>{ if(e.key === "Escape") tocClose(); });
let spyRAF = 0;
const queueSpy = ()=>{ if(!spyRAF) spyRAF = requestAnimationFrame(()=>{ spyRAF = 0; tocSpy(); }); };
addEventListener("scroll", queueSpy, { passive:true });
addEventListener("resize", queueSpy, { passive:true });
wirePagenav();

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
      a.click();   // route through the SPA click handler so navigation is soft
    }
  });
})();

// terminal prompt bar. Two jobs, both re-run per page because .topbar .cmd is
// swapped on soft-nav: (1) each path segment is its own link to that subsection;
// the visitor@host: prefix and the leading ~ link to the site root, and the
// current page's own segment replays the intro by reloading.
// (2) keep the prompt on ONE line: drop the prefix when the whole line won't fit,
// then left-truncate the path — hide whole leading segments behind a leading …,
// char-truncating the boundary segment. Monospace => exact character math.
let fitPrompt = ()=>{};
function wirePrompt(){
  const cmd = document.querySelector(".topbar .cmd");
  const pathEl = cmd && cmd.querySelector(".path");
  if(!cmd || !pathEl){ fitPrompt = ()=>{}; return; }
  const prefix = cmd.querySelector(".prefix");
  const ell = pathEl.querySelector(".pell");
  const segs = Array.from(pathEl.querySelectorAll(".pseg"));
  segs.forEach(s=>{ if(s.dataset.full == null) s.dataset.full = s.textContent; });
  const fullLen = segs.reduce((n,s)=> n + s.dataset.full.length, 0);
  const prefixLen = prefix ? prefix.textContent.length : 0;
  function charW(){
    const r = document.createElement("span");
    r.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:inherit;";
    r.textContent = "0".repeat(40); cmd.appendChild(r);
    const w = r.getBoundingClientRect().width / 40; r.remove();
    return w || 8;
  }
  fitPrompt = function(){
    const cols = Math.floor(cmd.clientWidth / charW()) - 1;   // -1 char safety margin
    segs.forEach(s=>{ s.style.display = ""; if(s.textContent !== s.dataset.full) s.textContent = s.dataset.full; });
    if(ell) ell.hidden = true;
    const showPrefix = (prefixLen + fullLen) <= cols;
    cmd.classList.toggle("hide-prefix", !showPrefix);
    const room = cols - (showPrefix ? prefixLen : 0);
    if(fullLen <= room) return;                              // everything fits
    if(ell) ell.hidden = false;                             // leading … + suffix
    let budget = Math.max(1, room - 1);
    for(let i = segs.length - 1; i >= 0; i--){
      const s = segs[i], t = s.dataset.full;
      if(t.length <= budget){ budget -= t.length; }          // whole segment fits
      else if(budget > 0){ s.textContent = t.slice(t.length - budget); budget = 0; }
      else { s.style.display = "none"; }                     // dropped behind the …
    }
  };
  const curLink = cmd.querySelector("a.pcur");
  if(curLink) curLink.addEventListener("click", e=>{ e.preventDefault(); location.reload(); });
  fitPrompt();
}
let promptRAF;
window.addEventListener("resize", ()=>{ cancelAnimationFrame(promptRAF); promptRAF = requestAnimationFrame(()=> fitPrompt()); });
if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=> fitPrompt());
wirePrompt();

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
function wireCopyButtons(root){
  // .diffbox owns its copy button (wireDiffBoxes) so it can copy the *visible*
  // pane rather than the first .body pre -> exclude it here.
  (root || content || document).querySelectorAll(".box:not(.diffbox) .copy").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const pre = btn.closest(".box").querySelector(".body pre");
      doCopy(pre ? pre.textContent : "", ()=> copied(btn));
    });
  });
}
wireCopyButtons(content);
// diffbox: a code box that toggles between a GitHub-style diff and the full
// source of the evolved block. Server-side we ship three Chroma-highlighted
// blocks (the diff lexer = no-JS fallback + structure; the :to source = the
// Source view; the hidden :from source). Here we parse the diff and rebuild it
// as a line-numbered unified table with per-line syntax colors and green/red
// blocked lines. The chosen view (diff/source) is baked in so it reads without
// JS; html.js reveals the toggle + copy controls.
function wireDiffBoxes(root){
  // pull per-line highlighted HTML out of a Chroma block (noClasses): each code
  // line is a top-level <span style="display:flex"> inside code[class*=language]
  // (the line-number column's <code> carries no language class, so it's skipped).
  const linesOf = block=>{
    if(!block) return [];
    const code = block.querySelector('code[class*="language"]') || block.querySelector("code");
    if(!code) return [];
    return Array.from(code.children).map(span=>{
      const inner = span.firstElementChild || span;
      return (inner.innerHTML || "").replace(/\n$/, "");
    });
  };
  const esc = s=> s.replace(/[&<>]/g, ch=>({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[ch]));
  const cell = html=>{ const v = html != null ? html : ""; return v === "" ? "\u200B" : v; };  // ZWSP keeps blank lines tall
  // "what got copied" flash matching the run boxes: a reverse-video select-all
  // that SWEEPS across the text. It grows a native selection char-by-char (so the
  // Chroma highlighting survives, unlike the run-box char-span sweep); the themed
  // `.diffbox ::selection' paints it the same white-on-black as `.ch.sel'.
  const clearSel = ()=>{ try{ window.getSelection().removeAllRanges(); }catch(e){} };
  const sweepSelect = el=>{
    if(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sel = window.getSelection();
    const nodes = []; let total = 0, tn;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while((tn = walker.nextNode())){ if(tn.nodeValue.length){ nodes.push([tn, total]); total += tn.nodeValue.length; } }
    if(!total) return;
    const last = nodes[nodes.length-1][0];
    const at = idx=>{ for(let i=nodes.length-1;i>=0;i--){ if(idx >= nodes[i][1]) return [nodes[i][0], Math.min(idx-nodes[i][1], nodes[i][0].nodeValue.length)]; } return [nodes[0][0], 0]; };
    const range = document.createRange(); range.setStart(nodes[0][0], 0);
    const to = idx=>{ const [nn,oo] = at(idx); try{ range.setEnd(nn, oo); sel.removeAllRanges(); sel.addRange(range); }catch(e){} };
    const full = ()=>{ try{ range.setEnd(last, last.nodeValue.length); sel.removeAllRanges(); sel.addRange(range); }catch(e){} };
    const DUR = 300, t0 = performance.now();
    (function frame(now){
      const p = Math.min(1, (now - t0) / DUR);
      to(Math.floor(p * total));
      if(p < 1){ requestAnimationFrame(frame); return; }
      full();                                   // ensure the tail is selected, then flash
      setTimeout(clearSel, 85);
      setTimeout(full, 140);
      setTimeout(clearSel, 220);
    })(performance.now());
  };

  (root || content || document).querySelectorAll(".diffbox").forEach(box=>{
    if(box.dataset.diffWired) return;            // idempotent across load + soft-nav
    box.dataset.diffWired = "1";
    const lt = box.querySelector(".label .lt");
    const diffPane = box.querySelector(".diff-pane");
    const srcPane = box.querySelector(".src-pane");
    const raw = box.querySelector(".diff-raw");
    const fromLines = linesOf(box.querySelector(".diff-from"));
    const toLines = linesOf(srcPane);            // the :to source IS the Source view
    const toggle = box.querySelector(".diff-toggle");
    const copy = box.querySelector(".copy");

    // parse the rendered unified diff (diff lexer block) into typed rows, mapping
    // each row to its highlighted line in the from/to source via line numbers.
    const rows = [];
    const rawCode = raw && (raw.querySelector('code[class*="language"]') || raw.querySelector("code"));
    if(rawCode){
      let o = 0, n = 0, started = false;
      for(const span of rawCode.children){
        const line = (span.textContent || "").replace(/\n$/, "");
        const hm = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if(hm){ o = +hm[1]; n = +hm[2]; started = true; rows.push({ type:"hunk", text:line }); continue; }
        if(!started) continue;                   // skip the --- / +++ file header
        const c = line[0];
        if(c === "+"){ rows.push({ type:"add", newNum:n, html:toLines[n-1] }); n++; }
        else if(c === "-"){ rows.push({ type:"del", oldNum:o, html:fromLines[o-1] }); o++; }
        else if(c === "\\"){ /* "\ No newline at end of file" */ }
        else { rows.push({ type:"ctx", oldNum:o, newNum:n, html:toLines[n-1] }); o++; n++; }
      }
    }

    const buildUnified = ()=>{
      const t = document.createElement("table"); t.className = "dt dt-unified";
      const tb = document.createElement("tbody");
      for(const r of rows){
        const tr = document.createElement("tr");
        if(r.type === "hunk"){
          tr.className = "dl-hunk";
          tr.innerHTML = '<td class="dl-n"></td><td class="dl-n"></td><td class="dl-mark"></td><td class="dl-code">'+esc(r.text)+"</td>";
        } else {
          tr.className = "dl-"+r.type;
          const sign = r.type === "add" ? "+" : r.type === "del" ? "-" : "";
          tr.innerHTML =
            '<td class="dl-n">'+(r.oldNum||"")+'</td><td class="dl-n">'+(r.newNum||"")+
            '</td><td class="dl-mark">'+sign+'</td><td class="dl-code">'+cell(r.html)+"</td>";
        }
        tb.appendChild(tr);
      }
      t.appendChild(tb); return t;
    };

    if(diffPane && rows.length){
      const u = document.createElement("div"); u.className = "diff-unified"; u.appendChild(buildUnified());
      if(raw) raw.hidden = true;                 // JS replaces the no-JS fallback
      diffPane.appendChild(u);
    }

    if(toggle && lt && diffPane && srcPane){
      toggle.addEventListener("click", ()=>{
        const toSource = box.dataset.view !== "source";
        box.dataset.view = toSource ? "source" : "diff";
        diffPane.hidden = toSource;
        srcPane.hidden = !toSource;
        lt.textContent = toSource ? lt.dataset.titleSource : lt.dataset.titleDiff;
        lt.title = lt.textContent;
        toggle.textContent = toSource ? "Diff" : "Source";   // label = the view it switches TO
      });
    }
    const srcCode = srcPane && srcPane.querySelector('code[class*="language"]');
    const expand = box.querySelector(".expand");
    if(expand){
      // sheet content follows the visible pane: source view -> the evolved source,
      // diff view -> the raw unified diff (the same text ox-hugo shipped). Inside
      // the sheet, .code-sheet-toggle swaps the same two views; we route through
      // the box's own toggle so the underlying diffbox state stays in lock-step.
      const rawCode = raw && (raw.querySelector('code[class*="language"]') || raw.querySelector("code"));
      const applySheet = ()=>{
        const inSource = box.dataset.view === "source";
        sheetBody.textContent = inSource
          ? (srcCode ? srcCode.textContent : "")
          : (rawCode ? rawCode.textContent : (raw ? raw.textContent : ""));
        sheetTitle.textContent = lt ? lt.textContent.trim() : "";
        if(sheetToggleBtn) sheetToggleBtn.textContent = inSource ? "Diff" : "Source";
      };
      expand.addEventListener("click", ()=>{
        applySheet();
        sheetCopyBtn.hidden = false;
        if(sheetToggleBtn){
          sheetToggleBtn.hidden = !toggle;
          sheetToggleBtn.onclick = toggle ? ()=>{ toggle.click(); applySheet(); } : null;
        }
        openSheet();
      });
    }
    if(copy){
      // copy the evolved source; flash a reverse-video select-all over it to show
      // what got copied. The diff table can't be swept (it'd shred the table), so
      // when the diff view is showing we briefly flip to the source view for the
      // flash, then switch back -- leaving the toggle state untouched.
      copy.addEventListener("click", ()=>{
        const text = srcCode ? srcCode.textContent : (raw ? raw.textContent : "");
        const morph = ()=>{
          copy.classList.add("copied");
          clearTimeout(copy._t);
          copy._t = setTimeout(()=> copy.classList.remove("copied"), 1200);
        };
        if(fxOn && srcCode){
          const flip = box.dataset.view !== "source";   // currently showing the diff
          if(flip){ diffPane.hidden = true; srcPane.hidden = false; }
          doCopy(text, ()=>{
            morph();
            sweepSelect(srcCode);
            setTimeout(()=>{
              clearSel();
              if(flip){ srcPane.hidden = true; diffPane.hidden = false; }
            }, 700);
          });
        } else {
          doCopy(text, morph);
        }
      });
    }
  });
}
wireDiffBoxes(content);
// "expand" control: opens a near-fullscreen sheet showing a block's raw text
// (wrapped + selectable). Added -- on any device -- to every code block: the
// framed boxes (run/env/stdout/edit/annotate) and the standalone src .highlight.
// Always visible. On run/env the existing copy button folds into the same
// top-right cutout; other blocks get expand alone, and the sheet's own copy
// button is shown only when the source block carried one (so copy stays limited
// to run/env).
const refreshExpands = [];
// expand-arrows glyph (two opposite corners pulling apart)
const EXPAND_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';

// ONE-TIME wiring of the shared code sheet (a persistent body-level <dialog>):
// opening pushes a throwaway history entry so a back gesture/button closes it (and
// keeps the page) instead of navigating away; an explicit close pops the entry back
// off so the stack stays balanced. The per-page expand buttons (wired by
// wireExpands) fill + open it. NB: the popstate guard checks history.state.codeSheet,
// which is also how spa.js's router knows to leave a back-press to the sheet.
let openSheet = ()=>{};
let sheetBody = null, sheetTitle = null, sheetCopyBtn = null, sheetToggleBtn = null;
(function(){
  const sheet = document.getElementById("code-sheet");
  if(!sheet || typeof sheet.showModal !== "function") return;
  sheetBody      = sheet.querySelector(".code-sheet-body");
  sheetTitle     = sheet.querySelector(".code-sheet-title");
  const closeBtn = sheet.querySelector(".code-sheet-close");
  sheetCopyBtn   = sheet.querySelector(".code-sheet-copy");
  sheetToggleBtn = sheet.querySelector(".code-sheet-toggle");
  openSheet = function(){ history.pushState({ codeSheet:1 }, ""); sheet.showModal(); };
  window.addEventListener("popstate", ()=>{ if(sheet.open) sheet.close(); });
  sheet.addEventListener("close", ()=>{ if(history.state && history.state.codeSheet) history.back(); });
  if(closeBtn) closeBtn.addEventListener("click", ()=> sheet.close());
  sheet.addEventListener("click", e=>{ if(e.target === sheet) sheet.close(); });
  if(sheetCopyBtn) sheetCopyBtn.addEventListener("click", ()=>{
    doCopy(sheetBody.textContent, ()=> copied(sheetCopyBtn));   // same clip->check morph as the box copy button
  });
})();

// "expand" control: opens the near-fullscreen sheet showing a block's raw text
// (wrapped + selectable). Added -- on any device -- to every code block in ROOT:
// the framed boxes (run/env/stdout/edit/annotate) and standalone src .highlight.
// Re-callable after a soft-nav swap: refreshExpands is reset first so stale
// (detached) refreshers don't accumulate, and the old controls were discarded
// with the old DOM.
function wireExpands(root){
  refreshExpands.length = 0;
  if(!sheetBody) return;                       // no <dialog> support -> blocks just scroll
  const scope = root || content || document;
  const blocks = [];
  scope.querySelectorAll(".box").forEach(box=>{
    if(box.classList.contains("diffbox")) return;   // diffbox has two panes + its own controls
    const pre = box.querySelector(".body pre");
    if(pre) blocks.push({ host:box, pre, copy:box.querySelector(".copy") });   // prose boxes have no pre -> skipped
  });
  scope.querySelectorAll(".highlight").forEach(hl=>{
    if(hl.closest(".box")) return;            // annotate's code is reached via its box above
    const pre = hl.querySelector("pre");
    if(pre) blocks.push({ host:hl, pre, copy:null });
  });

  blocks.forEach(({ host, pre, copy })=>{
    const ctl = document.createElement("div");
    ctl.className = "box-ctl";
    if(copy) ctl.appendChild(copy);           // fold run/env's copy into the group
    const exp = document.createElement("button");
    exp.type = "button"; exp.className = "expand";
    exp.setAttribute("aria-label", "Open in full screen");
    exp.setAttribute("aria-haspopup", "dialog");
    exp.innerHTML = EXPAND_SVG;
    ctl.appendChild(exp);
    host.appendChild(ctl);
    const label = host.matches(".box") ? host.querySelector(".label") : null;
    exp.addEventListener("click", ()=>{
      sheetTitle.textContent = label ? label.textContent.trim() : "";
      sheetBody.textContent = pre.textContent;
      sheetCopyBtn.hidden = !copy;            // only run/env carry copy into the sheet
      if(sheetToggleBtn){ sheetToggleBtn.hidden = true; sheetToggleBtn.onclick = null; }
      openSheet();
    });
    // when the full title would collide with the controls on the top line, drop
    // the controls to a second row just below it (still right-aligned)
    const refresh = ()=>{
      if(label){
        const room = ctl.offsetLeft - label.offsetLeft;   // px from the title's left edge to the controls
        const need = label.scrollWidth + 10;              // full (untruncated) title + a small gap
        host.classList.toggle("ctl-stacked", need > room);
      }
    };
    refresh();
    refreshExpands.push(refresh);
  });
}
wireExpands(content);
function refreshAllExpands(){ for(const fn of refreshExpands) fn(); }
let expandRAF;
window.addEventListener("resize", ()=>{ cancelAnimationFrame(expandRAF); expandRAF = requestAnimationFrame(refreshAllExpands); });
if(document.fonts && document.fonts.ready) document.fonts.ready.then(refreshAllExpands);
window.addEventListener("load", refreshAllExpands);

// inline code pills: click to copy, with the same reverse-video sweep
function wireInlineCode(root){
  (root || content || document).querySelectorAll("code").forEach(code=>{
    if(code.closest("pre")) return;   // block code (fenced) is not an inline copy pill
    code.addEventListener("click", ()=>{
      doCopy(code.textContent, ()=>{ if(fxOn) sweepElement(code); });
    });
  });
}
wireInlineCode(content);

// reveal the page only once the web font is ready (no fallback->webfont reflow),
// then run the decode. Guarded + timeout so it always reveals even if fonts hang.
// point each box's draw-on start at its top-right CORNER (angle depends on aspect ratio)
function setBeamStarts(root){
  (root || document).querySelectorAll(".box").forEach(box=>{
    const w = box.offsetWidth, h = box.offsetHeight;
    if(w && h) box.style.setProperty("--beam-start", (Math.atan2(w, h) * 180 / Math.PI).toFixed(2) + "deg");
  });
}
let beamRAF;
window.addEventListener("resize", ()=>{ cancelAnimationFrame(beamRAF); beamRAF = requestAnimationFrame(()=> setBeamStarts()); });
setBeamStarts();

// per-page reveal: the fx-gated decode that must re-run on every soft-nav swap.
// (the once-per-tab sidebar rain + the home-page λ field stay in reveal() below.)
function revealContent(root){
  if(!fxOn) return;                         // fx off: everything is already static
  const r = root || content;
  if(!r) return;
  setBeamStarts(r);                         // corner angles current after layout
  document.body.classList.add("go");        // border-beam draws the boxes
  rain(r, true);                            // headings, code + run boxes decode on the monospace grid
  decompress(r);                            // proportional reading prose streams in linearly
}

let revealed=false;
function reveal(){
  if(revealed) return; revealed=true;
  document.documentElement.classList.remove("wait-fonts");
  if(!fxOn) return;                         // fx off: everything is already static
  revealContent(content);
  // intro logo: let the page resolve first, then bring the glyph-rain field up behind the λ
  setTimeout(lambdaRain, 1800);
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

/* ===========================================================
   SOFT-NAV RE-INIT HOOK (called by spa.js)
   After spa.js swaps #content + the per-page chrome regions (.sidebar .tree,
   .topnav, .topbar .cmd), it calls reinitAfterNav() to re-bind every per-page
   wiring on the freshly inserted DOM. The document/window-level listeners
   (palette, fx, settings, arrow keys, scroll-spy, resize handlers) are wired ONCE
   above against persistent elements and must NOT be re-run here — re-running them
   would stack duplicate handlers. This split (one-time chrome vs re-runnable
   content) is the core correctness boundary of the soft-nav design.
   =========================================================== */
function reinitAfterNav(){
  wireSidebarLinks();        // tree links close the off-canvas menu
  wirePrompt();              // re-fit the swapped prompt path + rebind reload
  wirePagenav();             // rebind #toc panel, headings, scroll-spy refs
  wireCopyButtons(content);  // copy buttons on the new run/env/stdout boxes
  wireDiffBoxes(content);    // toggle + scoped copy on the new diffboxes
  wireInlineCode(content);   // inline code-pill copy
  wireExpands(content);      // expand controls on the new code blocks
  queueActiveBlogTagScroll();// keep the active blog tag centered in the tree
  revealContent(content);    // re-run the fx-gated decode on the new content
  // λ-logo lives in the #page-fx slot which spa.js swaps on nav; claim/release
  // the takeover chrome to match the new page (present on home, gone elsewhere).
  syncLambdaTakeover();
  // home page: the freshly-swapped canvas needs lambdaRain re-kicked (reveal()'s
  // one-time run only covers the hard load).
  if(fxOn && document.querySelector(".lambda-logo")) setTimeout(lambdaRain, 400);
}
// The intro λ-logo opts into the shared takeover chrome (see takeover.js) just
// like a WebGL takeover shader: cinema padding on <main>, "scroll ↓" hint,
// content opacity fade, --fx-opacity dimming. The class stays on while a
// .lambda-logo is anywhere in the DOM; nav to a non-home page releases it.
const LAMBDA_TAKEOVER_ID = "lambda-logo";
function syncLambdaTakeover(){
  if(!window.Takeover) return;
  if(document.querySelector(".lambda-logo")) Takeover.claim(LAMBDA_TAKEOVER_ID);
  else Takeover.release(LAMBDA_TAKEOVER_ID);
}
syncLambdaTakeover();

// expose for spa.js (same concat scope, but a namespace keeps the contract explicit)
window.Terminal = { reinitAfterNav, revealContent, isFxOn: ()=> fxOn };

;
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

;
/* ===========================================================
   SOFT-NAV SHELL (progressive enhancement)
   Turns plain full-page navigations into in-place content swaps so the body-level
   shader canvas (and any other persistent state) survives clicking between pages.
   This is pure enhancement: it IS JavaScript, so with JS off every <a href> is a
   normal navigation — the site's working baseline. On ANY error it falls back to a
   full navigation, so links never break.

   It swaps only #content plus the per-page chrome that differs per page
   (.sidebar .tree, .topnav, .topbar .cmd); everything else — the canvas, the
   off-canvas checkbox, the settings/code-sheet dialogs — is left alone and persists.
   After a swap it re-runs terminal.js's per-page wiring (via Terminal.reinitAfterNav),
   re-triggers mermaid/katex for the new content, and reconfigures the shader.
   =========================================================== */
(function(){
  "use strict";
  if(!(window.history && history.pushState && window.fetch && window.DOMParser)) return;

  // #content first (required); the rest are per-page chrome regions, swapped if present.
  // #page-fx is a body-level decor slot (see baseof.html) that carries per-page
  // overlays which need to sit OUTSIDE #content — e.g. the home page's λ-logo
  // takeover — so they aren't dragged along by the content opacity fade.
  const SWAP = ["#content", ".sidebar .tree", ".topnav", ".topbar .cmd", "#page-fx"];
  const contentEl = () => document.getElementById("content");
  let ctrl = null;

  history.scrollRestoration = "manual";

  // visually-hidden live region: announces the new page title to screen readers,
  // since a soft nav doesn't trigger the usual document-load announcement.
  const live = document.createElement("div");
  live.id = "spa-live";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  live.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;";
  document.body.appendChild(live);

  function isInternal(a){
    if(a.target && a.target !== "_self") return false;
    if(a.hasAttribute("download")) return false;
    if(/\bexternal\b/.test(a.getAttribute("rel") || "")) return false;
    let url;
    try { url = new URL(a.href, location.href); } catch(_){ return false; }
    if(url.origin !== location.origin) return false;
    const hrefAttr = a.getAttribute("href") || "";
    if(hrefAttr.startsWith("#")) return false;                       // pure in-page anchor
    if(url.pathname === location.pathname && url.hash) return false; // same page + hash
    return true;
  }

  document.addEventListener("click", e=>{
    if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if(!a || !isInternal(a)) return;
    e.preventDefault();
    navigate(new URL(a.href, location.href).href, true);
  });

  // the URL path currently rendered. The code-sheet opens/closes by pushing then
  // popping a history entry with the SAME url, and in-page hash links don't change
  // the path either — so a popstate whose path matches what's already rendered is
  // NOT a navigation. Ignoring those keeps closing the code-sheet (history.back)
  // from re-rendering the page and jumping to the top.
  let currentPath = location.pathname;

  window.addEventListener("popstate", ()=>{
    if(location.pathname === currentPath) return;   // code-sheet close / hash change
    navigate(location.href, false);
  });

  async function navigate(href, push){
    const leavingY = window.scrollY;
    try {
      if(ctrl) ctrl.abort();
      ctrl = new AbortController();
      const res = await fetch(href, { signal: ctrl.signal, credentials:"same-origin", headers:{ "X-Requested-With":"spa" } });
      if(!res.ok) throw new Error("status " + res.status);
      if(!/text\/html/i.test(res.headers.get("content-type") || "")) throw new Error("not html");
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      if(!doc.querySelector("#content")) throw new Error("no #content");

      for(const sel of SWAP){
        const dst = document.querySelector(sel);
        if(!dst) continue;
        const src = doc.querySelector(sel);
        dst.innerHTML = src ? src.innerHTML : "";   // region missing on target -> clear it
      }
      document.title = doc.title;
      currentPath = new URL(href, location.href).pathname;

      if(push){
        try { history.replaceState(Object.assign({}, history.state, { y: leavingY }), ""); } catch(_){}
        history.pushState({ y: 0 }, "", href);
        window.scrollTo(0, 0);
      }

      reinit();

      if(!push){
        const y = (history.state && history.state.y) || 0;
        window.scrollTo(0, y);
      }
    } catch(err){
      if(err && err.name === "AbortError") return;   // superseded by a newer navigation
      location.assign(href);                          // anything else -> full navigation
    }
  }

  function reinit(){
    const content = contentEl();
    if(window.Terminal && window.Terminal.reinitAfterNav) window.Terminal.reinitAfterNav();
    retriggerMath(content);
    retriggerMermaid(content);
    if(window.Shader && window.Shader.scan) window.Shader.scan(content);
    const nav = document.getElementById("navtoggle"); if(nav) nav.checked = false;
    if(content){ content.setAttribute("tabindex", "-1"); try { content.focus({ preventScroll:true }); } catch(_){ content.focus(); } }
    live.textContent = document.title;
  }

  /* conditional libraries the destination page may need but the first page didn't
     load. Idempotent: each renders only the new, unprocessed nodes. */
  let mathLoading = false;
  function retriggerMath(root){
    if(!root || !root.querySelector(".math-block")) return;
    if(window.renderMathInElement){ try { window.renderMathInElement(root); } catch(_){} return; }
    if(mathLoading) return; mathLoading = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
    document.head.appendChild(link);
    const s1 = document.createElement("script");
    s1.src = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js";
    s1.onload = ()=>{
      const s2 = document.createElement("script");
      s2.src = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js";
      s2.onload = ()=>{ if(window.renderMathInElement) window.renderMathInElement(document.body); };
      document.body.appendChild(s2);
    };
    document.body.appendChild(s1);
  }

  let mermaidPromise = null;
  function retriggerMermaid(root){
    if(!root) return;
    const nodes = [...root.querySelectorAll(".mermaid")].filter(n=> !n.dataset.processed);
    if(!nodes.length) return;
    if(!mermaidPromise){
      mermaidPromise = import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs")
        .then(m=>{ const mm = m.default || m; mm.initialize({ startOnLoad:false }); return mm; });
    }
    mermaidPromise.then(mm=>{ try { mm.run({ nodes }); } catch(_){} }).catch(()=>{});
  }
})();
