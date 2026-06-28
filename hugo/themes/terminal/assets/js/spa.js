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
  const SWAP = ["#content", ".sidebar .tree", ".topnav", ".topbar .cmd"];
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
