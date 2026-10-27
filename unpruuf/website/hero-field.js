/* Hero tile field: canvas of spring-linked tiles behind the headline.
   Cursor and touch send waves through the field; it settles on its own.
   Reduced motion: frozen ripple pattern, no animation (the switch in the hero overrides the system setting). */
(function () {
  'use strict';

  var hero = document.querySelector('.hero.has-field');
  var cv = hero && hero.querySelector('.hero-field');
  var btn = document.getElementById('field-toggle');
  if (!hero || !cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');

  // Colours: tile on the hero ground (#0f2a3a), blue highlight from the site accent.
  var COLORS = { shadow: '#07161f', tile: '#143548', hi: '#3a7ea3' };

  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqCoarse = window.matchMedia('(pointer: coarse)');

  // C couples a tile to its neighbours, K pulls it back to rest, D damps per step.
  var C = 0.27, K = 0.010, D = 0.978;
  var STEP_MS = 1000 / 60, EPS = 0.004, LUT_N = 40;
  var LX = -0.55, LY = -0.83;

  var W = 0, H = 0, dpr = 1, cell = 28, cols = 0, rows = 0, ox = 0, oy = 0;
  var h = new Float32Array(0), v = new Float32Array(0), base = new Float32Array(0);
  var lut = [];
  var raf = 0, last = 0, acc = 0, energy = 0, visible = true;
  var userMotion = null; // null follows the system, otherwise "on" or "off"
  var timers = [];
  var prev = null, hoverCell = null, redrawQueued = false;

  var tilePath = typeof ctx.roundRect === 'function'
    ? function (x, y, s, r) { ctx.beginPath(); ctx.roundRect(x, y, s, s, r); }
    : function (x, y, s) { ctx.beginPath(); ctx.rect(x, y, s, s); };

  function motionOn() { return userMotion ? userMotion === 'on' : !mqReduce.matches; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  function rgb(hex) {
    hex = hex.replace('#', '');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function buildLut() {
    var shadow = rgb(COLORS.shadow), tile = rgb(COLORS.tile), hi = rgb(COLORS.hi);
    for (var i = 0; i < LUT_N; i++) {
      var t = i / (LUT_N - 1);
      lut.push(t < 0.5 ? mix(shadow, tile, t / 0.5) : mix(tile, hi, (t - 0.5) / 0.5));
    }
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function resize() {
    var rect = hero.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cell = W < 640 ? 22 : W < 1100 ? 26 : 30;
    cols = Math.ceil(W / cell) + 1;
    rows = Math.ceil(H / cell) + 1;
    ox = (W - cols * cell) / 2;
    oy = (H - rows * cell) / 2;
    h = new Float32Array(cols * rows);
    v = new Float32Array(cols * rows);
    base = new Float32Array(cols * rows);
  }

  function bakeStatic() {
    var src = [[0.78, 0.32, 0.55], [0.2, 0.86, 0.45], [0.96, 0.9, 0.4]];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var sum = 0;
        for (var k = 0; k < src.length; k++) {
          var dx = c - src[k][0] * cols, dy = r - src[k][1] * rows;
          var d = Math.sqrt(dx * dx + dy * dy);
          sum += src[k][2] * Math.cos(d * 0.85) * Math.exp(-d / 9);
        }
        base[r * cols + c] = sum;
      }
    }
    h.set(base);
  }

  function impulse(gx, gy, radius, amp) {
    var sigma = radius / 2, inv = 1 / (2 * sigma * sigma);
    var c0 = Math.max(0, Math.floor(gx - radius)), c1 = Math.min(cols - 1, Math.ceil(gx + radius));
    var r0 = Math.max(0, Math.floor(gy - radius)), r1 = Math.min(rows - 1, Math.ceil(gy + radius));
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var dx = c - gx, dy = r - gy;
        var i = r * cols + c;
        v[i] = clamp(v[i] + amp * Math.exp(-(dx * dx + dy * dy) * inv), -1.5, 1.5);
      }
    }
    energy = 1;
    wake();
  }

  function step() {
    var e = 0;
    for (var r = 1; r < rows - 1; r++) {
      for (var c = 1; c < cols - 1; c++) {
        var i = r * cols + c, hi = h[i];
        var lap = h[i - 1] + h[i + 1] + h[i - cols] + h[i + cols] - 4 * hi;
        v[i] = (v[i] + C * lap - K * hi) * D;
      }
    }
    for (var r2 = 1; r2 < rows - 1; r2++) {
      for (var c2 = 1; c2 < cols - 1; c2++) {
        var j = r2 * cols + c2;
        var nh = clamp(h[j] + v[j], -1.5, 1.5);
        h[j] = nh;
        var m = Math.max(Math.abs(nh), Math.abs(v[j]) * 6);
        if (m > e) e = m;
      }
    }
    energy = e;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var top = LUT_N - 1;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c, hh = h[i];
        var hl = c > 0 ? h[i - 1] : hh, hr = c < cols - 1 ? h[i + 1] : hh;
        var hu = r > 0 ? h[i - cols] : hh, hd = r < rows - 1 ? h[i + cols] : hh;
        var gx = (hr - hl) * 0.5, gy = (hd - hu) * 0.5;
        var shade = -(gx * LX + gy * LY);
        var t = clamp(0.5 + shade * 1.1 + hh * 0.3, 0, 1);
        var s = cell * (0.86 + clamp(hh, -1, 1) * 0.22);
        var x = ox + (c + 0.5) * cell - s / 2 - gx * cell * 0.5;
        var y = oy + (r + 0.5) * cell - s / 2 - gy * cell * 0.5;
        ctx.fillStyle = lut[(t * top) | 0];
        tilePath(x, y, s, s * 0.2);
        ctx.fill();
      }
    }
  }

  function wake() {
    if (!motionOn() || raf || !visible) return;
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    raf = 0;
    acc += Math.min(now - last, 50);
    last = now;
    var n = 0;
    while (acc >= STEP_MS && n < 4) { step(); acc -= STEP_MS; n++; }
    draw();
    if (energy > EPS) {
      raf = requestAnimationFrame(loop);
    } else {
      h.fill(0);
      v.fill(0);
      draw();
    }
  }

  // Reduced motion: the pointer lifts nearby tiles directly, redrawn once per event, nothing animates.
  function staticHover() {
    h.set(base);
    if (hoverCell) {
      var rad = 4, gx = hoverCell[0], gy = hoverCell[1];
      var c0 = Math.max(0, Math.floor(gx - rad)), c1 = Math.min(cols - 1, Math.ceil(gx + rad));
      var r0 = Math.max(0, Math.floor(gy - rad)), r1 = Math.min(rows - 1, Math.ceil(gy + rad));
      for (var r = r0; r <= r1; r++) {
        for (var c = c0; c <= c1; c++) {
          var dx = c - gx, dy = r - gy;
          h[r * cols + c] += 0.8 * Math.exp(-(dx * dx + dy * dy) / 5);
        }
      }
    }
    redrawQueued = false;
    draw();
  }
  function queueStaticRedraw() {
    if (!redrawQueued) { redrawQueued = true; requestAnimationFrame(staticHover); }
  }

  function toGrid(e) {
    var rect = hero.getBoundingClientRect();
    return [(e.clientX - rect.left - ox) / cell - 0.5, (e.clientY - rect.top - oy) / cell - 0.5];
  }

  function onMove(e) {
    var p = toGrid(e);
    if (!motionOn()) { hoverCell = p; queueStaticRedraw(); return; }
    if (prev) {
      var dx = p[0] - prev[0], dy = p[1] - prev[1];
      var speed = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(1, Math.ceil(speed / 1.5));
      var amp = 0.035 + Math.min(speed, 10) * 0.012;
      for (var s = 1; s <= steps; s++) {
        impulse(prev[0] + dx * s / steps, prev[1] + dy * s / steps, 3.2, amp);
      }
    }
    prev = p;
  }
  function onLeave() {
    prev = null;
    if (!motionOn() && hoverCell) { hoverCell = null; queueStaticRedraw(); }
  }
  function onDown(e) {
    if (!motionOn()) return;
    var p = toGrid(e);
    prev = p;
    impulse(p[0], p[1], 5, -0.9);
  }
  function onUp(e) {
    if (!motionOn()) return;
    var p = toGrid(e);
    impulse(p[0], p[1], 5, 0.9);
  }

  function intro() {
    clearTimers();
    timers.push(setTimeout(function () { impulse(cols * 0.72, rows * 0.42, 6, 1.1); }, 250));
    timers.push(setTimeout(function () { impulse(cols * 0.3, rows * 0.72, 5, 0.8); }, 800));
  }

  function applyMode(playIntro) {
    clearTimers();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    h.fill(0);
    v.fill(0);
    hoverCell = null;
    prev = null;
    var on = motionOn();
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) {
      draw();
      if (playIntro) intro();
    } else {
      bakeStatic();
      draw();
    }
  }

  if (btn) {
    btn.addEventListener('click', function () {
      userMotion = motionOn() ? 'off' : 'on';
      applyMode(userMotion === 'on');
    });
  }
  mqReduce.addEventListener('change', function () { if (!userMotion) applyMode(false); });

  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerleave', onLeave, { passive: true });
  hero.addEventListener('pointerdown', onDown, { passive: true });
  hero.addEventListener('pointerup', onUp, { passive: true });
  hero.addEventListener('pointercancel', onLeave, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
      else if (visible && energy > EPS) wake();
    }).observe(hero);
  }

  // Touch screens have no hover, so a soft drop lands now and then to show the field is live.
  setInterval(function () {
    if (mqCoarse.matches && motionOn() && visible && !raf && !document.hidden) {
      impulse(2 + Math.random() * (cols - 4), 2 + Math.random() * (rows - 4), 5, 0.5);
    }
  }, 3600);

  var resizeQueued = false, firstSize = true;
  function onResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () {
      resizeQueued = false;
      resize();
      applyMode(firstSize);
      firstSize = false;
    });
  }

  buildLut();
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(hero);
  else { window.addEventListener('resize', onResize); onResize(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
})();
