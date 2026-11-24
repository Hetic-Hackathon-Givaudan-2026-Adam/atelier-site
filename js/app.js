/* =========================================================
   Givaudan Atelier — scroll-driven frame animation
   ========================================================= */
(() => {
  "use strict";

  const FRAME_COUNT = 121;
  // Scroll progress → video frame. Fast through the opening, then the final frame is held
  // so the notes stage (47–82 %) and the call to action get time on screen.
  const FRAME_KEYS = [
    [0.0, 0],    // closed bottle (hero)
    [0.07, 6],
    [0.34, 84],  // tilt + cap/spray lift off + discs appear — quick
    [0.5, 120],  // discs fill with ingredients
    [1.0, 120],  // hold the open composition
  ];
  function progressToFrame(p) {
    for (let i = 1; i < FRAME_KEYS.length; i++) {
      const [p1, f1] = FRAME_KEYS[i];
      if (p <= p1) {
        const [p0, f0] = FRAME_KEYS[i - 1];
        return f0 + ((p - p0) / (p1 - p0)) * (f1 - f0);
      }
    }
    return FRAME_KEYS[FRAME_KEYS.length - 1][1];
  }
  const framePath = (set, i) =>
    `frames/${set === "sm" ? "sm/" : ""}frame_${String(i + 1).padStart(4, "0")}.webp`;

  // Native frame size: the source video at full resolution, cropped only on the right
  // to remove the watermark (1924×1076 → 1680×1076). The mobile set is 1200×768.
  const FRAME_W = 1680, FRAME_H = 1076;
  // Never draw a frame larger than 1 image pixel per CSS pixel: on very large screens the
  // whole frame is shown ("contain") and blends into the background instead of being blown up.
  const MAX_SCALE = 1;

  // Subject bounds and disc anchor points, normalised to the frame (measured on the source video)
  const SUBJECT = { x0: 0.185, x1: 0.693, y0: 0.08, y1: 0.93, cx: 0.439, cy: 0.505 };
  const DISCS = [
    { x: 0.640, y: 0.338 }, // top notes — right rim of the upper disc
    { x: 0.679, y: 0.468 }, // heart notes
    { x: 0.676, y: 0.566 }, // base notes
  ];

  const root = document.documentElement;
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const container = document.getElementById("scroll-container");
  const steps = Array.from(document.querySelectorAll(".step"));
  const notes = Array.from(document.querySelectorAll(".note"));
  const loader = document.getElementById("loader");
  const loaderBar = document.getElementById("loader-bar");
  const loaderPct = document.getElementById("loader-percent");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) root.classList.add("reduced");

  const frames = new Array(FRAME_COUNT);
  let frameSet = "lg";
  let currentFrame = reduced ? FRAME_COUNT - 1 : 0;
  let layout = null;
  let drawQueued = false;
  let loading = true; // no text step is shown while the loader is on screen
  let lastProgress = 0;
  root.classList.add("is-loading");

  /* ---------------- Layout ---------------- */
  function computeLayout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    root.style.setProperty("--vh", `${vh / 100}px`);

    const rect = canvas.getBoundingClientRect();
    const cw = rect.width || vw;
    const ch = rect.height || vh;
    const iw = FRAME_W, ih = FRAME_H; // both frame sets share this aspect ratio
    const tall = vw / vh < 1.02 || vw < 700;
    root.classList.toggle("layout-tall", tall);
    root.classList.toggle("layout-wide", !tall);

    const sw = SUBJECT.x1 - SUBJECT.x0;
    const sh = SUBJECT.y1 - SUBJECT.y0;
    let scale, dx, dy;

    if (!tall) {
      // the subject (bottle, cap and discs over the whole clip) fits between header and bottom
      const top = Math.max(ch * 0.11, 84), bottom = ch * 0.05;
      scale = (ch - top - bottom) / (sh * ih);
      scale = Math.min(scale, (0.56 * cw) / (sw * iw), MAX_SCALE);
      const dw = iw * scale, dh = ih * scale;
      dx = cw * 0.32 - SUBJECT.cx * dw;
      dy = top + (ch - top - bottom - sh * dh) / 2 - SUBJECT.y0 * dh;
      const subjRight = dx + SUBJECT.x1 * dw;
      const copyLeft = Math.min(Math.max(subjRight + cw * 0.045, cw * 0.5), cw * 0.62);
      root.style.setProperty("--copy-left", `${copyLeft}px`);
      root.style.setProperty("--copy-right", `${Math.max(cw * 0.06, 32)}px`);
      notes.forEach((el, i) => {
        const d = DISCS[i];
        el.style.setProperty("--x", `${dx + d.x * dw + cw * 0.012}px`);
        el.style.setProperty("--y", `${dy + d.y * dh}px`);
      });
    } else {
      scale = (0.92 * cw) / (sw * iw);
      scale = Math.min(scale, (0.56 * ch) / (sh * ih), MAX_SCALE);
      const dw = iw * scale, dh = ih * scale;
      const headerH = cw < 600 ? 64 : 84;
      dx = cw / 2 - SUBJECT.cx * dw;
      dy = headerH + 4 - SUBJECT.y0 * dh;
      const copyTop = dy + SUBJECT.y1 * dh + 12;
      root.style.setProperty("--copy-top", `${copyTop}px`);
      notes.forEach((el) => {
        el.style.removeProperty("--x");
        el.style.removeProperty("--y");
      });
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    layout = { cw, ch, dpr, scale, dx, dy, dw: iw * scale, dh: ih * scale };

    // small screens (phones, portrait tablets) and small drawings use the lighter 1200 px set
    const smallScreen = tall && Math.min(vw, vh) <= 900;
    frameSet = smallScreen || layout.dw * dpr <= 1250 ? "sm" : "lg";
  }

  /* ---------------- Drawing ---------------- */
  // Edge "skirts": a low-resolution sample of each frame's borders, with an alpha ramp,
  // used to blend the frame softly into the rest of the canvas (no hard edge, no streaks).
  const TW = 48, TH = 32, RAMP = 24;
  const edgeCache = new Array(FRAME_COUNT);
  const thumb = document.createElement("canvas");
  thumb.width = TW; thumb.height = TH;
  const tctx = thumb.getContext("2d", { willReadFrequently: true });

  function makeRamp(w, h, pixel) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const out = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, gg, b, a] = pixel(x, y);
        const o = (y * w + x) * 4;
        out.data[o] = r; out.data[o + 1] = gg; out.data[o + 2] = b; out.data[o + 3] = a;
      }
    }
    g.putImageData(out, 0, 0);
    return c;
  }

  function getEdges(index, img) {
    if (edgeCache[index]) return edgeCache[index];
    try {
      tctx.drawImage(img, 0, 0, TW, TH);
      const d = tctx.getImageData(0, 0, TW, TH).data;
      const px = (x, y) => { const o = (y * TW + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
      const ease = (t) => Math.round(255 * t * t * (3 - 2 * t)); // smoothstep
      const edges = {
        // alpha goes from 0 (inside the image) to 1 (outer solid colour)
        bottom: makeRamp(TW, RAMP, (x, y) => [...px(x, TH - 2), ease(y / (RAMP - 1))]),
        top: makeRamp(TW, RAMP, (x, y) => [...px(x, 1), ease(1 - y / (RAMP - 1))]),
        right: makeRamp(RAMP, TH, (x, y) => [...px(TW - 2, y), ease(x / (RAMP - 1))]),
        left: makeRamp(RAMP, TH, (x, y) => [...px(1, y), ease(1 - x / (RAMP - 1))]),
      };
      edgeCache[index] = edges;
      return edges;
    } catch (_) {
      return null; // tainted canvas (file://) — fall back to plain drawing
    }
  }

  function drawFrame(index) {
    let img = frames[index];
    let imgIndex = index;
    if (!img) {
      imgIndex = nearestLoadedIndex(index);
      img = imgIndex >= 0 ? frames[imgIndex] : null;
    }
    if (!img || !layout) return;

    const { dpr } = layout;
    const W = canvas.width, H = canvas.height;
    const dx = layout.dx * dpr, dy = layout.dy * dpr;
    const dw = layout.dw * dpr, dh = layout.dh * dpr;
    const x2 = dx + dw, y2 = dy + dh;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);

    const e = getEdges(imgIndex, img);
    if (!e) return;
    const fx = Math.min(dw * 0.1, 140 * dpr); // feather width inside the image
    const fy = Math.min(dh * 0.1, 140 * dpr);

    if (y2 < H) {
      ctx.drawImage(e.bottom, 0, 0, TW, RAMP, dx, y2 - fy, dw, fy);
      ctx.drawImage(e.bottom, 0, RAMP - 1, TW, 1, dx, y2 - 0.5, dw, H - y2 + 1);
    }
    if (dy > 0) {
      ctx.drawImage(e.top, 0, 0, TW, RAMP, dx, dy, dw, fy);
      ctx.drawImage(e.top, 0, 0, TW, 1, dx, 0, dw, dy + 0.5);
    }
    if (x2 < W) {
      ctx.drawImage(e.right, 0, 0, RAMP, TH, x2 - fx, dy, fx, dh);
      ctx.drawImage(e.right, RAMP - 1, 0, 1, TH, x2 - 0.5, dy, W - x2 + 1, dh);
    }
    if (dx > 0) {
      ctx.drawImage(e.left, 0, 0, RAMP, TH, dx, dy, fx, dh);
      ctx.drawImage(e.left, 0, 0, 1, TH, 0, dy, dx + 0.5, dh);
    }
    // corners: continue the end colour of the top/bottom strips so there is no visible patch
    if (dx > 0 && dy > 0) ctx.drawImage(e.top, 0, 0, 1, 1, 0, 0, dx + 0.5, dy + 0.5);
    if (x2 < W && dy > 0) ctx.drawImage(e.top, TW - 1, 0, 1, 1, x2 - 0.5, 0, W - x2 + 1, dy + 0.5);
    if (dx > 0 && y2 < H) ctx.drawImage(e.bottom, 0, RAMP - 1, 1, 1, 0, y2 - 0.5, dx + 0.5, H - y2 + 1);
    if (x2 < W && y2 < H) ctx.drawImage(e.bottom, TW - 1, RAMP - 1, 1, 1, x2 - 0.5, y2 - 0.5, W - x2 + 1, H - y2 + 1);
  }

  function nearestLoadedIndex(index) {
    for (let d = 1; d < FRAME_COUNT; d++) {
      if (frames[index - d]) return index - d;
      if (frames[index + d]) return index + d;
    }
    return -1;
  }

  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      drawFrame(currentFrame);
    });
  }

  // Sample the frame colours so the page background continues the video seamlessly.
  function sampleColors(img) {
    try {
      const c = document.createElement("canvas");
      const w = 64, h = 42;
      c.width = w; c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, w, h);
      const avg = (x, y, sw, sh) => {
        const d = g.getImageData(x, y, sw, sh).data;
        let r = 0, gg = 0, b = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        return [r / n, gg / n, b / n].map(Math.round);
      };
      const right = avg(w - 2, Math.round(h * 0.3), 2, Math.round(h * 0.4));
      root.style.setProperty("--stage-bg", `rgb(${right.join(",")})`);
    } catch (_) { /* file:// or tainted canvas — keep CSS defaults */ }
  }

  /* ---------------- Loading ---------------- */
  function loadImage(i) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        frames[i] = img;
        getEdges(i, img); // precompute blend edges while loading
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = framePath(frameSet, i);
    });
  }

  function setProgress(n) {
    const p = n / FRAME_COUNT;
    loaderBar.style.transform = `scaleX(${p})`;
    loaderPct.textContent = `${Math.round(p * 100)} %`;
  }

  // Fade the loader out completely, and only then let the texts appear.
  function hideLoader() {
    if (!loading || loader.classList.contains("is-hidden")) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        loader.style.display = "none";
        loading = false;
        root.classList.remove("is-loading");
        if (reduced) steps.forEach((el) => el.classList.add("is-active"));
        else updateSteps(lastProgress);
        resolve();
      };
      loader.addEventListener("transitionend", (e) => {
        if (e.target === loader && e.propertyName === "opacity") finish();
      });
      setTimeout(finish, reduced ? 50 : 1100);
      loader.classList.add("is-hidden");
    });
  }

  async function preloadAll() {
    const first = await loadImage(0);
    if (first) {
      sampleColors(first);
      drawFrame(0);
    }
    let loaded = 1;
    setProgress(loaded);

    const queue = [];
    for (let i = 1; i < FRAME_COUNT; i++) queue.push(i);
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift();
        await loadImage(i);
        loaded++;
        setProgress(loaded);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  /* ---------------- Text steps ---------------- */
  const stepRanges = steps.map((el) => ({
    el,
    enter: parseFloat(el.dataset.enter) / 100,
    leave: parseFloat(el.dataset.leave) / 100,
    persist: el.dataset.persist === "true",
  }));

  function updateSteps(p) {
    lastProgress = p;
    if (loading) return;
    for (const s of stepRanges) {
      const active = s.persist ? p >= s.enter : p >= s.enter && p < s.leave;
      if (active !== s.el.classList.contains("is-active")) s.el.classList.toggle("is-active", active);
    }
  }

  function onProgress(p) {
    const pp = Math.min(Math.max(p, 0), 1);
    const index = Math.min(FRAME_COUNT - 1, Math.round(progressToFrame(pp)));
    if (index !== currentFrame) {
      currentFrame = index;
      requestDraw();
    }
    updateSteps(p);
  }

  /* ---------------- Benefits reveal ---------------- */
  function initReveals() {
    const items = document.querySelectorAll(".reveal");
    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-visible");
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px" }
    );
    items.forEach((el) => io.observe(el));
  }

  /* ---------------- Scroll engine ---------------- */
  function initScroll() {
    const hasGsap = window.gsap && window.ScrollTrigger;
    if (hasGsap) gsap.registerPlugin(ScrollTrigger);

    if (window.Lenis && hasGsap) {
      const lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      window.atelierLenis = lenis; // used by the modal / mobile menu to pause scrolling
    }

    if (hasGsap) {
      ScrollTrigger.create({
        trigger: container,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => onProgress(self.progress),
        onRefresh: (self) => onProgress(self.progress),
      });
    } else {
      // graceful fallback without the CDN libraries
      const update = () => {
        const r = container.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        onProgress(total > 0 ? Math.min(Math.max(-r.top / total, 0), 1) : 0);
      };
      window.addEventListener("scroll", update, { passive: true });
      update();
    }
  }

  /* ---------------- Header state ---------------- */
  const header = document.querySelector(".site-header");
  function updateHeader() {
    const solid = reduced
      ? canvas.getBoundingClientRect().bottom <= header.offsetHeight
      : container.getBoundingClientRect().bottom <= window.innerHeight + 1; // stage starts leaving
    if (solid !== header.classList.contains("is-solid")) header.classList.toggle("is-solid", solid);
  }
  window.addEventListener("scroll", updateHeader, { passive: true });

  /* ---------------- Resize ---------------- */
  let resizeRaf = 0;
  let lastW = window.innerWidth, lastH = window.innerHeight;
  window.addEventListener("resize", () => {
    // ignore tiny height changes caused by mobile browser toolbars
    const w = window.innerWidth, h = window.innerHeight;
    if (w === lastW && Math.abs(h - lastH) < 90 && root.classList.contains("layout-tall")) return;
    lastW = w; lastH = h;
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      computeLayout();
      drawFrame(currentFrame);
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
  });

  /* ---------------- Boot ---------------- */
  async function boot() {
    computeLayout();
    updateSteps(0);
    initReveals();

    if (reduced) {
      const last = await loadImage(FRAME_COUNT - 1);
      if (last) {
        sampleColors(last);
        computeLayout();
        drawFrame(FRAME_COUNT - 1);
      }
      hideLoader();
      return;
    }

    initScroll();
    const safety = setTimeout(hideLoader, 15000); // never block the page forever
    await preloadAll();
    clearTimeout(safety);
    drawFrame(currentFrame);
    hideLoader();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => window.ScrollTrigger && ScrollTrigger.refresh());
  }
  boot();
})();
