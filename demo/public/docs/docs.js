/* JevFilter docs: theme toggle, heading anchors, table of contents state. No dependencies. */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;

  /* ---------------- theme toggle (shared key with the landing page) ---------------- */
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

  var saved = null;
  try { saved = window.localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
  if (saved === "light" || saved === "dark") applyTheme(saved);

  function init() {
    var btn = doc.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-label", currentTheme() === "dark" ? "Switch to light theme" : "Switch to dark theme");
      btn.addEventListener("click", function () {
        var next = currentTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        try { window.localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      });
    }

    /* ---------------- heading anchors ---------------- */
    var heads = doc.querySelectorAll(".content h2[id], .content h3[id], .content h4[id]");
    for (var i = 0; i < heads.length; i++) {
      var a = doc.createElement("a");
      a.className = "anchor";
      a.href = "#" + heads[i].id;
      a.textContent = "#";
      a.setAttribute("aria-label", "Link to this section");
      heads[i].appendChild(a);
    }

    /* ---------------- copy buttons ---------------- */
    var copies = doc.querySelectorAll("[data-copy]");
    for (var c = 0; c < copies.length; c++) {
      copies[c].addEventListener("click", function (ev) {
        var btn = ev.currentTarget;
        var src = doc.getElementById(btn.getAttribute("data-copy"));
        if (!src) return;
        var text = src.textContent;
        function done(label) {
          btn.textContent = label;
          window.setTimeout(function () { btn.textContent = "Copy prompt"; }, 2000);
        }
        function fallback() {
          var range = doc.createRange();
          range.selectNodeContents(src);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          done("Selected. Press Ctrl+C or \u2318C");
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done("Copied"); }, fallback);
        } else {
          fallback();
        }
      });
    }

    /* ---------------- table of contents ---------------- */
    var details = doc.getElementById("toc-details");
    var narrow = null;
    try { narrow = window.matchMedia("(max-width: 960px)"); } catch (e) { narrow = null; }
    function syncToc() {
      if (!details || !narrow) return;
      if (narrow.matches) details.removeAttribute("open");
      else details.setAttribute("open", "");
    }
    syncToc();
    if (narrow) {
      if (narrow.addEventListener) narrow.addEventListener("change", syncToc);
      else if (narrow.addListener) narrow.addListener(syncToc);
    }
    if (details) {
      details.addEventListener("click", function (ev) {
        var t = ev.target;
        if (t && t.tagName === "A" && narrow && narrow.matches) details.removeAttribute("open");
      });
    }

    /* Highlight the section in view. */
    var links = doc.querySelectorAll(".toc a[href^='#']");
    var byId = {};
    var targets = [];
    for (var j = 0; j < links.length; j++) {
      var id = links[j].getAttribute("href").slice(1);
      var el = doc.getElementById(id);
      if (el) { byId[id] = links[j]; targets.push(el); }
    }
    var active = null;
    function setActive(id) {
      if (active === id) return;
      if (active && byId[active]) byId[active].removeAttribute("aria-current");
      active = id;
      if (id && byId[id]) byId[id].setAttribute("aria-current", "true");
    }
    var ticking = false;
    function onScroll() {
      ticking = false;
      var line = 120;
      var current = null;
      for (var k = 0; k < targets.length; k++) {
        if (targets[k].getBoundingClientRect().top <= line) current = targets[k].id;
        else break;
      }
      setActive(current || (targets[0] && targets[0].id));
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
