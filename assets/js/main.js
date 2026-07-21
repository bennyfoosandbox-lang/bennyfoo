(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Scroll reveals ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ---------- Stat count-up. Final values live in the markup. ---------- */
  if (!reducedMotion && 'IntersectionObserver' in window) {
    var duration = 1400;
    var statObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        statObserver.unobserve(entry.target);

        var el = entry.target;
        var target = parseFloat(el.getAttribute('data-count'));
        var prefix = el.getAttribute('data-prefix') || '';
        var suffix = el.getAttribute('data-suffix') || '';
        var decimals = (el.getAttribute('data-count').split('.')[1] || '').length;
        var start = null;

        function step(ts) {
          if (start === null) start = ts;
          var t = Math.min((ts - start) / duration, 1);
          var eased = 1 - Math.pow(1 - t, 4);
          el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });

    document.querySelectorAll('.stat-value').forEach(function (el) {
      statObserver.observe(el);
    });
  }

  /* ---------- Eyebrow scramble-in ---------- */
  (function () {
    var el = document.getElementById('eyebrow');
    if (!el || reducedMotion) return;
    var finalText = el.textContent;
    var glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/*+';
    var duration = 1200;
    var start = null;

    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / duration, 1);
      var settled = Math.floor(finalText.length * t);
      var out = '';
      for (var i = 0; i < finalText.length; i++) {
        var ch = finalText[i];
        if (i < settled || ch === ' ' || ch === '·') {
          out += ch;
        } else {
          out += glyphs[(Math.random() * glyphs.length) | 0];
        }
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = finalText;
    }
    requestAnimationFrame(frame);
  })();

  /* ---------- Magnetic primary buttons (fine pointers only) ---------- */
  if (!reducedMotion && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      var strength = 0.25;
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * strength;
        var y = (e.clientY - r.top - r.height / 2) * strength;
        btn.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });
      btn.addEventListener('pointerleave', function () {
        btn.style.transform = '';
      });
    });
  }

  /* ---------- Sticky offset: how far the dark block out-sizes the viewport ---------- */
  var inkBlock = document.getElementById('ink');
  function setStick() {
    if (!inkBlock) return;
    var overflow = Math.max(0, inkBlock.offsetHeight - window.innerHeight);
    document.documentElement.style.setProperty('--ink-stick', overflow + 'px');
  }
  setStick();
  window.addEventListener('resize', setStick);

  /* ---------- Particle field over the dark block ---------- */
  (function () {
    var canvas = document.getElementById('ink-canvas');
    var sentinel = document.getElementById('ink-end');
    if (!canvas || !inkBlock || reducedMotion) return;

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var spacing = 32;
    var dots = [];
    var raf = null;
    var running = false;
    var inkVisible = true;
    var pointer = { x: -9999, y: -9999 };
    var glow = { x: -9999, y: -9999 };
    var hasPointer = false;
    var RADIUS = 260;

    function build() {
      var w = inkBlock.offsetWidth;
      var h = inkBlock.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      for (var y = spacing / 2; y < h; y += spacing) {
        for (var x = spacing / 2; x < w; x += spacing) {
          dots.push({ ox: x, oy: y, x: x, y: y });
        }
      }
      setStick();
    }

    function tick(ts) {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // smoothed pointer, so the halo trails the cursor organically
      glow.x += (pointer.x - glow.x) * 0.14;
      glow.y += (pointer.y - glow.y) * 0.14;

      // torch halo under the dots; follows glow so it eases away on pointer leave
      if (glow.x > -500) {
        var halo = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, RADIUS * 1.15);
        halo.addColorStop(0, 'rgba(255,106,43,0.14)');
        halo.addColorStop(0.5, 'rgba(255,106,43,0.05)');
        halo.addColorStop(1, 'rgba(255,106,43,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(glow.x - RADIUS * 1.15, glow.y - RADIUS * 1.15, RADIUS * 2.3, RADIUS * 2.3);
      }

      var t = ts * 0.0006;
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        // gentle idle drift
        var tx = d.ox + Math.sin(t + d.ox * 0.011 + d.oy * 0.013) * 3;
        var ty = d.oy + Math.cos(t + d.ox * 0.013 - d.oy * 0.011) * 3;
        // push away from the smoothed pointer
        var dx = tx - glow.x;
        var dy = ty - glow.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var near = 0;
        if (dist < RADIUS && dist > 0.01) {
          near = 1 - dist / RADIUS;
          var push = near * near * 46;
          tx += (dx / dist) * push;
          ty += (dy / dist) * push;
        }
        d.x += (tx - d.x) * 0.14;
        d.y += (ty - d.y) * 0.14;

        var r = 1.1 + near * 2.1;
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, 6.2832);
        if (near > 0) {
          ctx.fillStyle = 'rgba(255,106,43,' + (0.2 + near * 0.7).toFixed(3) + ')';
        } else {
          ctx.fillStyle = 'rgba(245,245,246,0.16)';
        }
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    }

    function startLoop() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    }
    function stopLoop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }
    /* No document.hidden check: hidden tabs stop getting rAF callbacks
       anyway, and some embedded webviews misreport visibilityState. */
    function syncLoop() {
      inkVisible ? startLoop() : stopLoop();
    }

    window.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      if (!hasPointer) {
        hasPointer = true;
        glow.x = pointer.x;
        glow.y = pointer.y;
      }
    }, { passive: true });
    window.addEventListener('pointerleave', function () {
      pointer.x = -9999;
      pointer.y = -9999;
      hasPointer = false;
    });

    // the dark block is pinned behind the page, so geometry alone can't tell
    // us when it is covered; the sentinel at the top of <main> can. While the
    // sentinel sits below the viewport top, some of the dark block still shows.
    if (sentinel && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var e = entries[0];
        inkVisible = e.isIntersecting || e.boundingClientRect.top > 0;
        syncLoop();
      }, { threshold: 0 }).observe(sentinel);
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(build).observe(inkBlock);
    } else {
      window.addEventListener('resize', build);
    }
    build();
    syncLoop();
  })();
})();
