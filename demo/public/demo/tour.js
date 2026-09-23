// Spotlight tour: dims the page, cuts a hole around one section at a time, and explains it.
"use strict";

(() => {
  const STEPS = [
    { target: "#tour-account", title: "Pick who you are", text: "You're signed in to one company. That choice, not anything you type, decides which tickets you can see. Switch companies and the same search returns different rows." },
    { target: "#search", title: "Ask in plain English", text: "Type a request the way you'd say it. JevFilter turns it into filters for this helpdesk's existing search API." },
    { target: "#tour-sentence", title: "See what it understood", text: "Recognised phrases are marked in your sentence, and every filter it will apply appears as a chip. If something is ambiguous, you get a question here instead of a guess." },
    { target: "#stage-parse", title: "Code reads the values", text: "\"Last week\" became exact dates and \"$500\" an exact bound. Code does this part, so the model can't invent a number." },
    { target: "#stage-jev", title: "Jev picks, it doesn't write", text: "For each field, Jev chose one option from a fixed list and scored every option. It never writes a query. Low scores turn into questions for you." },
    { target: "#stage-filters", title: "The contract your API receives", text: "This object is checked against the schema before anything runs. Unknown fields, values, and operators are rejected." },
    { target: "#stage-run", title: "Your API, your rules", text: "The helpdesk's own search ran it inside the signed-in company. Tokens and cost for this one search are shown too." },
    { target: "#tour-results", title: "Real results", text: "Matching tickets from the existing API. When nothing matches, the list stays empty instead of quietly broadening the search." },
    { target: "#tour-break", title: "Now try to break it", text: "Each of these tries to escape the company or sneak in a query. Every one is refused, and the counter stays at zero." },
  ];

  const $ = (id) => document.getElementById(id);
  const root = $("tour");
  const hole = $("tour-hole");
  const card = $("tour-card");
  let i = 0;
  let open = false;
  let lastFocus = null;

  function place() {
    if (!open) return;
    const t = document.querySelector(STEPS[i].target);
    if (!t) return;
    const pad = 8;
    const r = t.getBoundingClientRect();
    const top = Math.max(8, r.top - pad);
    const left = Math.max(8, r.left - pad);
    const width = Math.min(window.innerWidth - left - 8, r.width + pad * 2);
    const height = Math.min(window.innerHeight - top - 8, r.height + pad * 2);
    Object.assign(hole.style, { top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px` });

    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const gap = 16;
    let cy = top + height + gap;
    if (cy + ch > window.innerHeight - 8) cy = top - ch - gap;
    if (cy < 8) cy = Math.max(8, window.innerHeight - ch - 12);
    let cx = Math.min(Math.max(8, left), window.innerWidth - cw - 8);
    Object.assign(card.style, { top: `${cy}px`, left: `${cx}px` });
  }

  function show() {
    const s = STEPS[i];
    $("tour-step").textContent = `Step ${i + 1} of ${STEPS.length}`;
    $("tour-title").textContent = s.title;
    $("tour-text").textContent = s.text;
    $("tour-back").disabled = i === 0;
    $("tour-next").textContent = i === STEPS.length - 1 ? "Finish" : "Next";
    const t = document.querySelector(s.target);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    t?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    // Place now and again after the scroll settles.
    place();
    setTimeout(place, reduce ? 0 : 380);
    $("tour-next").focus();
  }

  async function start() {
    if (open) return;
    open = true;
    lastFocus = document.activeElement;
    i = 0;
    root.hidden = false;
    // Make sure every panel has something to explain.
    if (window.jfDemo && !window.jfDemo.hasResult()) {
      document.getElementById("q").value = window.jfDemo.heroQuery;
      await window.jfDemo.search(window.jfDemo.heroQuery);
    }
    show();
  }

  function end() {
    open = false;
    root.hidden = true;
    try { localStorage.setItem("jf-tour-done", "1"); } catch {}
    lastFocus?.focus?.();
  }

  $("tour-next").addEventListener("click", () => (i < STEPS.length - 1 ? (i++, show()) : end()));
  $("tour-back").addEventListener("click", () => { if (i > 0) { i--; show(); } });
  $("tour-skip").addEventListener("click", end);
  $("tour-start").addEventListener("click", start);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") end();
    else if (e.key === "ArrowRight") $("tour-next").click();
    else if (e.key === "ArrowLeft") $("tour-back").click();
    else if (e.key === "Tab") {
      // Keep focus inside the tour card.
      const f = [...card.querySelectorAll("button:not([disabled])")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // First visit: start the tour once the page has loaded its accounts.
  let seen = false;
  try { seen = localStorage.getItem("jf-tour-done") === "1"; } catch {}
  if (!seen && !new URLSearchParams(location.search).has("q")) setTimeout(start, 700);
})();
