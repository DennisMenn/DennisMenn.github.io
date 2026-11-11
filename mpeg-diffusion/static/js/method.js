/* Method figure: a step-through figure driven by static/media/method/method.mp4 (2560x992, 25 fps, 18.5 s, the big-text
 * animation from make_method_gif.py). The caption burned into the bottom of the frames is cropped away by CSS and shown
 * as page text instead. Controls: previous, "Overview 1 2 3 4 5", next, plus the Left and Right keys.
 *   - The figure plays and loops on its own while it is in view, and pauses off screen.
 *   - A pressed step plays only its own segment, holds its last frame for 2 s, then the figure plays on from there.
 *     Overview jumps to the frame where the whole figure is visible and holds it the same way.
 *   - Each contribution under the figure names the step it explains (4, 5, 2); its "Step n" button or heading plays
 *     that step, and while that step is shown the contribution is marked.
 *   - With reduced motion nothing plays: each step shows its last frame.
 * Step times are the caption starts of make_method_gif.py's TIMELINE: 2.20, 5.13, 8.26 (10.63), 12.63, 15.58 s. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const arrow = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" ` +
    `stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

  const REST = 17.5; // seconds: whole figure visible, before the fade back
  const END = 18.45; // seconds: the last frame (the fade back ends on the first frame, so the loop is seamless)
  const HOLD = 2000; // ms a pressed step holds on its last frame before the figure plays on
  const SEGS = [null, { s: 0.0, e: 2.1 }, { s: 2.2, e: 5.05 }, { s: 5.13, e: 8.18 }, { s: 8.26, e: 12.55 },
    { s: 12.63, e: 15.5 }];
  const CAPS = [ // the burned-in wording; step 4 has two captions, the second shows from `at`
    null,
    [{ at: 0, html: "Steps 1 to <i>k</i>: denoise the video at LR" }],
    [{ at: 0, html: "<b>Self-Selected HR Region:</b> Linear head selects the HR region <i>M</i>" }],
    [{ at: 0, html: "Keep the rest at LR; <i>U</i> upscales <i>M</i> to HR" }],
    [{ at: 0, html: "<b>Dual-Res Attention:</b> <i>f</i><sub>&darr;</sub>, <i>f</i><sub>&uarr;</sub> map K/V across resolutions" },
      { at: 10.63, html: "<b>Dual-Res Attention:</b> Each query attends to its own resolution K/V" }],
    [{ at: 0, html: "<b>Mixed-Res Decoder:</b> Merge HR and LR latents into one latent, then decode" }],
  ];
  const STEP_STARTS = [2.2, 5.13, 8.26, 12.63, 15.58]; // steps 2, 3, 4, 5 and the overview
  const stepAt = (t) => {
    let n = 1;
    for (let i = 0; i < STEP_STARTS.length; i++) if (t >= STEP_STARTS[i]) n = i + 2;
    return n === 6 ? 0 : n;
  };

  function init() {
    const fig = $("fig-method");
    const video = $("method-video");
    if (!fig || !video) return;
    const label = $("method-label");
    const ctl = $("method-ctl");
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const prev = el("button", "navbtn", arrow("M14.5 6 8.5 12l6 6"));
    prev.type = "button"; prev.setAttribute("aria-label", "Previous step");
    const next = el("button", "navbtn", arrow("m9.5 6 6 6-6 6"));
    next.type = "button"; next.setAttribute("aria-label", "Next step");
    const chips = el("div", "chips");
    const chipBtns = ["Overview", "1", "2", "3", "4", "5"].map((t, n) => {
      const b = el("button", "chip", t);
      b.type = "button";
      b.addEventListener("click", () => goTo(n));
      chips.appendChild(b);
      return b;
    });
    ctl.append(prev, chips, next);

    let step = 0;       // 0 = overview, 1..5
    let run = 0;        // bumped on every action; a stale playback loop stops when it sees a newer run
    let mode = "idle";  // "step" | "all" | "idle"
    let interacted = false;

    const contribBox = $("method-contribs");
    const contribs = contribBox ? [...contribBox.querySelectorAll("[data-step]")] : [];
    function markContrib(n) {
      contribs.forEach((c) => {
        c.classList.toggle("on", n === 0 || Number(c.dataset.step) <= n);
      });
      if (contribBox) contribBox.classList.toggle("has-on", n !== 0);
    }
    contribs.forEach((c) => {
      c.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        goTo(Number(c.dataset.step));
      });
    });

    let shownKey = "";
    function renderCaption(n, t) {
      // One caption at a time: the latest one reached at video time t (t == null: settled, the step's last caption)
      const cap = !n ? null : t == null ? CAPS[n][CAPS[n].length - 1] : CAPS[n].filter((c) => t >= c.at).pop();
      const key = n + ":" + (cap ? cap.at : "");
      if (key === shownKey) return;
      shownKey = key;
      label.innerHTML = cap ? `<span class="cap-line"><span class="sl-n">${n}.</span>${cap.html}</span>` : "";
    }

    function setStep(n, t) {
      step = n;
      chipBtns.forEach((b, c) => {
        b.classList.toggle("active", c === n);
        if (c === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
      renderCaption(n, t);
      markContrib(n);
    }

    function seek(t) {
      return new Promise((resolve) => {
        if (Math.abs(video.currentTime - t) < 0.02) { resolve(); return; }
        const done = () => { video.removeEventListener("seeked", done); resolve(); };
        video.addEventListener("seeked", done);
        video.currentTime = t;
      });
    }

    function rest(t) {
      video.pause();
      mode = "idle";
      return seek(t);
    }

    // Play from `from` to `to`, calling onTime(t, ended) every animation frame; stops early if a newer action starts.
    async function playSpan(from, to, onTime) {
      const id = ++run;
      await seek(from);
      if (id !== run) return;
      try { await video.play(); } catch (_) { /* autoplay blocked: stay on the first frame */ }
      // Checked on animation frames and on timeupdate: animation frames stop in a background tab.
      const tick = () => {
        if (id !== run) { video.removeEventListener("timeupdate", tick); return false; }
        const t = video.currentTime;
        if (t >= to || video.ended) {
          video.removeEventListener("timeupdate", tick);
          run++;
          video.pause();
          video.currentTime = to;
          mode = "idle";
          if (onTime) onTime(to, true);
          return false;
        }
        if (onTime) onTime(t, false);
        return true;
      };
      video.addEventListener("timeupdate", tick);
      const loop = () => { if (tick()) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }

    // A pressed step plays its segment, holds HOLD ms, then the figure keeps playing on its own from there.
    let holdTimer = 0, visible = false;
    function hold(id) {
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => { if (id === run && visible) playOn(video.currentTime); }, HOLD);
    }

    function goTo(n) {
      interacted = true;
      n = ((n % 6) + 6) % 6;
      run++;
      clearTimeout(holdTimer);
      video.pause();
      setStep(n, n === 4 ? 0 : null);
      if (n === 0) { rest(REST).then(() => { if (!reduced) hold(run); }); return; }
      const seg = SEGS[n];
      if (reduced) { rest(seg.e).then(() => setStep(n, seg.e)); return; }
      mode = "step";
      playSpan(seg.s, seg.e, (t, end) => { if (n === 4) renderCaption(4, t); if (end) hold(run); });
    }

    // Play on its own from `from` to the end of the video, then loop from the start.
    function playOn(from) {
      mode = "all";
      playSpan(from, END, (t, end) => {
        if (end) { playOn(0); return; }
        const n = stepAt(t);
        if (n !== step) setStep(n, t); else if (n === 4) renderCaption(4, t);
      });
    }

    // Only playSpan may play the video: the browser resumes paused muted videos by itself (e.g. after a tab switch)
    video.addEventListener("play", () => { if (mode === "idle") video.pause(); });

    prev.addEventListener("click", () => goTo(step - 1));
    next.addEventListener("click", () => goTo(step + 1));
    $("method-frame").addEventListener("click", () => goTo(step + 1));
    fig.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(step - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goTo(step + 1); }
    });

    // Rests on the whole figure until it is mostly in view, then plays on its own; off screen it pauses.
    setStep(0, null);
    const ready = () => { if (video.readyState >= 1 && !interacted) seek(REST); };
    if (video.readyState >= 1) ready(); else video.addEventListener("loadedmetadata", ready, { once: true });
    if (!reduced && "IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (!visible) {
          if (mode === "all") { run++; video.pause(); mode = "idle"; }
          return;
        }
        if (mode !== "idle") return;
        const go = () => { if (visible && mode === "idle") playOn(interacted ? video.currentTime : 0); };
        if (video.readyState >= 3) go(); else video.addEventListener("canplaythrough", go, { once: true });
      }, { threshold: 0.6 }).observe($("method-frame"));
    }
    window.MPEG_METHOD = { goTo, playOn, get step() { return step; }, get mode() { return mode; }, video };
  }

  init();
})();
