(function () {
  "use strict";

  const S = window.SITE || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const GAP = 8; // white px between the tiles of a side-by-side video (build_site.py)
  const CROP = 200; // video-px window drawn in the detail view
  const pct = (x) => `${Number(x).toFixed(1)}%`;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------------------------------------------------------------- lazy videos
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting) {
          if (!v.getAttribute("src") && v.dataset.src) v.src = v.dataset.src;
          v.play().catch(() => {});
        } else if (!v.paused) {
          v.pause();
        }
      }
    }, { rootMargin: "200px 0px", threshold: 0.01 })
    : null;

  function watch(v) {
    if (io) io.observe(v);
    else { v.src = v.dataset.src; v.autoplay = true; }
  }

  function sized(v, size) {
    if (size) v.style.aspectRatio = `${size[0]} / ${size[1]}`;
    return v;
  }

  function lazyVideo(src, poster, size) {
    const v = sized(document.createElement("video"), size);
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "none";
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.poster = poster;
    v.dataset.src = src;
    watch(v);
    return v;
  }

  function setSrc(v, src, poster) {
    v.poster = poster;
    v.dataset.src = src;
    if (v.getAttribute("src")) {
      v.src = src;
      v.play().catch(() => {});
    }
  }

  function selectIn(container, i) {
    container.querySelectorAll("[role=tab]").forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
  }

  // ---------------------------------------------------------------- shared token-grid overlay
  function decodeMask(it) {
    if (!it.mask || !it.grid) return null;
    const [, rows, cols] = it.grid;
    return it.mask.map((hex) => {
      const out = new Uint8Array(rows * cols);
      let idx = 0;
      for (let k = 0; k < hex.length; k++) {
        const v = parseInt(hex[k], 16);
        for (let b = 3; b >= 0 && idx < out.length; b--) out[idx++] = (v >> b) & 1;
      }
      return out;
    });
  }

  function drawTokenGrid(canvas, masks, grid, frame, show) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    const lat = masks && grid ? Math.min(grid[0] - 1, (frame + 3) >> 2) : -1;
    const key = show && masks && grid ? `${w}x${h}:${lat}:${masks === canvas._m ? 1 : 0}` : `off:${w}x${h}`;
    if (canvas._lastKey === key && canvas.width === w && canvas.height === h) return;
    canvas._lastKey = key;
    canvas._m = masks;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    } else {
      ctx.clearRect(0, 0, w, h);
    }
    if (!show || !masks || !grid) return;
    const [, rows, cols] = grid;
    const m = masks[lat];
    const xs = (c) => Math.round((c * w) / cols);
    const ys = (r) => Math.round((r * h) / rows);
    const lr = new Path2D();
    const hr = new Path2D();
    ctx.fillStyle = "rgba(34, 177, 76, 0.16)";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = xs(c), x1 = xs(c + 1), y0 = ys(r), y1 = ys(r + 1);
        if (m[r * cols + c]) {
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          const xm = Math.round((x0 + x1) / 2), ym = Math.round((y0 + y1) / 2);
          hr.rect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
          hr.moveTo(xm + 0.5, y0);
          hr.lineTo(xm + 0.5, y1);
          hr.moveTo(x0, ym + 0.5);
          hr.lineTo(x1, ym + 0.5);
        } else {
          lr.rect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
        }
      }
    }
    ctx.lineWidth = Math.max(1, Math.round(dpr));
    ctx.strokeStyle = "rgba(240, 200, 70, 0.6)";
    ctx.stroke(lr);
    ctx.strokeStyle = "rgba(120, 225, 140, 0.95)";
    ctx.stroke(hr);
  }

  function bindVideoGrid(video, canvas, getState) {
    let frame = 0;
    const render = () => {
      const st = getState();
      if (!st) return;
      drawTokenGrid(canvas, st.masks, st.grid, frame, st.show);
    };
    const setFrame = (seconds) => {
      const st = getState();
      if (!st || !st.grid) return;
      const n = st.grid[0] * 4 - 3;
      const f = Math.min(n - 1, Math.max(0, Math.round(seconds * (st.fps || 16))));
      if (f !== frame) {
        frame = f;
        render();
      }
    };
    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      const onFrame = (_now, meta) => {
        setFrame(meta.mediaTime);
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    }
    const tick = () => {
      if (!video.paused) setFrame(video.currentTime);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    ["timeupdate", "seeked", "play", "loadedmetadata", "loadeddata"].forEach((ev) =>
      video.addEventListener(ev, () => { setFrame(video.currentTime || 0); render(); })
    );
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => { canvas._lastKey = ""; render(); }).observe(canvas);
    }
    requestAnimationFrame(render);
    return {
      render: () => { canvas._lastKey = ""; render(); },
      resetFrame: () => { frame = Math.max(0, Math.round((video.currentTime || 0) * 16)); canvas._lastKey = ""; render(); },
    };
  }

  // ---------------------------------------------------------------- 1. teaser with token grid
  function teaser() {
    const items = S.teaser || [];
    const video = $("teaser-video");
    if (!video) return;
    const canvas = $("teaser-canvas");
    const toggle = $("teaser-toggle");
    const legend = $("teaser-legend");
    const thumbs = $("teaser-thumbs");
    const promptBar = $("teaser-prompt-bar");
    const prevBtn = $("teaser-prev");
    const nextBtn = $("teaser-next");
    let cur = null;
    let curIdx = 0;

    const ctl = bindVideoGrid(video, canvas, () => cur && {
      masks: cur.masks,
      grid: cur.it.grid,
      fps: cur.it.fps,
      show: toggle.checked,
    });

    function select(i) {
      curIdx = (i + items.length) % items.length;
      const it = items[curIdx];
      cur = { it, masks: decodeMask(it) };
      video.poster = it.poster;
      video.src = it.video;
      video.play().catch(() => {});
      $("teaser-prompt").textContent = it.prompt;
      $("teaser-stats").innerHTML =
        `<b>${pct(it.tokens)}</b> tokens &middot; <b>${it.speedup}&times;</b> faster`;
      selectIn(thumbs, curIdx);
      ctl.resetFrame();
    }

    if (prevBtn) prevBtn.addEventListener("click", (e) => { e.stopPropagation(); select(curIdx - 1); });
    if (nextBtn) nextBtn.addEventListener("click", (e) => { e.stopPropagation(); select(curIdx + 1); });

    items.forEach((it, i) => {
      const b = el("button", "thumb", `<img src="${esc(it.poster)}" alt="" loading="lazy"><span>${esc(it.title)}</span>`);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => select(i));
      thumbs.appendChild(b);
    });
    toggle.addEventListener("change", () => {
      legend.classList.toggle("off", !toggle.checked);
      ctl.render();
    });
    if (promptBar) {
      promptBar.addEventListener("click", () => promptBar.classList.toggle("expanded"));
    }
    $("teaser-player").addEventListener("click", () => (video.paused ? video.play() : video.pause()));
    $("teaser-player").title = "Click to pause / play";
    window.addEventListener("resize", ctl.render);
    if (items.length) select(0);
  }

  // Crop center (video px) clamped so the CROP window stays inside [lo, hi).
  function clampCenter(center, lo, hi) {
    const half = CROP / 2;
    if (hi - lo <= CROP) return (lo + hi) / 2;
    return Math.min(hi - half, Math.max(lo + half, center));
  }

  // ---------------------------------------------------------------- side-by-side player (comparisons)
  // Returns a dispose function. Hover shows a magnifier; left/right arrows + dots switch clips.
  const preloaded = new Set();
  function pairView(dotsBox, root, clips, labels) {
    root.innerHTML = "";
    dotsBox.innerHTML = "";
    const wrap = el("div", "pair");
    const head = el("div", "pair-labels");
    const stageWrap = el("div", "stage-wrap");
    const prevBtn = el("button", "stage-arrow prev", "&lsaquo;");
    prevBtn.type = "button";
    prevBtn.setAttribute("aria-label", "Previous comparison");
    const nextBtn = el("button", "stage-arrow next", "&rsaquo;");
    nextBtn.type = "button";
    nextBtn.setAttribute("aria-label", "Next comparison");
    const stage = el("div", "pair-stage");
    const tileL = el("div", "pair-tile");
    const gapEl = el("div", "pair-gap");
    const tileR = el("div", "pair-tile");
    const innerL = el("div", "pair-inner");
    const innerR = el("div", "pair-inner");
    const video = lazyVideo(clips[0].video, clips[0].poster, null);
    const videoR = lazyVideo(clips[0].video, clips[0].poster, null);
    video.addEventListener("play", () => videoR.play().catch(() => {}));
    video.addEventListener("pause", () => videoR.pause());
    video.addEventListener("seeking", () => {
      if (Math.abs(videoR.currentTime - video.currentTime) > 0.05) videoR.currentTime = video.currentTime;
    });
    video.addEventListener("timeupdate", () => {
      if (Math.abs(videoR.currentTime - video.currentTime) > 0.08) videoR.currentTime = video.currentTime;
    });
    const canvas = el("canvas", "pair-grid");
    const canvasR = el("canvas", "pair-grid");
    const noLayout = el("div", "no-layout", "Layout not published");
    const badgeL = el("div", "layout-badge", "Layout predicted by <b>our model</b> from the prompt only");
    innerL.append(video, canvas);
    tileL.append(innerL, badgeL);
    innerR.append(videoR, canvasR);
    tileR.append(innerR, noLayout);
    stage.append(tileL, gapEl, tileR);
    stageWrap.append(prevBtn, stage, nextBtn);
    const top = el("div", "apps-top",
      `<label class="switch"><input type="checkbox"><span class="slider"></span>Show tokens</label>` +
      `<span class="legend off"><span><i class="sw hr"></i>high-res region</span>` +
      `<span><i class="sw lr"></i>low-res background</span></span>`);
    const tokToggle = top.querySelector("input");
    const legend = top.querySelector(".legend");
    const tokensOn = () => tokToggle.checked;
    function renderMode() {
      legend.classList.toggle("off", !tokensOn());
    }
    tokToggle.addEventListener("change", () => {
      renderMode();
      applyLayout();
      video.play().catch(() => {});
    });

    // Player controls: play / pause, time slider.
    const bar = el("div", "cmp-controls",
      `<button type="button" class="cmp-icon cmp-play" aria-label="Play or pause" title="Play / pause">` +
      `<svg class="i-play" viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z"/></svg>` +
      `<svg class="i-pause" viewBox="0 0 24 24"><path d="M6 4.5h4v15H6zm8 0h4v15h-4z"/></svg></button>` +
      `<input type="range" class="cmp-seek" min="0" max="1" step="0.001" value="0" aria-label="Position in the clip">` +
      `<span class="cmp-time">0.0 / 0.0 s</span>`);
    const playB = bar.querySelector(".cmp-play");
    const seekB = bar.querySelector(".cmp-seek");
    const timeB = bar.querySelector(".cmp-time");
    const dur = () => (isFinite(video.duration) ? video.duration : 0);
    function syncBar() {
      playB.classList.toggle("paused", video.paused);
      const d = dur();
      seekB.max = d || 1;
      seekB.value = video.currentTime;
      timeB.textContent = `${video.currentTime.toFixed(1)} / ${d.toFixed(1)} s`;
    }
    let barLoop = 0;
    const tickBar = () => { syncBar(); if (!video.paused) barLoop = requestAnimationFrame(tickBar); };
    video.addEventListener("play", () => { cancelAnimationFrame(barLoop); tickBar(); });
    ["pause", "seeked", "loadedmetadata"].forEach((ev) => video.addEventListener(ev, syncBar));
    playB.addEventListener("click", () => (video.paused ? video.play().catch(() => {}) : video.pause()));
    seekB.addEventListener("input", () => { video.pause(); video.currentTime = Number(seekB.value); });

    let masks = null;
    let masksR = null;
    const ctl = bindVideoGrid(video, canvas, () => clip && { masks, grid: clip.grid, fps: clip.fps, show: tokensOn() });
    const ctlR = bindVideoGrid(video, canvasR, () => clip && {
      masks: masksR, grid: clip.grid, fps: clip.fps, show: tokensOn(),
    });
    function applyLayout() {
      const on = tokensOn();
      const src = on && clip.layout_video ? clip.layout_video : clip.video;
      if (video.dataset.src !== src) {
        const t = video.currentTime;
        setSrc(video, src, clip.poster);
        setSrc(videoR, src, clip.poster);
        if (video.getAttribute("src")) video.addEventListener("loadedmetadata", () => { video.currentTime = t; videoR.currentTime = t; }, { once: true });
      }
      noLayout.hidden = !(on && !masksR && !clip.layout_video);
      badgeL.hidden = !(on && !clip.same_mask);
      ctl.render();
      ctlR.render();
    }
    const promptBar = el("div", "prompt-bar", `<span class="prompt-tag">Prompt</span><span class="prompt-text"></span>`);
    promptBar.title = "Click to expand / collapse prompt";
    promptBar.addEventListener("click", () => promptBar.classList.toggle("expanded"));
    const footEl = el("span", "pair-foot");
    wrap.append(top, head, stageWrap, bar, promptBar);
    root.appendChild(wrap);

    // Saved magnifier spot per clip: the video jumps to the artifact time and plays on, the loupe rests there.
    const RECORD = new URLSearchParams(location.search).has("record");
    const recorded = () => { try { return JSON.parse(localStorage.getItem("mpeg_focus") || "{}"); } catch (_) { return {}; } };
    const focusOf = (c) => (RECORD && recorded()[c.key]) || (window.COMPARE_FOCUS || {})[c.key] || null;
    let pinned = null;
    let startAt = null;
    const startNow = () => {
      if (startAt == null || video.readyState < 1) return;
      video.currentTime = startAt;
      startAt = null;
    };
    video.addEventListener("loadedmetadata", startNow);
    function pinnedAt() {
      if (!pinned || !pinned.track) return pinned;
      const tr = pinned.track, t = video.currentTime;
      let j = 1;
      while (j < tr.length - 1 && tr[j][0] < t) j++;
      const [t0, x0, y0] = tr[j - 1], [t1, x1, y1] = tr[j];
      let a = Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1)));
      a = a * a * (3 - 2 * a);
      return { fx: x0 + (x1 - x0) * a, fy: y0 + (y1 - y0) * a };
    }
    const focusNow = () => (RECORD ? focusOf(clip) : null);
    // Artifacts mode loops only the artifact part: from its start to `end` (default: the clip end).
    let lastT = 0;
    function loopSegment() {
      const d = dur();
      if (!pinned || !pinned.seg || RECORD || !d || video.paused) return;
      const { start, end = d } = pinned.seg;
      const t = video.currentTime;
      const wrapped = t < lastT - 0.5 && lastT >= Math.min(end, d) - 0.3; // the video's own loop jumped to 0
      if (t >= Math.min(end, d) - 0.04 || wrapped) {
        video.currentTime = start;
        if (shown) glide = { ...shown, t0: performance.now() };
      }
      lastT = video.currentTime;
    }
    video.addEventListener("ended", () => {
      if (!pinned || !pinned.seg || RECORD) return;
      video.currentTime = pinned.seg.start;
      if (shown) glide = { ...shown, t0: performance.now() };
      video.play().catch(() => {});
    });
    function setFocus(f) {
      shown = glide = null;
      pinned = f && (f.track ? { track: f.track } : { fx: f.fx, fy: f.fy });
      startAt = f ? (f.track ? f.start : f.t) : null;
      if (startAt === undefined) startAt = null;
      if (pinned) pinned.seg = { start: startAt || 0, end: f.end };
      video.loop = videoR.loop = !pinned || RECORD;
      lastT = 0;
      startNow();
      hover = null;
      stage.classList.toggle("pinned", !!pinned && !RECORD);
      if (pinned) { if (!loupeLoop) drawLoupes(); }
      else if (!hover) loupes.forEach(({ l }) => l.classList.remove("on"));
    }

    let idx = 0;
    let clip = clips[0];
    function select(i) {
      idx = (i + clips.length) % clips.length;
      clip = clips[idx];
      const [a, b, foot] = labels(clip);
      const [w0, w1] = clip.widths;
      const [W, H] = clip.size;
      const cols = `${w0}fr ${GAP}fr ${w1}fr`;
      head.style.gridTemplateColumns = cols;
      head.innerHTML = `<span class="ours">${a}</span><span></span><span>${b}</span>`;
      footEl.innerHTML = foot || "";
      footEl.hidden = !foot;
      stage.style.gridTemplateColumns = cols;
      tileL.style.aspectRatio = `${w0} / ${H}`;
      video.style.width = `${(W / w0) * 100}%`;
      videoR.style.width = `${(W / w1) * 100}%`;
      videoR.style.marginLeft = `-${((w0 + GAP) / w1) * 100}%`;
      setSrc(video, clip.video, clip.poster);
      setSrc(videoR, clip.video, clip.poster);
      masks = decodeMask(clip);
      masksR = clip.theirs_mask ? decodeMask({ mask: clip.theirs_mask, grid: clip.grid }) : null;
      ctl.resetFrame();
      ctlR.resetFrame();
      renderMode();
      applyLayout();
      promptBar.hidden = Boolean(clip.hide_prompt);
      promptBar.querySelector(".prompt-tag").textContent = clip.same_mask ? "Details" : "Prompt";
      promptBar.classList.toggle("expanded", Boolean(clip.same_mask));
      promptBar.querySelector(".prompt-text").textContent = clip.prompt || "";
      selectIn(dotsBox, idx);
      setFocus(focusNow());
      if (RECORD) renderRecord();
    }

    prevBtn.addEventListener("click", (e) => { e.stopPropagation(); select(idx - 1); });
    nextBtn.addEventListener("click", (e) => { e.stopPropagation(); select(idx + 1); });

    // Magnifier: a round loupe follows the cursor and shows the same spot of both results, enlarged.
    const LOUPE_MAG = 2;
    const loupes = [tileL, tileR].map((tile) => {
      const l = el("div", "loupe");
      const cv = document.createElement("canvas");
      l.appendChild(cv);
      stageWrap.appendChild(l);
      return { l, cv, tile };
    });
    let hover = null, loupeLoop = 0, shown = null, glide = null;
    function drawLoupes() {
      loupeLoop = 0;
      let at = hover || pinnedAt();
      if (!at) return;
      // the resting loupe follows its track, but glides back for 0.4 s when the segment loops
      if (!hover) {
        if (glide) {
          let a = Math.min(1, (performance.now() - glide.t0) / 400);
          a = a * a * (3 - 2 * a);
          at = { fx: glide.fx + (at.fx - glide.fx) * a, fy: glide.fy + (at.fy - glide.fy) * a };
          if (a >= 1) glide = null;
        }
        shown = at;
      }
      if (video.readyState < 2) { loupeLoop = requestAnimationFrame(drawLoupes); return; }
      loopSegment();
      const [w0, w1] = clip.widths;
      const H = clip.size[1];
      const ux = at.fx, uy = at.fy;
      const wrapRect = stageWrap.getBoundingClientRect();
      loupes.forEach(({ l, cv, tile }, i) => {
        l.classList.add("on");
        const rect = tile.getBoundingClientRect();
        const tw = i ? w1 : w0;
        const off = i ? w0 + GAP : 0;
        const lw = l.offsetWidth, lh = l.offsetHeight;
        const dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(lw * dpr)) { cv.width = Math.round(lw * dpr); cv.height = Math.round(lh * dpr); }
        const srcPerPx = tw / rect.width;                 // source px per screen px
        const hx = (lw / 2) * srcPerPx / LOUPE_MAG;       // half the source window
        const hy = (lh / 2) * srcPerPx / LOUPE_MAG;
        const cx = off + ux * tw, cy = uy * H;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cv.width, cv.height);
        // the loupe can hang past the tile, so only draw this tile's own columns of the side-by-side video
        const k = cv.width / (2 * hx);
        ctx.save();
        ctx.beginPath();
        ctx.rect((off - (cx - hx)) * k, (0 - (cy - hy)) * k, tw * k, H * k);
        ctx.clip();
        ctx.drawImage(video, cx - hx, cy - hy, 2 * hx, 2 * hy, 0, 0, cv.width, cv.height);
        const grid = i ? canvasR : canvas;
        if (tokensOn() && grid.width) {
          const gr = grid.getBoundingClientRect();
          const s = grid.width / gr.width;
          const hw = hx / srcPerPx, hh = hy / srcPerPx;   // half the source window in screen px
          const gx = rect.left + ux * rect.width - hw - gr.left, gy = rect.top + uy * rect.height - hh - gr.top;
          ctx.drawImage(grid, gx * s, gy * s, 2 * hw * s, 2 * hh * s, 0, 0, cv.width, cv.height);
        }
        ctx.restore();
        l.style.left = `${rect.left - wrapRect.left + ux * rect.width}px`;
        l.style.top = `${rect.top - wrapRect.top + uy * rect.height}px`;
      });
      loupeLoop = requestAnimationFrame(drawLoupes);
    }
    [tileL, tileR].forEach((tile) => {
      tile.addEventListener("pointermove", (e) => {
        if (pinned && !RECORD) return;
        const r = tile.getBoundingClientRect();
        hover = { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
        if (!loupeLoop) drawLoupes();
      });
      tile.addEventListener("pointerleave", () => {
        hover = null;
        if (pinned) return;
        cancelAnimationFrame(loupeLoop);
        loupeLoop = 0;
        loupes.forEach(({ l }) => l.classList.remove("on"));
      });
      if (RECORD) tile.addEventListener("click", (e) => {
        const r = tile.getBoundingClientRect();
        const f = { fx: +((e.clientX - r.left) / r.width).toFixed(4), fy: +((e.clientY - r.top) / r.height).toFixed(4),
          t: +video.currentTime.toFixed(3) };
        const all = recorded();
        all[clip.key] = f;
        localStorage.setItem("mpeg_focus", JSON.stringify(all));
        setFocus(f);
        renderRecord();
      });
    });

    // ?record: click a spot on each example to save it; copy the JSON into compare_focus.js.
    const recBox = el("div", "rec-box");
    function renderRecord() {
      const all = recorded();
      const mine = all[clip.key];
      recBox.innerHTML =
        `<b>Record mode</b> · click the spot to magnify (the current frame is saved too). ` +
        `This example (<code>${esc(clip.key)}</code>): ${mine ? `x ${mine.fx}, y ${mine.fy}, t ${mine.t} s` : "not saved"} ` +
        `<button type="button" class="cmp-btn rec-clear">Clear this</button> ` +
        `<button type="button" class="cmp-btn rec-copy">Copy all (${Object.keys(all).length})</button>` +
        `<pre>${esc(JSON.stringify(all, null, 1))}</pre>`;
      recBox.querySelector(".rec-clear").addEventListener("click", () => {
        const a = recorded();
        delete a[clip.key];
        localStorage.setItem("mpeg_focus", JSON.stringify(a));
        setFocus(focusNow());
        renderRecord();
      });
      recBox.querySelector(".rec-copy").addEventListener("click", (e) => {
        navigator.clipboard.writeText(JSON.stringify(recorded(), null, 1)).catch(() => {});
        e.target.textContent = "Copied";
      });
    }
    if (RECORD) bar.after(recBox);

    clips.forEach((c, i) => {
      const b = el("button", "dot");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.title = c.title;
      b.setAttribute("aria-label", c.title);
      b.addEventListener("click", () => select(i));
      dotsBox.appendChild(b);
    });
    dotsBox.appendChild(footEl);
    select(0);
    return () => {};
  }

  // ---------------------------------------------------------------- 2. comparisons
  function compare() {
    const tabs = S.compare || {};
    const keys = Object.keys(tabs);
    const tabBox = $("compare-tabs");
    if (!tabBox) return;
    let stop = () => {};

    function show(k) {
      const t = tabs[k];
      selectIn(tabBox, keys.indexOf(k));
      stop();
      stop = pairView($("compare-dots"), $("compare-pair"), t.clips, (c) => [
        `MPEG-Diffusion (ours) <small><span class="hl">${pct(c.ours_tokens)} tokens</span> &middot; <span class="hl">DiT-determined</span> HR region</small>`,
        `${esc(t.theirs)}${c.from_site ? "*" : ""} <small>${pct(c.theirs_tokens)} tokens &middot; human-preset HR region</small>`,
        c.from_site ? `* Videos from the <a href="https://georgenakayama.github.io/lotdiffusion/">Level-of-Token official website</a>.` : "",
      ]) || (() => {});
    }

    keys.forEach((k) => {
      const t = tabs[k];
      const b = el("button", "tab", esc(t.tab) + (t.sub ? ` <small>(${esc(t.sub)})</small>` : ""));
      b.type = "button";
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => show(k));
      tabBox.appendChild(b);
    });
    if (keys.length) show(keys[0]);
  }

  // ---------------------------------------------------------------- lightbox modal (click any video to enlarge)
  let openModal = null;
  function initLightbox() {
    const lb = $("lightbox");
    if (!lb) return;
    const video = $("lb-video");
    const canvas = $("lb-canvas");
    const toggle = $("lb-toggle");
    const tokWrap = $("lb-tok-wrap");
    const prevBtn = $("lb-prev");
    const nextBtn = $("lb-next");
    const counter = $("lb-counter");
    let cur = null;
    let nav = null;

    const ctl = bindVideoGrid(video, canvas, () => cur && {
      masks: cur.masks,
      grid: cur.it.grid,
      fps: cur.it.fps,
      show: toggle.checked,
    });

    function close() {
      lb.hidden = true;
      document.body.style.overflow = "";
      video.pause();
      video.removeAttribute("src");
      cur = null;
      nav = null;
    }

    function showItem(it, label, masks) {
      cur = { it, masks };
      $("lb-title").innerHTML = label;
      $("lb-prompt").textContent = it.prompt || "";
      tokWrap.style.display = masks ? "" : "none";
      const [vw, vh] = it.size || [1280, 704];
      const lbP = $("lb-player");
      lbP.style.aspectRatio = `${vw} / ${vh}`;
      lbP.style.maxWidth = `calc((96vh - 96px) * ${vw} / ${vh})`;
      video.poster = it.poster || "";
      video.src = it.video;
      video.play().catch(() => {});
      ctl.resetFrame();
      if (nav && counter) {
        counter.hidden = false;
        counter.textContent = `${nav.index + 1} / ${nav.list.length}`;
      } else if (counter) {
        counter.hidden = true;
      }
    }

    function step(delta) {
      if (!nav || !nav.list.length) return;
      nav.index = (nav.index + delta + nav.list.length) % nav.list.length;
      const res = nav.onSelect(nav.index);
      showItem(res.it, res.label, res.masks || null);
    }

    openModal = (it, label, masks, showTok, navSpec) => {
      nav = navSpec || null;
      toggle.checked = Boolean(showTok);
      if (prevBtn) prevBtn.hidden = !nav;
      if (nextBtn) nextBtn.hidden = !nav;
      showItem(it, label, masks);
      lb.hidden = false;
      document.body.style.overflow = "hidden";
    };

    toggle.addEventListener("change", ctl.render);
    if (prevBtn) prevBtn.addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
    if (nextBtn) nextBtn.addEventListener("click", (e) => { e.stopPropagation(); step(1); });
    $("lb-close").addEventListener("click", close);
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    $("lb-player").addEventListener("click", () => (video.paused ? video.play() : video.pause()));
    let wheelLock = 0;
    lb.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!nav || Math.abs(e.deltaY) < 15 || Date.now() - wheelLock < 280) return;
      wheelLock = Date.now();
      step(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    window.addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    });
  }

  // ---------------------------------------------------------------- 3. applications (with Show tokens + 3 per row)
  function apps() {
    const A = S.apps || {};
    const toggle = $("apps-toggle");
    const APPS = [
      ["world", "World model"],
      ["news", "AI journalism"],
      ["edit", "Video editing"],
    ];
    const controllers = [];
    const detail = (it) => it.tokens != null
      ? `<span>${pct(it.tokens)} tokens` + (it.speedup ? ` &middot; ${Number(it.speedup).toFixed(1)}&times; faster` : "") + "</span>"
      : (it.badge ? `<span>${esc(it.badge)}</span>` : "");

    const card = (it, head, line, hoverPrompt) => {
      const d = el("div", "item");
      if (head) d.appendChild(el("h3", "app-name", esc(head)));
      const pWrap = el("div", "app-player");
      if (it.size) pWrap.style.aspectRatio = `${it.size[0]} / ${it.size[1]}`;
      pWrap.title = "Click to enlarge";
      const v = lazyVideo(it.video, it.poster, it.size);
      const c = el("canvas");
      c.setAttribute("aria-hidden", "true");
      pWrap.append(v, c);
      if (hoverPrompt && it.prompt) {
        pWrap.appendChild(el("div", "hover-prompt", esc(it.prompt)));
      }
      d.appendChild(pWrap);
      const modalTitle = (line ? `<b>${esc(line)}</b>` : "") + detail(it);
      const capHtml = (hoverPrompt || !line ? "" : `<b>${esc(line)}</b>`) + detail(it);
      d.appendChild(el("div", "cap", capHtml));
      const masks = decodeMask(it);
      pWrap.addEventListener("click", () => {
        if (openModal) openModal(it, modalTitle, masks, toggle && toggle.checked);
      });
      if (masks) {
        const ctl = bindVideoGrid(v, c, () => ({
          masks,
          grid: it.grid,
          fps: it.fps,
          show: Boolean(toggle && toggle.checked),
        }));
        controllers.push(ctl);
      }
      return d;
    };

    if ($("apps-glance")) {
      APPS.forEach(([key, name]) => {
        const first = (A[key] || [])[0];
        if (first) $("apps-glance").appendChild(card(first, name, first.title || "", true));
      });
    }
    if ($("lim-grid")) {
      (S.limitations || []).forEach((it) => $("lim-grid").appendChild(card(it, "", it.title)));
    }
    const PF = S.problem_fix || {};
    if ($("pf-region-video") && PF.region && PF.region.length) {
      const rItems = PF.region;
      const rVideo = $("pf-region-video");
      const rCanvas = $("pf-region-canvas");
      const rToggle = $("pf-region-toggle");
      const rLegend = $("pf-region-legend");
      const rDots = $("pf-region-dots");
      const rPromptBar = $("pf-region-prompt-bar");
      let rCur = null;
      let rIdx = 0;

      const rCtl = bindVideoGrid(rVideo, rCanvas, () => rCur && {
        masks: rCur.masks,
        grid: rCur.it.grid,
        fps: rCur.it.fps,
        show: rToggle.checked,
      });

      const rSelect = (i) => {
        rIdx = (i + rItems.length) % rItems.length;
        const it = rItems[rIdx];
        rCur = { it, masks: decodeMask(it) };
        rVideo.poster = it.poster;
        rVideo.src = it.video;
        rVideo.play().catch(() => {});
        $("pf-region-prompt").textContent = it.prompt;
        $("pf-region-stats").innerHTML =
          `<b>${esc(it.title)}</b> &nbsp;&middot;&nbsp; <b>${pct(it.tokens)}</b> tokens &middot; <b>${it.speedup}&times;</b> faster`;
        selectIn(rDots, rIdx);
        rCtl.resetFrame();
      };

      $("pf-region-prev").addEventListener("click", (e) => { e.stopPropagation(); rSelect(rIdx - 1); });
      $("pf-region-next").addEventListener("click", (e) => { e.stopPropagation(); rSelect(rIdx + 1); });
      rItems.forEach((it, i) => {
        const b = el("button", "dot");
        b.type = "button";
        b.setAttribute("role", "tab");
        b.title = it.title;
        b.setAttribute("aria-label", it.title);
        b.addEventListener("click", () => rSelect(i));
        rDots.appendChild(b);
      });
      rToggle.addEventListener("change", () => {
        rLegend.classList.toggle("off", !rToggle.checked);
        rCtl.render();
      });
      if (rPromptBar) rPromptBar.addEventListener("click", () => rPromptBar.classList.toggle("expanded"));
      $("pf-region-player").addEventListener("click", () => (rVideo.paused ? rVideo.play() : rVideo.pause()));
      $("pf-region-player").title = "Click to pause / play";
      window.addEventListener("resize", rCtl.render);
      rSelect(0);
    }
    if ($("pf-attention-pair") && PF.attention && PF.attention.length) {
      pairView($("pf-attention-dots"), $("pf-attention-pair"), PF.attention, (c) => [
        c.ours_label,
        c.theirs_label,
        "",
      ]);
    }
    if ($("pf-decoder-pair") && PF.decoder && PF.decoder.length) {
      pairView($("pf-decoder-dots"), $("pf-decoder-pair"), PF.decoder, (c) => [
        c.ours_label,
        c.theirs_label,
        "",
      ]);
    }

    // Interleave rows of 3 so every row in "More examples" has [World model | AI journalism | Video editing]
    if ($("apps-extra")) {
      const maxLen = Math.max(...APPS.map(([k]) => (A[k] || []).length));
      for (let r = 1; r < maxLen; r++) {
        APPS.forEach(([key, name]) => {
          const it = (A[key] || [])[r];
          if (it) $("apps-extra").appendChild(card(it, "", `${name}: ${it.title}`, true));
        });
      }
    }

    const redrawAll = () => controllers.forEach((ctl) => ctl.render());
    const legend = $("apps-legend");
    if (toggle) {
      if (legend) legend.classList.toggle("off", !toggle.checked);
      toggle.addEventListener("change", () => {
        if (legend) legend.classList.toggle("off", !toggle.checked);
        redrawAll();
      });
    }
    const more = $("apps-more");
    if (more) more.addEventListener("toggle", () => setTimeout(redrawAll, 30));
    window.addEventListener("resize", redrawAll);
  }

  // ---------------------------------------------------------------- 4. citation (the method figure is method.js)
  function copyBib() {
    const btn = $("copy-bib");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const text = $("bib-text").textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) { // no clipboard API (plain http): select the text and copy it
        const r = document.createRange();
        r.selectNodeContents($("bib-text"));
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        document.execCommand("copy");
        sel.removeAllRanges();
      }
      btn.textContent = "Copied";
      btn.classList.add("ok");
      setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("ok"); }, 1600);
    });
  }

  // ---------------------------------------------------------------- 5. human evaluation
  function humanEval() {
    const H = S.human_eval;
    if (!H) return;
    $("he-lead").textContent =
      `(${H.raters} raters · 3,000 blind votes · ${H.prompts} prompts)`;
    // Order: prior mixed-res methods first (highest win rates), then LR and Full resolution references
    const order = ["phase_align", "foveated", "lr", "hr"];
    const sorted = [...H.rows].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    sorted.forEach((r) => {
      const w = Number(r.win);
      const b = Number((100 - w).toFixed(1));
      const row = el("div", "bar-row",
        `<div class="name">vs. ${esc(r.name)}</div>` +
        `<div class="bar">` +
          `<div class="ours" style="width:${w}%" title="Ours preferred: ${w.toFixed(1)}%"><span>${w >= 8 ? w.toFixed(1) + "%" : ""}</span></div>` +
          `<div class="base" style="width:${b}%" title="${esc(r.name)} preferred: ${b.toFixed(1)}%"><span>${b >= 8 ? b.toFixed(1) + "%" : ""}</span></div>` +
        `</div>` +
        `<div class="win">${pct(w)}</div>`);
      $("he-bars").appendChild(row);
    });
  }

  initLightbox();
  teaser();
  compare();
  apps();
  copyBib();
  humanEval();
  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }
})();
