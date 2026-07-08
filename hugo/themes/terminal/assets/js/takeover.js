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
