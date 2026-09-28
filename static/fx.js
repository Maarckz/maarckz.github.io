(function() {
  "use strict";
  var doc = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var container = document.querySelector(".Container");
  var state = {
    sd: 0,
    lastSd: 0,
    vel: 0,
    skew: 0,
    adFx: 0,
    vh: window.innerHeight,
    docH: 1,
    bootDone: false,
    dead: false,
    warpOn: false
  };
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function easeInOutCubic(t) {
    return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function easeOutBack(t, c) {
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }
  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }
  function recover() {
    if (state.dead) return;
    state.dead = true;
    try {
      document.querySelectorAll("[data-rv]").forEach(function(el) {
        el.removeAttribute("data-rv");
        el.classList.remove("rv-in");
        el.style.removeProperty("opacity");
        el.style.removeProperty("transform");
        el.style.removeProperty("--translateX");
      });
      if (container) container.style.transform = "";
      var ob = document.getElementById("mz-boot");
      if (ob && ob.parentNode) ob.parentNode.removeChild(ob);
      doc.classList.remove("fx-lock");
      doc.classList.remove("fx-cur-on");
      killCursor();
    } catch (e) {}
    finishBoot();
  }
  function finishBoot() {
    if (state.bootDone) return;
    state.bootDone = true;
    doc.classList.remove("fx-lock");
    doc.classList.add("fx-ready");
    recalc();
    try {
      window.dispatchEvent(new CustomEvent("mz:bootdone"));
    } catch (e) {
      window.dispatchEvent(new Event("mz:bootdone"));
    }
  }
  var SS_KEY = "mz_b5";
  var TL = {
    rowAt: 120,
    sym0: 340,
    symStep: 200,
    symDur: 300,
    exitAt: 2160,
    outDur: 430,
    fadeDur: 520
  };
  var TLF = {
    rowAt: 40,
    sym0: 120,
    symStep: 110,
    symDur: 200,
    exitAt: 1060,
    outDur: 350,
    fadeDur: 460
  };
  var bz = {
    overlay: null,
    stage: null,
    row: null,
    syms: [],
    landed: [],
    hT: [],
    pAt: [],
    pDur: [],
    pdx: [],
    pdy: [],
    prot: [],
    pc: [],
    pph: [],
    t0: 0,
    lastT: 0,
    raf: 0,
    tl: TL,
    running: false,
    exiting: false,
    holding: false,
    gateWaited: 0,
    rmAt: 0
  };
  function msSincePaint() {
    try {
      var p = performance.getEntriesByType("paint");
      for (var i = 0; i < p.length; i++) {
        if (p[i].name === "first-contentful-paint") {
          return Math.max(0, performance.now() - p[i].startTime);
        }
      }
    } catch (e) {}
    return 0;
  }
  function bootMarkup() {
    return '<div class="boot-vig"></div>' + '<div class="boot-stage">' + '<div class="boot-ggrow">' + '<div class="gg-symbol gg-symbol--disc bs"></div>' + '<div class="gg-symbol gg-symbol--rect gg-symbol--3 gg-symbol--gradient bs"></div>' + '<div class="gg-symbol bs"></div>' + '<div class="gg-symbol gg-symbol--rect gg-symbol--5 gg-symbol--gradient bs"></div>' + '<div class="gg-symbol gg-symbol--disc bs"></div>' + "</div>" + "</div>" + '<div class="boot-flash"></div>';
  }
  var PAL = ["#FFDA7A", "#FF6969", "#F29FFF", "#7C99FF"];
  function paintRow() {
    Array.prototype.forEach.call(bz.syms, function(el) {
      if (!/\bgg-symbol--gradient\b/.test(el.className) || el.style.background) return;
      var a = Math.floor(Math.random() * 4);
      var b = (a + 1 + Math.floor(Math.random() * 3)) % 4;
      el.style.background = "linear-gradient(90deg, " + PAL[a] + " 0%, " + PAL[b] + " 100%)";
    });
  }
  function buildRow() {
    var small = window.innerWidth < 768;
    var maxU = small ? Math.round(rnd(22, 26)) : Math.round(rnd(34, 44));
    var targetN = Math.round(rnd(8, 12));
    var pDisc = small ? .38 : .3;
    var pSqr = small ? .68 : .52;
    var wMax = small ? 3 : 5;
    var frag = "";
    var units = 0;
    var n = 0;
    var guard = 0;
    while (n < targetN && guard < 90) {
      guard++;
      var r = Math.random();
      var u;
      var cls;
      if (r < pDisc) {
        cls = "gg-symbol gg-symbol--disc bs";
        u = 1;
      } else if (r < pSqr) {
        cls = "gg-symbol bs";
        u = 1;
      } else {
        var w = 1 + Math.floor(Math.random() * wMax);
        u = w * 2;
        cls = "gg-symbol gg-symbol--rect gg-symbol--" + w + (Math.random() < .5 ? " gg-symbol--gradient" : "") + " bs";
      }
      var need = (n ? 1 : 0) + u;
      if (units + need > maxU) {
        if (n >= 6) break;
        continue;
      }
      frag += '<div class="' + cls + '"></div>';
      units += need;
      n++;
    }
    if (n < 6) return buildRow();
    return frag;
  }
  function planRow() {
    var nS = bz.syms.length;
    var T = bz.tl;
    var avail = T.exitAt - T.sym0 - Math.round(T.symDur * 1.45) - 200;
    var gapAvg = Math.max(50, avail / Math.max(1, nS - 1));
    var at = T.sym0;
    for (var i = nS - 1; i >= 0; i--) {
      bz.pDur[i] = Math.round(T.symDur * rnd(.75, 1.45));
      var cap = T.exitAt - bz.pDur[i] - 130;
      if (at > cap) at = Math.max(T.sym0, cap);
      bz.pAt[i] = Math.round(at);
      bz.pdx[i] = Math.round(rnd(14, 32)) * (Math.random() < .5 ? -1 : 1);
      bz.pdy[i] = Math.random() < .45 ? 0 : Math.round(rnd(4, 10)) * (Math.random() < .5 ? -1 : 1);
      bz.prot[i] = Math.random() < .5 ? 0 : +rnd(-4, 4).toFixed(2);
      bz.pc[i] = +rnd(1.2, 2.3).toFixed(2);
      bz.pph[i] = +rnd(0, 6.28).toFixed(2);
      at += Math.round(gapAvg * rnd(.55, 1.45));
    }
  }
  function initBoot() {
    var overlay = document.getElementById("mz-boot");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "mz-boot";
      overlay.innerHTML = bootMarkup();
      document.body.insertBefore(overlay, document.body.firstChild);
    }
    bz.overlay = overlay;
    bz.stage = overlay.querySelector(".boot-stage");
    bz.row = overlay.querySelector(".boot-ggrow");
    if (!bz.stage || !bz.row) {
      finishBoot();
      return;
    }
    bz.row.innerHTML = buildRow();
    bz.syms = Array.prototype.slice.call(bz.row.querySelectorAll(".bs"));
    bz.landed = bz.syms.map(function() {
      return false;
    });
    bz.hT = bz.syms.map(function() {
      return 0;
    });
    if (!bz.syms.length) {
      finishBoot();
      return;
    }
    paintRow();
    var elapsed = msSincePaint();
    if (elapsed > 2e3) {
      finishBoot();
      setTimeout(function() {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 700);
      return;
    }
    var fast = false;
    try {
      fast = !!sessionStorage.getItem(SS_KEY);
    } catch (e) {}
    bz.tl = fast ? TLF : TL;
    planRow();
    overlay.classList.add("mz-live");
    doc.classList.add("fx-lock");
    overlay.addEventListener("pointerdown", skipBoot, {
      passive: true
    });
    window.addEventListener("keydown", skipBoot);
    bz.running = true;
    bz.t0 = performance.now() - Math.max(0, Math.min(elapsed, bz.tl.exitAt));
    bz.lastT = 0;
    bz.raf = requestAnimationFrame(stepBoot);
  }
  function skipBoot() {
    if (!bz.running || bz.exiting) return;
    bz.t0 = performance.now() - bz.tl.exitAt;
  }
  function goAt(el, t, at) {
    if (el && t >= at) el.classList.add("go");
  }
  function stepBoot(now) {
    if (!bz.running) return;
    var t = now - bz.t0;
    var T = bz.tl;
    var dt = bz.lastT ? Math.min(50, t - bz.lastT) : 16;
    bz.lastT = t;
    goAt(bz.row, t, T.rowAt);
    var gate = !bz.exiting && t > 800 && (document.readyState !== "complete" || document.querySelector(".Loader"));
    bz.holding = gate && t >= T.exitAt;
    for (var i = 0; i < bz.syms.length; i++) {
      var el = bz.syms[i];
      var k = clamp((t - bz.pAt[i]) / bz.pDur[i], 0, 1);
      var eB = easeOutBack(k, bz.pc[i]);
      var x = bz.pdx[i] * (1 - eB);
      var y = bz.pdy[i] * (1 - easeOutCubic(k));
      var r = bz.prot[i] * (1 - eB);
      var op = easeOutCubic(k);
      if (bz.holding) op = 1 - .38 * (0.5 + 0.5 * Math.sin(t * .006 + bz.pph[i]));
      el.style.opacity = op.toFixed(3);
      el.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)" + (r ? " rotate(" + r.toFixed(2) + "deg)" : "");
      if (k >= 1 && !bz.landed[i]) {
        bz.landed[i] = true;
        bz.hT[i] = t;
        el.classList.add("hit");
      }
      if (bz.landed[i] && bz.hT[i] && t - bz.hT[i] > 240) {
        el.classList.remove("hit");
        bz.hT[i] = 0;
      }
    }
    var exitAt = T.exitAt;
    if (gate && t >= exitAt) {
      bz.gateWaited += dt;
      if (bz.gateWaited < 3500) exitAt += 3500;
    }
    var exK = 0;
    if (t >= exitAt) {
      if (!bz.exiting) {
        bz.exiting = true;
        bz.rmAt = t + T.outDur + T.fadeDur + 140;
        try {
          sessionStorage.setItem(SS_KEY, "1");
        } catch (e) {}
        bz.overlay.classList.add("boot-done");
        bz.overlay.classList.add("boot-out");
        finishBoot();
      }
      var fk = clamp((t - exitAt - 50) / T.fadeDur, 0, 1);
      bz.overlay.style.background = "rgba(13, 19, 22, " + (1 - easeInOutCubic(fk)).toFixed(3) + ")";
    }
    if (bz.exiting && t >= bz.rmAt) {
      bz.running = false;
      cancelAnimationFrame(bz.raf);
      window.removeEventListener("keydown", skipBoot);
      if (bz.overlay && bz.overlay.parentNode) {
        bz.overlay.parentNode.removeChild(bz.overlay);
      }
      return;
    }
    bz.raf = requestAnimationFrame(stepBoot);
  }
  var sbTrack, sbThumb;
  var sb = {
    h: 1,
    thumbH: 0,
    maxScroll: 1,
    dragging: false,
    offY: 0
  };
  function initScrollbar() {
    sbTrack = document.createElement("div");
    sbTrack.id = "fx-sb";
    sbThumb = document.createElement("span");
    sbThumb.id = "fx-sb-thumb";
    sbTrack.appendChild(sbThumb);
    document.body.appendChild(sbTrack);
    sbTrack.addEventListener("pointerdown", function(e) {
      var r = sbTrack.getBoundingClientRect();
      var y = e.clientY - r.top;
      sb.dragging = true;
      sbTrack.classList.add("sb-drag");
      if (y < sbPos() || y > sbPos() + sb.thumbH) {
        sb.offY = sb.thumbH / 2;
      } else {
        sb.offY = y - sbPos();
      }
      sbDragTo(e.clientY - r.top);
      try {
        sbTrack.setPointerCapture(e.pointerId);
      } catch (err) {}
      e.preventDefault();
    });
    sbTrack.addEventListener("pointermove", function(e) {
      if (!sb.dragging) return;
      var r = sbTrack.getBoundingClientRect();
      sbDragTo(e.clientY - r.top);
    });
    function release(e) {
      if (!sb.dragging) return;
      sb.dragging = false;
      sbTrack.classList.remove("sb-drag");
      try {
        sbTrack.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
    sbTrack.addEventListener("pointerup", release);
    sbTrack.addEventListener("pointercancel", release);
  }
  function sbPos() {
    return state.sd / sb.maxScroll * (sb.h - sb.thumbH);
  }
  function sbDragTo(y) {
    var pos = clamp(y - sb.offY, 0, Math.max(0, sb.h - sb.thumbH));
    var sc = sb.h - sb.thumbH > 0 ? pos / (sb.h - sb.thumbH) : 0;
    window.scrollTo(0, sc * sb.maxScroll);
  }
  var sbLastY = "";
  function sbUpdate() {
    if (!sbThumb) return;
    var p = clamp(state.sd / sb.maxScroll, 0, 1);
    var y = (p * (sb.h - sb.thumbH)).toFixed(1);
    if (y === sbLastY) return;
    sbLastY = y;
    sbThumb.style.transform = "translateY(" + y + "px)";
  }
  function sbMeasure() {
    if (!sbTrack) return;
    sb.h = Math.max(1, window.innerHeight);
    var ratio = clamp(state.vh / Math.max(1, state.docH), 0, 1);
    sb.thumbH = ratio >= 1 ? 0 : Math.max(48, ratio * sb.h);
    sb.maxScroll = Math.max(1, state.docH - state.vh);
    if (sb.thumbH > 0) {
      sbThumb.style.height = sb.thumbH.toFixed(0) + "px";
      sbTrack.classList.remove("sb-idle");
    } else {
      sbTrack.classList.add("sb-idle");
    }
  }
  var REVEAL_SEL = ".Home-content .social-icons, " + ".Work-content h3, .Work-content ul li, .Work-content .gg, " + ".About-content h3, .About-content p, " + ".Experience-content h3, .Experience-content ul li, " + ".About-content .gg, .Experience-content .gg";
  var rvItems = [];
  var rvAnime = false;
  try {
    rvAnime = typeof window.anime === "object" && typeof window.anime.animate === "function";
  } catch (e) {
    rvAnime = false;
  }
  if (rvAnime) doc.classList.add("fx-anime");
  function rvTx(el) {
    var m = getComputedStyle(el).transform;
    if (!m || m === "none") return 0;
    var p = m.match(/matrix\(([^)]+)\)/);
    if (!p) return 0;
    var v = parseFloat(p[1].split(",")[4]);
    return isNaN(v) ? 0 : v;
  }
  function rvAnimeGo(el, batch) {
    try {
      window.anime.animate(el, {
        opacity: { from: 0, to: 1 },
        x: { from: rvTx(el), to: 0 },
        ease: "outExpo",
        duration: 1e3,
        delay: batch * 70
      });
      return true;
    } catch (e) {
      return false;
    }
  }
  function initReveals() {
    var els = document.querySelectorAll(REVEAL_SEL);
    els.forEach(function(el) {
      el.setAttribute("data-rv", "");
      rvItems.push({
        el: el,
        y: 0,
        done: false
      });
    });
    measureReveals();
  }
  function measureReveals() {
    rvItems.forEach(function(it) {
      if (it.done) return;
      var r = it.el.getBoundingClientRect();
      it.y = r.top + state.adFx;
    });
  }
  function checkReveals() {
    if (!rvItems.length || !state.bootDone) return;
    var limit = state.adFx + state.vh * .88;
    var batch = 0;
    for (var i = 0; i < rvItems.length; i++) {
      var it = rvItems[i];
      if (it.done || it.y > limit) continue;
      it.done = true;
      var isHome = it.el.closest ? !!it.el.closest(".Home-content") : false;
      var useA = rvAnime && !reduced && !isHome;
      if (useA && !rvAnimeGo(it.el, batch)) {
        rvAnime = false;
        doc.classList.remove("fx-anime");
        useA = false;
      }
      if (!useA) {
        it.el.style.setProperty("--rv-d", batch * .07 + "s");
        it.el.classList.add("rv-in");
      }
      batch++;
    }
  }
  var cur = {
    el: null,
    x: -100,
    y: -100,
    px: -100,
    py: -100,
    on: false,
    idleT: 0,
    glT: 0,
    lastMove: 0,
    idle: false
  };
  function killCursor() {
    cur.on = false;
    try {
      clearTimeout(cur.idleT);
    } catch (e) {}
    try {
      clearTimeout(cur.glT);
    } catch (e) {}
    if (cur.el && cur.el.parentNode) cur.el.parentNode.removeChild(cur.el);
    cur.el = null;
  }
  function glitchCursor() {
    if (!cur.on || !cur.el) return;
    cur.el.classList.add("fx-cur-glitch");
    cur.glT = setTimeout(function() {
      if (!cur.on || !cur.el) return;
      cur.el.classList.remove("fx-cur-glitch");
      cur.glT = setTimeout(glitchCursor, 1e3 + Math.random() * 2e3);
    }, 250);
  }
  function initCursor() {
    var coarse = false, fine = false, touchPts = 0;
    try {
      coarse = window.matchMedia("(any-pointer: coarse)").matches;
      fine = window.matchMedia("(any-pointer: fine)").matches;
      touchPts = navigator.maxTouchPoints || 0;
    } catch (e) {}
    if (coarse && !fine || touchPts > 0 && !fine) return;
    cur.el = document.createElement("div");
    cur.el.id = "fx-cursor";
    cur.el.setAttribute("aria-hidden", "true");
    cur.el.innerHTML = '<div class="fx-cur-arrow"></div>';
    cur.el.style.transform = "translate(-100px,-100px)";
    document.body.appendChild(cur.el);
    cur.on = true;
    doc.classList.add("fx-cur-on");
    window.addEventListener("mousemove", function(e) {
      if (!cur.on || !cur.el) return;
      cur.x = e.clientX;
      cur.y = e.clientY;
      cur.lastMove = performance.now();
      if (cur.idle) {
        cur.idle = false;
        cur.el.classList.remove("fx-cur-idle");
      }
      cur.el.classList.remove("fx-cur-away");
    }, {
      passive: true
    });
    document.documentElement.addEventListener("mouseleave", function() {
      if (cur.on && cur.el) cur.el.classList.add("fx-cur-away");
    });
    document.documentElement.addEventListener("mouseenter", function() {
      if (cur.on && cur.el) cur.el.classList.remove("fx-cur-away");
    });
    window.addEventListener("blur", function() {
      if (cur.on && cur.el) cur.el.classList.add("fx-cur-away");
    });
    window.addEventListener("focus", function() {
      if (cur.on && cur.el) cur.el.classList.remove("fx-cur-away");
    });
    if (!reduced) glitchCursor();
  }
  function loop() {
    if (state.dead) return;
    try {
      state.sd = window.pageYOffset || doc.scrollTop || 0;
      var rawV = state.sd - state.lastSd;
      state.lastSd = state.sd;
      state.vel += (rawV - state.vel) * .18;
      state.adFx += .1 * (state.sd - state.adFx);
      if (!reduced && container) {
        var target = clamp(state.vel * .15, -6, 6);
        state.skew += (target - state.skew) * .16;
        if (Math.abs(state.skew) < .015 && Math.abs(target) < .015) {
          if (state.skew !== 0) {
            state.skew = 0;
            state.warpOn = false;
            container.style.transform = "";
            doc.classList.remove("fx-warp");
          }
        } else {
          if (!state.warpOn) {
            state.warpOn = true;
            doc.classList.add("fx-warp");
          }
          container.style.transform = "skewY(" + state.skew.toFixed(3) + "deg)";
        }
      }
      sbUpdate();
      checkReveals();
      if (cur.on && cur.el) {
        if (cur.x !== cur.px || cur.y !== cur.py) {
          cur.px = cur.x;
          cur.py = cur.y;
          cur.el.style.transform = "translate(" + cur.x + "px," + cur.y + "px)";
        }
        if (!cur.idle && cur.lastMove && performance.now() - cur.lastMove > 2e3) {
          cur.idle = true;
          cur.el.classList.add("fx-cur-idle");
        }
      }
    } catch (e) {
      recover();
      return;
    }
    requestAnimationFrame(loop);
  }
  function recalc() {
    state.vh = window.innerHeight;
    state.docH = Math.max(1, doc.scrollHeight);
    sbMeasure();
    measureReveals();
    fotoPlace();
  }
  function onResize() {
    recalc();
  }
  var fz = {
    f: null
  };
  function fotoPlace() {
    var f = fz.f;
    if (!f) return;
    if (window.innerWidth < 768) {
      f.style.display = "none";
      f.style.left = "";
      f.style.right = "";
      return;
    }
    f.style.display = "";
    var t = document.querySelector(".Home-content");
    if (!t) return;
    var tr = t.getBoundingClientRect().right;
    if (!tr) return;
    var fw = f.getBoundingClientRect().width;
    if (!fw) return;
    var maxLeft = Math.round(window.innerWidth - fw - 24);
    var left = Math.round(tr + (window.innerWidth - tr) / 2 - fw / 2) - 44;
    if (maxLeft < Math.round(tr + 24)) {
      left = maxLeft;
    } else {
      if (left < Math.round(tr + 24)) left = Math.round(tr + 24);
      if (left > maxLeft) left = maxLeft;
    }
    f.style.right = "auto";
    f.style.left = left + "px";
  }
  function initFoto() {
    var f = document.getElementById("mz-foto");
    if (!f) return;
    fz.f = f;
    fotoPlace();
    var m = f.querySelector(".mz-foto-marcus");
    if (m && !m.complete) {
      var i = new Image();
      i.src = m.src;
    }
    if (window.matchMedia && window.matchMedia("(hover: none)").matches) {
      f.addEventListener("click", function() {
        f.classList.toggle("mz-foto-reveal");
      });
    }
  }
  function init() {
    state.sd = window.pageYOffset || doc.scrollTop || 0;
    state.lastSd = state.sd;
    state.adFx = state.sd;
    initScrollbar();
    initBoot();
    initReveals();
    initCursor();
    initFoto();
    state.docH = Math.max(1, doc.scrollHeight);
    window.addEventListener("resize", function() {
      clearTimeout(window.__mzRz);
      window.__mzRz = setTimeout(onResize, 180);
    }, {
      passive: true
    });
    window.addEventListener("load", recalc);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(recalc);
    var recalcN = 0;
    var recalcT = setInterval(function() {
      recalc();
      if (++recalcN >= 10) clearInterval(recalcT);
    }, 1e3);
    requestAnimationFrame(loop);
  }
  init();
})();