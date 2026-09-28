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
    dead: false
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
  function recover() {
    if (state.dead) return;
    state.dead = true;
    try {
      document.querySelectorAll("[data-rv]").forEach(function(el) {
        el.removeAttribute("data-rv");
        el.classList.remove("rv-in");
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
    barDur: 420,
    barStag: 64,
    lineAt: 700,
    lineDur: 550,
    scanAt: 120,
    scanDur: 1450,
    exitAt: 1650,
    outDur: 380,
    fadeDur: 460
  };
  var TLF = {
    barDur: 300,
    barStag: 34,
    lineAt: 330,
    lineDur: 400,
    scanAt: 60,
    scanDur: 800,
    exitAt: 950,
    outDur: 340,
    fadeDur: 440
  };
  var bz = {
    overlay: null,
    stage: null,
    line: null,
    scan: null,
    bars: [],
    barsW: 1,
    t0: 0,
    raf: 0,
    tl: TL,
    running: false,
    exiting: false,
    gateWaited: 0,
    rmAt: 0,
    holding: false
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
    return '<div class="boot-stage">' + '<div class="boot-line"></div>' + '<div class="boot-bars">' + '<i class="bg1" style="width:40px"></i>' + '<i class="bgy" style="width:20px"></i>' + '<i class="bdisc" style="width:14px"></i>' + '<i class="bg2" style="width:72px"></i>' + '<i class="bsq" style="width:14px"></i>' + '<i class="bg3" style="width:56px"></i>' + '<i class="bgy" style="width:20px"></i>' + '<b class="boot-scan"></b>' + "</div>" + "</div>";
  }
  function initBoot() {
    var overlay = document.getElementById("mz-boot");
    if (reduced) {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      finishBoot();
      return;
    }
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "mz-boot";
      overlay.innerHTML = bootMarkup();
      document.body.insertBefore(overlay, document.body.firstChild);
    }
    bz.overlay = overlay;
    bz.stage = overlay.querySelector(".boot-stage");
    bz.line = overlay.querySelector(".boot-line");
    bz.scan = overlay.querySelector(".boot-scan");
    bz.bars = [].slice.call(overlay.querySelectorAll(".boot-bars i"));
    if (!bz.stage || !bz.bars.length) {
      finishBoot();
      return;
    }
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
    overlay.classList.add("mz-live");
    doc.classList.add("fx-lock");
    overlay.addEventListener("pointerdown", skipBoot, {
      passive: true
    });
    window.addEventListener("keydown", skipBoot);
    bz.barsW = bz.overlay.querySelector(".boot-bars").getBoundingClientRect().width || 1;
    bz.running = true;
    bz.t0 = performance.now() - Math.max(0, Math.min(elapsed, bz.tl.exitAt));
    bz.raf = requestAnimationFrame(stepBoot);
  }
  function skipBoot() {
    if (!bz.running || bz.exiting) return;
    bz.t0 = performance.now() - bz.tl.exitAt;
  }
  function stepBoot(now) {
    if (!bz.running) return;
    var t = now - bz.t0;
    var T = bz.tl;
    var i, k;
    for (i = 0; i < bz.bars.length; i++) {
      var bt = clamp((t - i * T.barStag) / T.barDur, 0, 1);
      bz.bars[i].style.transform = "scaleX(" + easeOutCubic(bt).toFixed(4) + ")";
    }
    if (bz.line) {
      var lk = easeOutCubic(clamp((t - T.lineAt) / T.lineDur, 0, 1));
      bz.line.style.transform = "scaleX(" + lk.toFixed(4) + ")";
    }
    var gate = !bz.exiting && t > T.scanAt && (document.readyState !== "complete" || document.querySelector(".Loader"));
    bz.holding = gate && t >= T.exitAt;
    if (bz.scan) {
      var skN = (t - T.scanAt) / T.scanDur;
      if (bz.holding) skN = skN % ((T.scanDur + 380) / T.scanDur);
      var sk = clamp(skN, 0, 1);
      if (sk <= 0 || sk >= 1) {
        bz.scan.style.opacity = "0";
      } else {
        var op = sk < .12 ? sk / .12 : sk > .85 ? (1 - sk) / .15 : 1;
        bz.scan.style.opacity = op.toFixed(3);
        bz.scan.style.transform = "translateX(" + (sk * bz.barsW).toFixed(1) + "px)";
      }
    }
    var exitAt = T.exitAt;
    if (gate && t >= exitAt) {
      bz.gateWaited += 16;
      if (bz.gateWaited < 3500) exitAt += 3500;
    }
    if (t >= exitAt) {
      if (!bz.exiting) {
        bz.exiting = true;
        bz.rmAt = t + T.outDur + T.fadeDur + 120;
        try {
          sessionStorage.setItem(SS_KEY, "1");
        } catch (e) {}
        bz.overlay.classList.add("boot-done");
        finishBoot();
      }
      var ok = clamp((t - exitAt) / T.outDur, 0, 1);
      var oe = easeInOutCubic(ok);
      bz.stage.style.opacity = (1 - oe).toFixed(3);
      bz.stage.style.filter = "blur(" + (oe * 8).toFixed(1) + "px)";
      bz.stage.style.transform = "translate(" + (-26 * oe).toFixed(1) + "px," + (-14 * oe).toFixed(1) + "px)";
      var fk = clamp((t - exitAt - 30) / T.fadeDur, 0, 1);
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
  function sbUpdate() {
    if (!sbThumb) return;
    var p = clamp(state.sd / sb.maxScroll, 0, 1);
    sbThumb.style.transform = "translateY(" + (p * (sb.h - sb.thumbH)).toFixed(1) + "px)";
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
  var REVEAL_SEL = ".Home-content .social-icons, " + ".About-content h3, .About-content p, " + ".Experience-content h3, .Experience-content ul li, " + ".About-content .gg, .Experience-content .gg";
  var rvItems = [];
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
      it.el.style.setProperty("--rv-d", batch * .07 + "s");
      it.el.classList.add("rv-in");
      batch++;
    }
  }
  var cur = {
    el: null,
    x: -100,
    y: -100,
    on: false,
    idleT: 0,
    glT: 0
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
      cur.el.style.transform = "translate(" + cur.x + "px," + cur.y + "px)";
      cur.el.classList.remove("fx-cur-idle", "fx-cur-away");
      clearTimeout(cur.idleT);
      cur.idleT = setTimeout(function() {
        if (cur.on && cur.el) cur.el.classList.add("fx-cur-idle");
      }, 2e3);
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
            container.style.transform = "";
          }
        } else {
          container.style.transform = "skewY(" + state.skew.toFixed(3) + "deg)";
        }
      }
      sbUpdate();
      checkReveals();
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
  }
  function onResize() {
    recalc();
    if (bz.running && bz.overlay) {
      bz.barsW = bz.overlay.querySelector(".boot-bars").getBoundingClientRect().width || 1;
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