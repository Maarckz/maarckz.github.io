(function() {
  "use strict";
  var KEY_B64 = "Z3NrXzVQM3JzVFg2R3VGWTBNUkNJVmZWV0dkeWIzRll5WTV1SmJlWlhEN2E4ZXQxV0xzSXhlU1U=";
  var GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  var GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
  var MODEL_MAIN = "llama-3.1-8b-instant";
  var MODEL_FALLBACK = "llama-3.3-70b-versatile";
  var POLLEN_POST = "https://text.pollinations.ai/openai";
  var POLLEN_GET = "https://text.pollinations.ai/";
  var LS_HIST = "mz_chat_hist_v1";
  var LS_TIP = "mz_chat_tip_v1";
  var LS_DOCK = "mz_dock_v1";
  var SS_GROQ = "mz_groq_dead";
  var LS_GROQ_KEY = "mz_groq_key";
  function groqKey() {
    try {
      var k = String(localStorage.getItem(LS_GROQ_KEY) || "").replace(/^\s+|\s+$/g, "");
      if (k.indexOf("gsk_") === 0) return k;
    } catch (e) {}
    try {
      return atob(KEY_B64);
    } catch (e) {
      return "";
    }
  }
  var SVG_SEND = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>';
  var SVG_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var SVG_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  function clean(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }
  function collectContext() {
    var ctx = {
      nome: document.title,
      projetos: [],
      links: []
    };
    var h1 = document.querySelector(".Title h1");
    if (h1) ctx.nome = clean(h1.textContent);
    var subs = [];
    document.querySelectorAll(".Title .subtitle").forEach(function(el) {
      var t = clean(el.textContent);
      if (t && subs.indexOf(t) === -1) subs.push(t);
    });
    ctx.areas = subs;
    var about = [];
    document.querySelectorAll(".About-content p").forEach(function(el) {
      about.push(clean(el.textContent));
    });
    ctx.sobre = about.join(" ");
    var seen = {};
    document.querySelectorAll(".WorkItem").forEach(function(a) {
      var t = clean(a.querySelector(".WorkItem-title") && a.querySelector(".WorkItem-title").textContent);
      var s = clean(a.querySelector(".WorkItem-subtitle") && a.querySelector(".WorkItem-subtitle").textContent);
      var href = a.getAttribute("href") || "";
      if (t && !seen[t]) {
        seen[t] = 1;
        ctx.projetos.push({
          t: t,
          s: s,
          url: href
        });
      }
    });
    var seenL = {};
    document.querySelectorAll("a[href]").forEach(function(a) {
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || href === "") return;
      if (!/^https?:/i.test(href)) return;
      var label = clean(a.textContent) || href;
      if (!seenL[href]) {
        seenL[href] = 1;
        ctx.links.push({
          t: label.slice(0, 60),
          url: href
        });
      }
    });
    ctx.secoes = [];
    document.querySelectorAll(".Section h3").forEach(function(h) {
      var t = clean(h.textContent);
      if (t && ctx.secoes.indexOf(t) === -1) ctx.secoes.push(t);
    });
    return ctx;
  }
  function buildSystemPrompt() {
    var ctx = collectContext();
    var json = JSON.stringify(ctx);
    return "Você é o BOT oficial do site pessoal de Marcus de Almeida (apelido: Maarckz), " + "profissional de Cyber Security (Purple Team, Threat Hunting, Cyber Threat Intelligence, DFIR, SOC T2/T3).\n\n" + "CONTEXTO REAL DO SITE (extraído da página — fonte da verdade):\n" + json + "\n\n" + "REGRAS:\n" + "- Responda no idioma do usuário; padrão: português brasileiro.\n" + "- Máximo ~120 palavras. Direto ao ponto, sem enrolação.\n" + "- NUNCA use tabelas markdown (nada do tipo | coluna | --- |): ficam quebradas e feias no chat. Use listas com hífen ou frases curtas.\n" + "- NUNCA use títulos markdown (#, ##, ###). Para destacar um título de linha, use **negrito**.\n" + "- Use **negrito** para destaques e links no formato [texto](url) ao citar projetos, GitHub, LinkedIn etc.\n" + "- Baseie-se SOMENTE no contexto acima. Não invente projetos, certificações, datas ou links.\n" + "- Se algo não estiver no contexto, diga que não encontra essa info no site e sugira o LinkedIn ou GitHub dele.\n" + "- Tom: profissional, amigável, com um toque geek (o tema é segurança ofensiva/defensiva).\n" + "- Se perguntarem quem você é: você é o assistente virtual do portfólio.";
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function sanitizeMd(t) {
    var lines = String(t || "").split("\n");
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (/^\s*\|/.test(L)) {
        var inner = L.replace(/[|\s:\-]/g, "");
        if (inner === "") continue;
        var cells = L.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function(c) {
          return c.trim();
        }).filter(function(c) {
          return c !== "";
        });
        if (cells.length) out.push("• " + cells.join(" — "));
        continue;
      }
      out.push(L);
    }
    var s = out.join("\n");
    s = s.replace(/^#{1,6}\s+(.+)$/gm, "**$1**");
    s = s.replace(/^\s*([-*_]\s?){3,}$/gm, "");
    s = s.replace(/`([^`\n]*)`/g, "$1");
    return s;
  }
  function renderRich(text) {
    var links = [];
    var src = escapeHtml(sanitizeMd(text));
    src = src.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    src = src.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function(m, t, u) {
      links.push('<a href="' + u + '" target="_blank" rel="noopener noopener">' + t + "</a>");
      return "\0" + (links.length - 1) + "\0";
    });
    src = src.replace(/(^|[\s>])(https?:\/\/[^\s<]+)/g, function(m, pre, u) {
      links.push('<a href="' + u + '" target="_blank" rel="noopener noopener">' + u + "</a>");
      return pre + "\0" + (links.length - 1) + "\0";
    });
    src = src.replace(/\x00(\d+)\x00/g, function(m, i) {
      return links[+i];
    });
    return src.replace(/\n/g, "<br>");
  }
  var goo, blob, trail, dotBtn, panel, msgsEl, input, sendBtn, tipEl;
  var open = false, pending = false, live = false, noted = false;
  var history = [];
  function loadHist() {
    try {
      var raw = localStorage.getItem(LS_HIST);
      if (raw) history = JSON.parse(raw) || [];
      if (!Array.isArray(history)) history = [];
    } catch (e) {
      history = [];
    }
  }
  function saveHist() {
    try {
      localStorage.setItem(LS_HIST, JSON.stringify(history.slice(-24)));
    } catch (e) {}
  }
  function addMsg(role, html, cls) {
    var d = document.createElement("div");
    d.className = "msg " + (cls || (role === "user" ? "msg--user" : "msg--bot"));
    if (role === "user") d.textContent = html; else d.innerHTML = html;
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return d;
  }
  function showTyping() {
    var d = document.createElement("div");
    d.className = "msg msg--bot msg--typing";
    d.innerHTML = "<span></span><span></span><span></span>";
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return d;
  }
  var WELCOME = "Olá! Eu sou o **bot do portfólio** do Marcus (Maarckz). Pergunte sobre **projetos**, **certificações**, **formação** ou peça os **links** — eu respondo na hora. Por onde começamos?";
  var CHIPS = [ "Quem é o Marcus?", "Quais são seus projetos?", "Quais certificações ele tem?", "Quais os links úteis?" ];
  function norm(s) {
    return String(s || "").toLowerCase().replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i").replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c");
  }
  function QUICK_WHO() {
    return "**Marcus de Almeida (Maarckz)** é profissional de **Cyber Security**, " + "focado em segurança ofensiva e inteligência de ameaças: Purple Team, Threat Hunting, " + "Cyber Threat Intelligence, DFIR e SOC T2/T3. Tem mais de **uma década de estudos**, " + "graduação em Defesa Cibernética e pós em CTI & Hunting e Ethical Hacking. " + "Desde 2018 vive CTFs: **Top 1% no TryHackMe** (251+ salas, 35+ badges) e é " + "**Wazuh Ambassador** no Brasil. Mais no [LinkedIn](https://www.linkedin.com/in/marcus-dealmeida).";
  }
  function QUICK_PROJECTS() {
    var items = [], seen = {};
    document.querySelectorAll(".Work .WorkItem").forEach(function(a) {
      var tt = clean(a.querySelector(".WorkItem-title") && a.querySelector(".WorkItem-title").textContent);
      var ss = clean(a.querySelector(".WorkItem-subtitle") && a.querySelector(".WorkItem-subtitle").textContent);
      var href = a.getAttribute("href") || "";
      if (tt && !seen[tt]) {
        seen[tt] = 1;
        var link = "";
        if (/^https/.test(href)) {
          link = " — [" + (/github\.com/.test(href) ? "repo" : "link") + "](" + href + ")";
        }
        items.push("- **" + tt + "**" + (ss ? " (" + ss + ")" : "") + link);
      }
    });
    var head = "Os **projetos** do Marcus estão na seção **Codes & Labs** e no [GitHub](https://github.com/Maarckz):";
    return items.length ? head + "\n" + items.join("\n") : head + "\n- **Inventory**, **Potemkin**, **4ROOT_CVE**, **MIMEParser**, **Weapow**, **Whaler** e os CTFs (NewTAS, CL0N3_CTF…)";
  }
  function QUICK_CERTS() {
    var secs = document.querySelectorAll(".Experience-content");
    var items = [];
    for (var i = 0; i < secs.length; i++) {
      var h = secs[i].querySelector("h3");
      if (h && /certifica/i.test(clean(h.textContent))) {
        secs[i].querySelectorAll(".WorkItem").forEach(function(a) {
          var tt = clean(a.querySelector(".WorkItem-title") && a.querySelector(".WorkItem-title").textContent);
          var ss = clean(a.querySelector(".WorkItem-subtitle") && a.querySelector(".WorkItem-subtitle").textContent);
          if (tt) items.push("- **" + tt + "**" + (ss ? " — " + ss : ""));
        });
        break;
      }
    }
    if (!items.length) {
      return "As **certificações** estão na seção Certificações do site e no " + "[LinkedIn](https://www.linkedin.com/in/marcus-dealmeida/details/certifications/): " + "Web-RTA, CTIGA, CRTeamer, CTHIR, CRTA, CRT-ID, C3SA, CCEP e mais.";
    }
    var total = items.length;
    var more = total > 8 ? "\n\n…e mais **" + (total - 8) + " certificações** — lista completa no [LinkedIn](https://www.linkedin.com/in/marcus-dealmeida/details/certifications/)." : "\n\nLista completa no [LinkedIn](https://www.linkedin.com/in/marcus-dealmeida/details/certifications/).";
    return "Ele tem **" + total + " certificações**, entre elas:\n" + items.slice(0, 8).join("\n") + more;
  }
  function QUICK_LINKS() {
    return "Os **links úteis** do Marcus:" + "\n- **LinkedIn** — [linkedin.com/in/marcus-dealmeida](https://www.linkedin.com/in/marcus-dealmeida)" + "\n- **GitHub** — [github.com/Maarckz](https://github.com/Maarckz)" + "\n- **Instagram** — [instagram.com/Maarckz](https://www.instagram.com/Maarckz)" + "\n- **Notes** — [maarckz.github.io/Notes](https://maarckz.github.io/Notes/)" + "\n- **4Root** — [4root.com.br](https://4root.com.br)" + "\n- **Bot de CVEs no Telegram** — [t.me/cve_4root_bot](https://t.me/cve_4root_bot)";
  }
  function quickAnswer(q) {
    var t = norm(q);
    if (!t) return null;
    if (t.indexOf("marcus") > -1 && (t.indexOf("quem") > -1 || t.indexOf("sobre") > -1 || t.indexOf("apresenta") > -1 || t.indexOf("diz") > -1)) {
      return QUICK_WHO();
    }
    if (t.indexOf("certific") > -1) return QUICK_CERTS();
    if (t.indexOf("projeto") > -1 || t.indexOf("codes") > -1 || t.indexOf("repo") > -1) {
      return QUICK_PROJECTS();
    }
    if (t.indexOf("link") > -1 || t.indexOf("contato") > -1 || t.indexOf("redes") > -1 || t.indexOf("onde") > -1 && (t.indexOf("ach") > -1 || t.indexOf("encontr") > -1)) {
      return QUICK_LINKS();
    }
    return null;
  }
  function renderChips() {
    var wrap = panel.querySelector(".bot-chips");
    if (!wrap) return;
    wrap.innerHTML = "";
    CHIPS.forEach(function(c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "bot-chip";
      b.textContent = c;
      b.addEventListener("click", function() {
        send(c);
      });
      wrap.appendChild(b);
    });
  }
  var P = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    ex: 0,
    ey: 0,
    px: 0,
    py: 0,
    svx: 0,
    svy: 0,
    squash: 0,
    enter: 0,
    enterT: 0,
    hover: 0,
    hoverT: 0,
    dragging: false,
    side: "right",
    vw: 1,
    vh: 1,
    open: false
  };
  var M = 30;
  var idleF = 0;
  var rmMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function edgeX(side) {
    return side === "left" ? M : P.vw - M;
  }
  function restoreDock() {
    P.vw = Math.max(1, window.innerWidth);
    P.vh = Math.max(1, window.innerHeight);
    P.side = "right";
    var yr = .5;
    try {
      var raw = localStorage.getItem(LS_DOCK);
      if (raw) {
        var j = JSON.parse(raw);
        if (j && (j.side === "left" || j.side === "right")) P.side = j.side;
        if (j && typeof j.yr === "number") yr = clamp(j.yr, .08, .92);
      }
    } catch (e) {}
    P.x = P.tx = edgeX(P.side);
    P.y = P.ty = clamp(P.vh * yr, M, P.vh - M);
    P.px = P.x;
    P.py = P.y;
    P.ex = P.x;
    P.ey = P.y;
  }
  function saveDock() {
    try {
      localStorage.setItem(LS_DOCK, JSON.stringify({
        side: P.side,
        yr: +(P.y / Math.max(1, P.vh)).toFixed(3)
      }));
    } catch (e) {}
  }
  function dock() {
    P.side = P.x < P.vw / 2 ? "left" : "right";
    P.tx = edgeX(P.side);
    P.ty = clamp(P.y, M, P.vh - M);
    saveDock();
  }
  function loop() {
    P.enter += (P.enterT - P.enter) * .11;
    if (P.enter < .001 && P.enterT === 0) P.enter = 0;
    P.hover += (P.hoverT - P.hover) * .15;
    if (!P.dragging) {
      P.x += (P.tx - P.x) * .16;
      P.y += (P.ty - P.y) * .16;
    }
    var dx = P.x - P.px, dy = P.y - P.py;
    P.px = P.x;
    P.py = P.y;
    P.svx += (dx - P.svx) * .28;
    P.svy += (dy - P.svy) * .28;
    if (!P.dragging) {
      var dxE = P.tx - P.x;
      if (Math.abs(dxE) < 2 && Math.abs(P.svx) > 3 && P.squash < .2) P.squash = 1;
    }
    P.squash *= .86;
    P.ex += (P.x - P.ex) * .22;
    P.ey += (P.y - P.ey) * .22;
    var tdx = P.ex - P.x, tdy = P.ey - P.y;
    var tlen = Math.hypot(tdx, tdy);
    if (tlen > 170) {
      tdx *= 170 / tlen;
      tdy *= 170 / tlen;
      P.ex = P.x + tdx;
      P.ey = P.y + tdy;
    }
    var es = P.enter * (1 + P.hover * .12);
    if (es < .004) es = 0;
    var sp = Math.hypot(P.svx, P.svy);
    var st = Math.min(sp * .045, .85);
    var ang = Math.atan2(P.svy, P.svx);
    var sx = (1 + st) * es * (1 - P.squash * .3);
    var sy = Math.max(.35, 1 - st * .6) * es * (1 + P.squash * .38);
    blob.style.transform = "translate(0,0) rotate(" + ang.toFixed(3) + "rad) scale(" + sx.toFixed(3) + "," + sy.toFixed(3) + ")";
    var tst = Math.min(tlen * .02, .9);
    var tang = Math.atan2(tdy, tdx);
    var tsx = (1 + tst) * P.enter;
    var tsy = Math.max(.3, 1 - tst * .55) * P.enter;
    trail.style.transform = "translate(" + tdx.toFixed(1) + "px," + tdy.toFixed(1) + "px) rotate(" + tang.toFixed(3) + "rad) scale(" + tsx.toFixed(3) + "," + tsy.toFixed(3) + ")";
    var busy = P.dragging || P.open || P.hoverT === 1 || sp > .35 || Math.abs(P.tx - P.x) + Math.abs(P.ty - P.y) > 2;
    idleF = busy || rmMotion ? 0 : idleF + 1;
    var fl = idleF > 150 ? Math.min((idleF - 150) / 120, 1) : 0;
    var fx = 0, fy = 0;
    if (fl > 0) {
      var nowT = performance.now();
      fx = Math.sin(nowT / 1500) * 4.6 * fl;
      fy = Math.cos(nowT / 1900) * 3.4 * fl;
    }
    goo.style.transform = "translate(" + (P.x + fx - 240).toFixed(1) + "px," + (P.y + fy - 240).toFixed(1) + "px)";
    dotBtn.style.transform = "translate(" + (P.x + fx).toFixed(1) + "px," + (P.y + fy).toFixed(1) + "px)";
    requestAnimationFrame(loop);
  }
  var drag = {
    offX: 0,
    offY: 0,
    moved: 0,
    id: null
  };
  function onDown(e) {
    if (!live || P.open || P.dragging) return;
    P.dragging = true;
    drag.moved = 0;
    drag.id = e.pointerId;
    drag.offX = e.clientX - P.x;
    drag.offY = e.clientY - P.y;
    try {
      dotBtn.setPointerCapture(e.pointerId);
    } catch (err) {}
    e.preventDefault();
  }
  function onMove(e) {
    if (!P.dragging || e.pointerId !== drag.id) return;
    var nx = clamp(e.clientX - drag.offX, M, P.vw - M);
    var ny = clamp(e.clientY - drag.offY, M, P.vh - M);
    drag.moved += Math.abs(nx - P.x) + Math.abs(ny - P.y);
    P.x = P.tx = nx;
    P.y = P.ty = ny;
    e.preventDefault();
  }
  function onUp(e) {
    if (!P.dragging || e.pointerId !== drag.id) return;
    P.dragging = false;
    drag.id = null;
    if (drag.moved < 8) {
      togglePanel();
    } else {
      dock();
    }
  }
  function placePanel() {
    if (window.innerWidth <= 767) {
      panel.style.top = "";
      return;
    }
    var h = panel.offsetHeight || 680;
    var half = h / 2 + 14;
    var top = clamp(P.y, half, Math.max(half, P.vh - half));
    panel.style.top = top.toFixed(0) + "px";
  }
  function openPanel() {
    if (open) return;
    open = true;
    P.open = true;
    P.enterT = 0;
    panel.classList.toggle("side-left", P.side === "left");
    placePanel();
    panel.classList.add("bot-open");
    dotBtn.style.pointerEvents = "none";
    try {
      localStorage.setItem(LS_TIP, "1");
    } catch (e) {}
    hideTip();
    if (!msgsEl.childElementCount) {
      loadHist();
      if (history.length) {
        history.forEach(function(m) {
          addMsg(m.role === "user" ? "user" : "bot", m.role === "user" ? m.content : renderRich(m.content));
        });
      } else {
        addMsg("bot", renderRich(WELCOME));
      }
    }
    setTimeout(function() {
      try {
        input.focus();
      } catch (e) {}
    }, 300);
  }
  function closePanel() {
    if (!open) return;
    open = false;
    P.open = false;
    P.enterT = 1;
    panel.classList.remove("bot-open");
    dotBtn.style.pointerEvents = "auto";
  }
  function togglePanel() {
    open ? closePanel() : openPanel();
  }
  function hideTip() {
    if (tipEl) tipEl.classList.remove("bot-tip-in");
  }
  function placeTip() {
    if (!tipEl) return;
    tipEl.style.top = P.y + "px";
    tipEl.style.transform = "translateY(-50%)";
    if (P.side === "right") {
      tipEl.style.right = P.vw - P.x + 40 + "px";
      tipEl.style.left = "auto";
    } else {
      tipEl.style.left = P.x + 40 + "px";
      tipEl.style.right = "auto";
    }
  }
  function buildUI() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    svg.innerHTML = '<defs><filter id="mz-goo">' + '<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/>' + '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g"/>' + "</filter></defs>";
    document.body.appendChild(svg);
    goo = document.createElement("div");
    goo.id = "bot-goo";
    goo.setAttribute("aria-hidden", "true");
    goo.innerHTML = '<div class="bot-trail"></div><div class="bot-blob"></div>';
    document.body.appendChild(goo);
    blob = goo.querySelector(".bot-blob");
    trail = goo.querySelector(".bot-trail");
    dotBtn = document.createElement("button");
    dotBtn.id = "bot-dot";
    dotBtn.type = "button";
    dotBtn.setAttribute("aria-label", "Assistente virtual — arraste para mover, toque para abrir");
    dotBtn.style.pointerEvents = "auto";
    document.body.appendChild(dotBtn);
    dotBtn.addEventListener("pointerdown", onDown);
    dotBtn.addEventListener("pointermove", onMove);
    dotBtn.addEventListener("pointerup", onUp);
    dotBtn.addEventListener("pointercancel", onUp);
    dotBtn.addEventListener("mouseenter", function() {
      P.hoverT = 1;
    });
    dotBtn.addEventListener("mouseleave", function() {
      P.hoverT = 0;
    });
    dotBtn.addEventListener("contextmenu", function(e) {
      e.preventDefault();
    });
    document.addEventListener("pointerdown", function(e) {
      if (open && !panel.contains(e.target) && !dotBtn.contains(e.target)) closePanel();
    }, true);
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && open) closePanel();
    });
    tipEl = document.createElement("div");
    tipEl.id = "bot-tip";
    tipEl.textContent = "me pergunte algo sobre o Maarckz";
    document.body.appendChild(tipEl);
    panel = document.createElement("div");
    panel.id = "bot-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat com o assistente do Marcus");
    panel.innerHTML = '<div class="bot-head">' + '<span class="bot-status-dot" aria-hidden="true"></span>' + '<div class="bot-head-t"><strong>Assistente</strong></div>' + '<button type="button" id="bot-clear" aria-label="Limpar conversa" title="Limpar conversa">' + SVG_TRASH + "</button>" + '<button type="button" id="bot-close" aria-label="Fechar chat">' + SVG_X + "</button>" + "</div>" + '<div class="bot-msgs"></div>' + '<div class="bot-chips"></div>' + '<div class="bot-input-row">' + '<input id="bot-input" type="text" maxlength="500" autocomplete="off" placeholder="Pergunte sobre projetos, certs, links…">' + '<button type="button" id="bot-send" aria-label="Enviar mensagem">' + SVG_SEND + "</button>" + "</div>";
    document.body.appendChild(panel);
    msgsEl = panel.querySelector(".bot-msgs");
    input = panel.querySelector("#bot-input");
    sendBtn = panel.querySelector("#bot-send");
    panel.querySelector("#bot-close").addEventListener("click", closePanel);
    panel.querySelector("#bot-clear").addEventListener("click", function() {
      history = [];
      saveHist();
      msgsEl.innerHTML = "";
      renderChips();
      addMsg("bot", renderRich(WELCOME));
      input.focus();
    });
    sendBtn.addEventListener("click", function() {
      send();
    });
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    renderChips();
    restoreDock();
    loop();
    window.addEventListener("resize", function() {
      P.vw = Math.max(1, window.innerWidth);
      P.vh = Math.max(1, window.innerHeight);
      P.tx = edgeX(P.side);
      P.ty = clamp(P.ty, M, P.vh - M);
      P.y = clamp(P.y, M, P.vh - M);
      P.x = clamp(P.x, M, P.vw - M);
      if (open) placePanel();
    }, {
      passive: true
    });
    window.__mzBot = {
      toggle: togglePanel
    };
  }
  function pickContent(j) {
    return j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || "";
  }
  function groqDead() {
    try {
      return sessionStorage.getItem(SS_GROQ) === "1";
    } catch (e) {
      return false;
    }
  }
  function noteFallback() {
    if (noted) return;
    noted = true;
    try {
      addMsg("bot", "Nota: o Groq não respondeu agora — usando o <strong>modo alternativo de IA</strong>.", "msg--bot msg--note");
    } catch (e) {}
  }
  function callGroq(model, messages) {
    var ctrl = new AbortController;
    var to = setTimeout(function() {
      ctrl.abort();
    }, 14e3);
    return fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + groqKey(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: .65,
        max_tokens: 600
      }),
      signal: ctrl.signal
    }).then(function(res) {
      clearTimeout(to);
      if (!res.ok) {
        return res.json().catch(function() {
          return {};
        }).then(function(j) {
          var err = new Error("groq_" + res.status);
          err.status = res.status;
          err.body = j;
          throw err;
        });
      }
      return res.json();
    });
  }
  function pollenPost(messages) {
    var ctrl = new AbortController;
    var to = setTimeout(function() {
      ctrl.abort();
    }, 32e3);
    return fetch(POLLEN_POST, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai",
        messages: messages,
        temperature: .65
      }),
      signal: ctrl.signal
    }).then(function(res) {
      clearTimeout(to);
      if (!res.ok) throw new Error("pollen_" + res.status);
      return res.json();
    }).then(pickContent);
  }
  function pollenGet(messages) {
    var ctrl = new AbortController;
    var to = setTimeout(function() {
      ctrl.abort();
    }, 32e3);
    var flat = messages.filter(function(m) {
      return m.role !== "system";
    }).slice(-6).map(function(m) {
      return (m.role === "user" ? "Q: " : "A: ") + m.content;
    }).join("\n");
    var sys = "Você é o bot do portfólio de Marcus de Almeida (Maarckz), de Cyber Security. Responda curto, em pt-BR, use **negrito** e links [texto](url).";
    var url = POLLEN_GET + encodeURIComponent(flat.slice(0, 1500)) + "?model=openai&system=" + encodeURIComponent(sys);
    return fetch(url, {
      signal: ctrl.signal
    }).then(function(res) {
      clearTimeout(to);
      if (!res.ok) throw new Error("pollen_get_" + res.status);
      return res.text();
    }).then(function(t) {
      t = String(t || "").trim();
      if (!t) throw new Error("pollen_get_empty");
      return t;
    });
  }
  var SS_MODELS = "mz_groq_models";
  var modelCache = null;
  function getGroqModels() {
    if (modelCache && Date.now() - modelCache.t < 36e5) {
      return Promise.resolve(modelCache.ids);
    }
    try {
      var raw = sessionStorage.getItem(SS_MODELS);
      if (raw) {
        var j = JSON.parse(raw);
        if (j && j.ids && j.ids.length && Date.now() - j.t < 36e5) {
          modelCache = j;
          return Promise.resolve(j.ids);
        }
      }
    } catch (e) {}
    var ctrl = new AbortController;
    var to = setTimeout(function() {
      ctrl.abort();
    }, 6e3);
    return fetch(GROQ_MODELS_URL, {
      headers: {
        Authorization: "Bearer " + groqKey()
      },
      signal: ctrl.signal
    }).then(function(res) {
      clearTimeout(to);
      if (!res.ok) throw new Error("models_" + res.status);
      return res.json();
    }).then(function(j) {
      var ids = [];
      (j && j.data ? j.data : []).forEach(function(m) {
        if (m && m.id && m.active !== false) ids.push(m.id);
      });
      if (!ids.length) throw new Error("models_empty");
      modelCache = {
        t: Date.now(),
        ids: ids
      };
      try {
        sessionStorage.setItem(SS_MODELS, JSON.stringify(modelCache));
      } catch (e) {}
      return ids;
    }).catch(function() {
      return [];
    });
  }
  function pickCandidates(ids) {
    var pref = [];
    function has(re) {
      for (var i = 0; i < ids.length; i++) {
        if (re.test(ids[i]) && pref.indexOf(ids[i]) === -1) pref.push(ids[i]);
      }
    }
    if (ids.length) {
      has(/^llama-3\.1-8b-instant$/);
      has(/^llama-3\.3-70b-versatile$/);
      has(/^llama-3\.1-70b-versatile$/);
      has(/llama.*instant/i);
      has(/llama.*versatile/i);
    }
    if (!pref.length) pref = [ MODEL_MAIN, MODEL_FALLBACK ];
    return pref.slice(0, 3);
  }
  function ask(messages) {
    var chain;
    if (groqDead() || !groqKey()) {
      noted = true;
      chain = Promise.reject(new Error("groq_skip"));
    } else {
      chain = getGroqModels().then(pickCandidates).then(function(candidates) {
        var i = 0;
        function tryNext() {
          if (i >= candidates.length) throw new Error("groq_exhausted");
          var model = candidates[i++];
          return callGroq(model, messages).then(function(j) {
            var c = pickContent(j);
            if (!c) throw new Error("empty");
            return {
              text: c
            };
          }).catch(function(err) {
            var st = err && err.status;
            if (st === 401 || st === 403) {
              try {
                sessionStorage.setItem(SS_GROQ, "1");
              } catch (e) {}
              noteFallback();
              throw err;
            }
            if (st === 400 || st === 404 || st === 429 || st >= 500 || err.name === "TypeError" || err.name === "AbortError") {
              return tryNext();
            }
            throw err;
          });
        }
        return tryNext();
      });
    }
    return chain.catch(function(e1) {
      var retryable = e1 && (e1.message === "groq_skip" || e1.message === "groq_exhausted" || e1.message === "empty" || e1.status === 401 || e1.status === 403 || e1.status === 429 || e1.status >= 500 || e1.name === "TypeError" || e1.name === "AbortError");
      if (!retryable) throw e1;
      return pollenPost(messages).then(function(c) {
        if (!c) throw new Error("empty");
        return {
          text: c
        };
      }).catch(function() {
        return pollenGet(messages).then(function(c) {
          return {
            text: c
          };
        });
      });
    });
  }
  function send(forcedText) {
    if (pending) return;
    var text = clean(forcedText || input.value);
    if (!text) return;
    if (!forcedText) input.value = "";
    addMsg("user", text);
    history.push({
      role: "user",
      content: text
    });
    saveHist();
    pending = true;
    sendBtn.disabled = true;
    var typing = showTyping();
    var qa = quickAnswer(text);
    if (qa) {
      setTimeout(function() {
        typing.remove();
        addMsg("bot", renderRich(qa));
        history.push({
          role: "assistant",
          content: qa
        });
        saveHist();
        pending = false;
        sendBtn.disabled = false;
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }, 480 + Math.random() * 320);
      return;
    }
    var messages = [ {
      role: "system",
      content: buildSystemPrompt()
    } ].concat(history.slice(-12));
    function fail(msg) {
      typing.remove();
      addMsg("bot", msg, "msg--bot msg--err");
      pending = false;
      sendBtn.disabled = false;
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      fail("Sem conexão com a internet — verifica o Wi-Fi e tenta de novo.");
      return;
    }
    ask(messages).then(function(r) {
      typing.remove();
      addMsg("bot", renderRich(r.text));
      history.push({
        role: "assistant",
        content: r.text
      });
      saveHist();
      pending = false;
      sendBtn.disabled = false;
    }).catch(function(err) {
      var m = err && String(err.message || "");
      if (m === "empty") {
        fail("Recebi uma resposta vazia. Tenta reformular a pergunta?");
      } else if (err && err.name === "AbortError") {
        fail("A resposta demorou demais e foi cancelada. Tenta de novo?");
      } else {
        fail("Não consegui falar com nenhum serviço de IA agora (Groq e o fallback aberto falharam). Verifica sua conexão e tenta de novo.");
      }
    });
  }
  function parseColor(tok) {
    tok = String(tok).trim();
    if (tok.charAt(0) === "#") {
      var h = tok.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var n = parseInt(h, 16);
      return {
        r: n >> 16 & 255,
        g: n >> 8 & 255,
        b: n & 255
      };
    }
    var m = tok.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    return m ? {
      r: +m[1],
      g: +m[2],
      b: +m[3]
    } : null;
  }
  function cssRgb(c, a) {
    return a === undefined ? "rgb(" + c.r + "," + c.g + "," + c.b + ")" : "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
  }
  function adoptPageGradient() {
    var els = document.querySelectorAll(".gg-symbol--gradient");
    for (var i = 0; i < els.length; i++) {
      var bg = "";
      try {
        bg = getComputedStyle(els[i]).backgroundImage || "";
      } catch (e) {}
      var toks = bg.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g);
      if (toks && toks.length >= 2) {
        var c1 = parseColor(toks[0]), c2 = parseColor(toks[toks.length - 1]);
        if (!c1 || !c2) continue;
        var st = document.documentElement.style;
        st.setProperty("--mz-dot-a", cssRgb(c1));
        st.setProperty("--mz-dot-b", cssRgb(c2));
        st.setProperty("--mz-dot-dark", cssRgb({
          r: Math.round(c2.r * .55),
          g: Math.round(c2.g * .55),
          b: Math.round(c2.b * .55)
        }));
        st.setProperty("--mz-dot-glow", cssRgb(c1, .35));
        st.setProperty("--mz-dot-glow2", cssRgb(c2, .55));
        return true;
      }
    }
    return false;
  }
  function entrance() {
    if (live) return;
    setTimeout(function() {
      live = true;
      adoptPageGradient();
      P.enterT = 1;
      placeTip();
      var shown = false;
      try {
        shown = localStorage.getItem(LS_TIP) === "1";
      } catch (e) {}
      if (!shown) {
        setTimeout(function() {
          if (!open) tipEl.classList.add("bot-tip-in");
          setTimeout(hideTip, 6500);
        }, 1e3);
      }
    }, 350);
  }
  function init() {
    buildUI();
    adoptPageGradient();
    window.addEventListener("load", adoptPageGradient);
    window.addEventListener("mz:bootdone", adoptPageGradient, {
      once: true
    });
    if (document.documentElement.classList.contains("fx-ready")) {
      entrance();
    } else {
      window.addEventListener("mz:bootdone", entrance, {
        once: true
      });
      setTimeout(entrance, 3e3);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();