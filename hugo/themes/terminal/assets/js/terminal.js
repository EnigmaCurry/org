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
  window.addEventListener("resize", ()=>{ cancelAnimationFrame(rraf); rraf = requestAnimationFrame(()=>{ refreshColors(); resize(); }); });
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
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  activeLink.scrollIntoView({ block:"center", inline:"nearest", behavior: reduce ? "auto" : "smooth" });
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
// checkbox on its own).
document.querySelectorAll(".sidebar .tree a").forEach(a=> a.addEventListener("click", ()=>{ if(navToggle) navToggle.checked = false; }));

// page outline: the SECOND index (this page's h2/h3 sections) shown in the
// header "#" expander. The list and open/close are rendered/handled by the
// template + a CSS checkbox (see pagenav.html), so the outline works with JS
// off; here we add smooth scrolling, close-on-pick / outside / Escape, and the
// scroll-spy highlight.
(function(){
  const cb     = document.getElementById("toctoggle");
  const panel  = document.getElementById("toc");
  if(!cb || !panel || !content) return;
  const toggle = document.querySelector(".toc-toggle");
  const links  = [...panel.querySelectorAll("a[href^='#']")];
  const close  = () => { cb.checked = false; };
  panel.addEventListener("click", e=>{
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
    close();
  });
  // close on a click outside the panel. Ignore the checkbox's own toggle click
  // (clicking the label synthesizes a click on the input) — otherwise the open
  // click would be read as an outside click and close it again immediately.
  document.addEventListener("click", e=>{ if(cb.checked && e.target !== cb && !panel.contains(e.target) && !(toggle && toggle.contains(e.target))) close(); });
  document.addEventListener("keydown", e=>{ if(e.key === "Escape") close(); });
  // scroll-spy: highlight the section the viewport is currently in — the last
  // heading whose top has scrolled past a line near the top of the viewport.
  // Recomputed on every scroll (not just when a heading enters a band) so it's
  // never stale: above the first heading it falls back to the title entry.
  const heads = [...content.querySelectorAll("h2, h3")].filter(h=> h.id);
  if(heads.length){
    const byId = {};
    links.forEach(a=>{ byId[a.getAttribute("href")] = a; });
    const titleLink = byId["#"];   // the lvl1 page-title entry (jumps to top)
    const OFFSET = 90;             // px below the viewport top counted as "here"
    let raf = 0;
    function spy(){
      raf = 0;
      let current = null;
      for(const h of heads){
        if(h.getBoundingClientRect().top <= OFFSET) current = h.id; else break;
      }
      const want = current ? byId["#" + current] : titleLink;
      links.forEach(a=> a.classList.toggle("active", a === want));
    }
    addEventListener("scroll", ()=>{ if(!raf) raf = requestAnimationFrame(spy); }, { passive:true });
    addEventListener("resize", ()=>{ if(!raf) raf = requestAnimationFrame(spy); }, { passive:true });
    spy();
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

// clicking the prompt path (after the ":") replays the intro animation (simplest:
// reload the page); the visitor@host: prefix is a normal link to the site root.
const cmdLink = document.querySelector(".topbar a.pathseg");
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
document.querySelectorAll(".box .copy").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const pre = btn.closest(".box").querySelector(".body pre");
    doCopy(pre ? pre.textContent : "", ()=> copied(btn));
  });
});
// touch only: add an "expand" control to each code box that opens a near-fullscreen
// sheet showing the block's raw text, wrapped + selectable. The inline copy button is
// folded into the same group (kept on wider screens, CSS-hidden on a portrait phone).
// Desktop DOM is left untouched (the whole block is gated behind a coarse-pointer check).
(function(){
  const sheet = document.getElementById("code-sheet");
  if(!sheet || typeof sheet.showModal !== "function") return;
  if(!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) return;
  const body     = sheet.querySelector(".code-sheet-body");
  const title    = sheet.querySelector(".code-sheet-title");
  const closeBtn = sheet.querySelector(".code-sheet-close");
  const copyBtn  = sheet.querySelector(".code-sheet-copy");
  // expand-arrows glyph (two opposite corners pulling apart)
  const SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';

  document.querySelectorAll(".box").forEach(box=>{
    const pre = box.querySelector(".body pre");
    if(!pre) return;                          // prose boxes (notice/expand/...) have no code body
    const ctl = document.createElement("div");
    ctl.className = "box-ctl";
    const copy = box.querySelector(".copy");  // keep the inline copy and fold it into the
    if(copy) ctl.appendChild(copy);           // group; CSS hides it on a portrait phone (expand
                                              // only) but keeps both on wider touch screens
    const exp = document.createElement("button");
    exp.type = "button"; exp.className = "expand";
    exp.setAttribute("aria-label", "Open in full screen");
    exp.setAttribute("aria-haspopup", "dialog");
    exp.innerHTML = SVG;
    ctl.appendChild(exp);
    box.appendChild(ctl);
    exp.addEventListener("click", ()=>{
      const label = box.querySelector(".label");
      title.textContent = label ? label.textContent.trim() : "";
      body.textContent = pre.textContent;
      openSheet();
    });
  });

  // tie the sheet to history so the mobile back gesture/button closes it (and keeps
  // the post) instead of navigating away. Opening pushes a throwaway entry; the back
  // gesture pops it -> popstate closes the sheet; an explicit close pops the entry
  // back off so the stack stays balanced. The guard stops the two from double-firing.
  function openSheet(){
    history.pushState({ codeSheet:1 }, "");
    sheet.showModal();
  }
  window.addEventListener("popstate", ()=>{ if(sheet.open) sheet.close(); });
  sheet.addEventListener("close", ()=>{ if(history.state && history.state.codeSheet) history.back(); });

  if(closeBtn) closeBtn.addEventListener("click", ()=> sheet.close());
  sheet.addEventListener("click", e=>{ if(e.target === sheet) sheet.close(); });
  if(copyBtn) copyBtn.addEventListener("click", ()=>{
    doCopy(body.textContent, ()=>{
      copyBtn.textContent = "copied ✓";
      copyBtn.classList.remove("flash"); void copyBtn.offsetWidth;   // restart the pulse on repeat taps
      copyBtn.classList.add("flash");
      clearTimeout(copyBtn._t);
      copyBtn._t = setTimeout(()=>{ copyBtn.textContent = "copy"; copyBtn.classList.remove("flash"); }, 1200);
    });
  });
})();

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
