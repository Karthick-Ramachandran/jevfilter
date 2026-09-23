/* JevFilter landing page. No dependencies. Builds DOM with textContent only. */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  root.classList.add("js");

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { /* ignore */ }

  function el(tag, cls, text) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------------- theme toggle ---------------- */
  var THEME_KEY = "jevfilter-theme";

  function systemDark() {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { return false; }
  }
  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set === "light" || set === "dark") return set;
    return systemDark() ? "dark" : "light";
  }
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var btn = doc.getElementById("theme-toggle");
    if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    var metas = doc.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", theme === "dark" ? "#0c0e11" : "#f5f4ee");
  }

  (function initTheme() {
    var saved = null;
    try { saved = window.localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
    if (saved === "light" || saved === "dark") applyTheme(saved);
    var btn = doc.getElementById("theme-toggle");
    if (!btn) return;
    btn.setAttribute("aria-label", currentTheme() === "dark" ? "Switch to light theme" : "Switch to dark theme");
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try { window.localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    });
  })();

  /* ---------------- announcer + clipboard ---------------- */
  var announcer = doc.getElementById("announcer");
  function announce(msg) {
    if (!announcer) return;
    announcer.textContent = "";
    window.setTimeout(function () { announcer.textContent = msg; }, 30);
  }

  function fallbackCopy(text) {
    var ta = el("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.className = "sr-only";
    doc.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = doc.execCommand("copy"); } catch (e) { ok = false; }
    doc.body.removeChild(ta);
    return ok;
  }

  function selectNode(node) {
    try {
      var range = doc.createRange();
      range.selectNodeContents(node);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) { /* ignore */ }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  var copyButtons = doc.querySelectorAll("[data-copy]");
  Array.prototype.forEach.call(copyButtons, function (btn) {
    var label = btn.querySelector(".copy-label");
    var baseAria = btn.getAttribute("aria-label") || "Copy";
    var timer = null;
    btn.addEventListener("click", function () {
      var target = doc.getElementById(btn.getAttribute("data-copy"));
      if (!target) return;
      copyText(target.textContent).then(function (ok) {
        window.clearTimeout(timer);
        if (ok) {
          btn.classList.add("is-copied");
          if (label) label.textContent = "Copied";
          btn.setAttribute("aria-label", "Copied");
          announce("Copied to clipboard");
        } else {
          selectNode(target);
          if (label) label.textContent = "Press Ctrl+C";
          announce("Copy failed. The text is selected; press Control C or Command C to copy.");
        }
        timer = window.setTimeout(function () {
          btn.classList.remove("is-copied");
          if (label) label.textContent = "Copy";
          btn.setAttribute("aria-label", baseAria);
        }, 1800);
      });
    });
  });

  /* ---------------- TypeScript highlighter for code blocks ---------------- */
  var TS_KEYWORDS = /^(import|from|const|let|await|async|if|else|return|type|export|new|function|null|true|false|undefined)$/;
  var TS_RE = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|([{}()[\];,.:=<>|?!+\-*/&]+)/g;

  function highlightTS(code) {
    var src = code.textContent;
    var frag = doc.createDocumentFragment();
    var last = 0;
    var m;
    TS_RE.lastIndex = 0;
    while ((m = TS_RE.exec(src)) !== null) {
      if (m.index > last) frag.appendChild(doc.createTextNode(src.slice(last, m.index)));
      var cls = null;
      if (m[1]) cls = "tk-com";
      else if (m[2]) cls = "tk-str";
      else if (m[3]) cls = "tk-num";
      else if (m[4]) cls = TS_KEYWORDS.test(m[4]) ? "tk-kw" : "tk-fn";
      else if (m[5]) cls = TS_KEYWORDS.test(m[5]) ? "tk-kw" : null;
      else if (m[6]) cls = "tk-p";
      if (cls) frag.appendChild(el("span", cls, m[0]));
      else frag.appendChild(doc.createTextNode(m[0]));
      last = TS_RE.lastIndex;
    }
    if (last < src.length) frag.appendChild(doc.createTextNode(src.slice(last)));
    code.textContent = "";
    code.appendChild(frag);
  }
  Array.prototype.forEach.call(doc.querySelectorAll('code[data-lang="ts"]'), highlightTS);

  /* ---------------- JSON highlighter (per line) ---------------- */
  var JSON_RE = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],:])|(\s+)/g;

  function jsonLine(text) {
    var line = el("span", "jl");
    var m;
    var last = 0;
    JSON_RE.lastIndex = 0;
    while ((m = JSON_RE.exec(text)) !== null) {
      if (m.index > last) line.appendChild(doc.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        line.appendChild(el("span", m[2] ? "j-key" : "j-str", m[1]));
        if (m[2]) line.appendChild(el("span", "j-p", m[2]));
      } else if (m[3]) line.appendChild(el("span", "j-num", m[3]));
      else if (m[4]) line.appendChild(el("span", "j-lit", m[4]));
      else if (m[5]) line.appendChild(el("span", "j-p", m[5]));
      else line.appendChild(doc.createTextNode(m[0]));
      last = JSON_RE.lastIndex;
    }
    if (last < text.length) line.appendChild(doc.createTextNode(text.slice(last)));
    if (!text.length) line.appendChild(doc.createTextNode(" "));
    return line;
  }

  /* ---------------- scroll reveal ---------------- */
  var reveals = doc.querySelectorAll(".reveal");
  if (!reduceMotion && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    Array.prototype.forEach.call(reveals, function (n) { io.observe(n); });
  } else {
    Array.prototype.forEach.call(reveals, function (n) { n.classList.add("is-in"); });
  }

  /* ---------------- terminal examples (real library outputs) ---------------- */
  var EXAMPLES = [
    {
      query: "urgent billing tickets from last week",
      result: {
        status: "ready",
        filters: { priority: "high", category: "billing", createdAt: { gte: "2026-09-14", lt: "2026-09-21" } },
        interpretation: [
          { field: "priority", text: "priority is high" },
          { field: "category", text: "category is billing" },
          { field: "createdAt", text: "created from 2026-09-14 to before 2026-09-21" }
        ]
      }
    },
    {
      query: "Sam's tickets",
      result: {
        status: "needs_clarification",
        questions: [{
          kind: "choose_entity",
          field: "customer",
          question: "Which customer did you mean?",
          options: [
            { value: "cus_1", label: "Sam Wilson", filters: { customer: "cus_1" } },
            { value: "cus_2", label: "Sam Kumar", filters: { customer: "cus_2" } },
            { value: "cus_3", label: "Sam Thomas", filters: { customer: "cus_3" } }
          ]
        }]
      }
    },
    {
      query: "tickets under $500",
      result: { status: "ready", filters: { amount: { lt: 500 } } },
      chips: ["amount < 500"]
    },
    {
      query: "show me all tenants",
      result: { status: "unsupported", reason: "out_of_scope", message: "This search can only filter tickets by its listed fields." }
    },
    {
      query: "open or pending tickets",
      result: { status: "unsupported", reason: "multiple_values", field: "status", message: "Pick one status at a time for now." }
    },
    {
      query: "resolved support tickets",
      result: {
        status: "needs_clarification",
        filters: { status: "closed" },
        questions: [{ kind: "choose_value", field: "category", question: "Which category did you mean?" }]
      },
      options: ["billing", "sales", "support", "Any category"]
    }
  ];

  var term = doc.getElementById("term");
  if (!term) return;

  var cmdEl = doc.getElementById("term-cmd");
  var caret = doc.getElementById("term-caret");
  var jsonEl = doc.getElementById("term-json");
  var outEl = doc.getElementById("term-out");
  var liveEl = doc.getElementById("term-live");
  var srEl = doc.getElementById("term-sr");
  var badge = doc.getElementById("term-badge");
  var extra = doc.getElementById("term-extra");
  var qButtons = doc.querySelectorAll("#term-queries .q");

  var runId = 0;
  var timers = [];

  function later(fn, ms) {
    var t = window.setTimeout(fn, ms);
    timers.push(t);
    return t;
  }
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
    timers = [];
  }

  function commandSegments(query) {
    return [
      ["t-kw", "await "],
      ["", "search."],
      ["t-fn", "prepare"],
      ["t-p", "("],
      ["t-str", JSON.stringify(query)],
      ["t-p", ")"]
    ];
  }

  function renderCommand(segments, count) {
    cmdEl.textContent = "";
    var remaining = count;
    for (var i = 0; i < segments.length && remaining > 0; i++) {
      var text = segments[i][1];
      var part = text.slice(0, remaining);
      remaining -= part.length;
      if (segments[i][0]) cmdEl.appendChild(el("span", segments[i][0], part));
      else cmdEl.appendChild(doc.createTextNode(part));
    }
  }

  function badgeLabel(status) {
    return status === "needs_clarification" ? "needs_clarification" : status;
  }

  // Keep ISO dates and similar tokens whole: never break "2026-09-21" at a hyphen.
  function chipText(text) {
    var span = el("span", "");
    text.split(/(\d{4}-\d{2}-\d{2})/).forEach(function (part, i) {
      if (!part) return;
      if (i % 2) span.appendChild(el("span", "d", part));
      else span.appendChild(doc.createTextNode(part));
    });
    return span;
  }

  function updateFade() {
    var more = outEl.scrollHeight - outEl.scrollTop - outEl.clientHeight > 4;
    liveEl.classList.toggle("has-more", more);
  }

  function chipsFor(ex) {
    var r = ex.result;
    if (ex.chips) return ex.chips;
    if (r.interpretation) return r.interpretation.map(function (c) { return c.text; });
    return [];
  }

  function renderExtra(ex, animate) {
    extra.textContent = "";
    var r = ex.result;
    var list;
    if (r.status === "ready") {
      extra.appendChild(el("span", "x-label", "interpretation chips, ready to execute"));
      list = el("ul", "chips");
      chipsFor(ex).forEach(function (text, i) {
        var li = el("li", "chip" + (animate ? " is-new" : ""));
        li.appendChild(chipText(text));
        var x = el("span", "chip-x", "×");
        x.setAttribute("aria-hidden", "true");
        li.appendChild(x);
        if (animate) li.style.animationDelay = (i * 90) + "ms";
        list.appendChild(li);
      });
      extra.appendChild(list);
    } else if (r.status === "needs_clarification") {
      var q = r.questions[0];
      extra.appendChild(el("span", "x-label", "question for the user, not executable yet"));
      extra.appendChild(el("p", "x-q", q.question));
      list = el("ul", "chips");
      var opts = q.options
        ? q.options.map(function (o) { return { label: o.label, sub: o.value }; })
        : (ex.options || []).map(function (o) { return { label: o, sub: null }; });
      opts.forEach(function (o, i) {
        var li = el("li", "chip is-option" + (animate ? " is-new" : ""));
        li.appendChild(el("span", "", o.label));
        if (o.sub) li.appendChild(el("span", "chip-sub", o.sub));
        if (animate) li.style.animationDelay = (i * 80) + "ms";
        list.appendChild(li);
      });
      extra.appendChild(list);
    } else {
      extra.appendChild(el("span", "x-label", r.reason + ", nothing runs"));
      extra.appendChild(el("p", "x-msg", r.message));
    }
  }

  function summary(ex) {
    var r = ex.result;
    if (r.status === "ready") return "Status ready. Interpretation: " + chipsFor(ex).join("; ") + ".";
    if (r.status === "needs_clarification") {
      var q = r.questions[0];
      var opts = q.options ? q.options.map(function (o) { return o.label; }) : (ex.options || []);
      return "Status needs clarification. " + q.question + " Options: " + opts.join(", ") + ".";
    }
    return "Status unsupported, " + r.reason + ". " + r.message;
  }

  function setBadge(status, pop) {
    badge.setAttribute("data-status", status);
    badge.textContent = status === "running" ? "running" : badgeLabel(status);
    badge.classList.remove("is-pop");
    if (pop) {
      void badge.offsetWidth;
      badge.classList.add("is-pop");
    }
  }

  function finish(ex, animate) {
    updateFade();
    setBadge(ex.result.status, animate);
    renderExtra(ex, animate);
    srEl.textContent = summary(ex);
    liveEl.setAttribute("aria-busy", "false");
    updateFade();
  }

  function run(index) {
    var ex = EXAMPLES[index];
    if (!ex) return;
    runId += 1;
    var id = runId;
    clearTimers();

    for (var i = 0; i < qButtons.length; i++) {
      // Match by data-q, not position: the buttons are grouped by outcome, so DOM order differs.
      qButtons[i].setAttribute("aria-pressed", String(parseInt(qButtons[i].getAttribute("data-q"), 10) === index));
    }

    var segments = commandSegments(ex.query);
    var total = segments.reduce(function (n, s) { return n + s[1].length; }, 0);
    var lines = JSON.stringify(ex.result, null, 2).split("\n");

    jsonEl.textContent = "";
    updateFade();
    extra.textContent = "";
    srEl.textContent = "";
    outEl.scrollTop = 0;

    if (reduceMotion) {
      renderCommand(segments, total);
      caret.classList.add("is-hidden");
      lines.forEach(function (l) { jsonEl.appendChild(jsonLine(l)); });
      finish(ex, false);
      return;
    }

    liveEl.setAttribute("aria-busy", "true");
    caret.classList.remove("is-hidden");
    setBadge("running", false);

    var typed = 0;
    var typeDelay = Math.max(14, Math.min(34, 900 / total));

    function typeNext() {
      if (id !== runId) return;
      typed += 1;
      renderCommand(segments, typed);
      if (typed < total) later(typeNext, typeDelay + (Math.random() * 14 - 7));
      else later(revealLines, 260);
    }

    var lineIdx = 0;
    var lineDelay = lines.length > 20 ? 24 : 48;
    function revealLines() {
      if (id !== runId) return;
      caret.classList.add("is-hidden");
      var line = jsonLine(lines[lineIdx]);
      line.classList.add("is-new");
      jsonEl.appendChild(line);
      updateFade();
      lineIdx += 1;
      if (lineIdx < lines.length) later(revealLines, lineDelay);
      else later(function () { if (id === runId) finish(ex, true); }, 140);
    }

    renderCommand(segments, 0);
    later(typeNext, 200);
  }

  Array.prototype.forEach.call(qButtons, function (btn) {
    btn.addEventListener("click", function () {
      run(parseInt(btn.getAttribute("data-q"), 10));
    });
  });

  outEl.addEventListener("scroll", updateFade, { passive: true });
  window.addEventListener("resize", updateFade);

  run(0);

})();
