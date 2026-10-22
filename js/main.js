// ===== Footer year =====
document.getElementById("year").textContent = new Date().getFullYear();

// ===== Nav: border on scroll =====
const navWrap = document.querySelector(".nav-wrap");
const onScroll = () => navWrap.classList.toggle("scrolled", window.scrollY > 10);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ===== Mobile menu =====
const navWrapEl = document.querySelector(".nav-wrap");
const toggle = document.querySelector(".nav-toggle");
const links = document.querySelector(".nav-links");
const NAV_BREAKPOINT = 900; // keep in sync with the collapsed-nav media query

const setMenu = (open) => {
  links.classList.toggle("open", open);
  toggle.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", open);
};
const closeMenu = () => setMenu(false);

toggle.addEventListener("click", () => setMenu(!links.classList.contains("open")));

// close when a link or the mode toggle is tapped
links.querySelectorAll("a, button").forEach((el) =>
  el.addEventListener("click", closeMenu)
);

// close on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && links.classList.contains("open")) {
    closeMenu();
    toggle.focus();
  }
});

// close when tapping outside the header
document.addEventListener("click", (e) => {
  if (links.classList.contains("open") && !navWrapEl.contains(e.target)) closeMenu();
});

// reset the menu if the viewport grows back to the desktop nav
window.addEventListener("resize", () => {
  if (window.innerWidth > NAV_BREAKPOINT) closeMenu();
});

// ===== Scroll reveal =====
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

// ===== Animated counters =====
const animateCount = (el) => {
  const target = parseInt(el.dataset.count, 10);
  const duration = 1200;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target + (el.dataset.suffix || "");
  };
  requestAnimationFrame(tick);
};

const countObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.6 }
);
document.querySelectorAll("[data-count]").forEach((el) => countObserver.observe(el));

// ===== Active nav link highlighting =====
const sections = [...document.querySelectorAll("section[id]")];
const navAnchors = [...document.querySelectorAll(".nav-links a[href^='#']")];

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        navAnchors.forEach((a) =>
          a.classList.toggle("active", a.getAttribute("href") === `#${entry.target.id}`)
        );
      }
    });
  },
  { rootMargin: "-40% 0px -55% 0px" }
);
sections.forEach((s) => sectionObserver.observe(s));

// ===== 3D tilt on project cards =====
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

if (!reduceMotion && !coarsePointer) {
  document.querySelectorAll("[data-tilt]").forEach((card) => {
    let raf = null;
    card.addEventListener("pointermove", (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg) translateY(-3px)`;
        raf = null;
      });
    });
    card.addEventListener("pointerleave", () => {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      card.style.transform = "";
      card.style.transition = "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)";
      setTimeout(() => (card.style.transition = ""), 450);
    });
  });
}

// ===== Last race board: data/last-race.json, refreshed daily with PyMotoGP =====
// Shared with scene.js (which draws the same track), so it's fetched once.
window.lastRace = fetch("data/last-race.json")
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const shortDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const surname = (name) => name.split(" ").slice(1).join(" ") || name;

window.lastRace.then((data) => {
  if (!data?.race?.podium?.length) return;
  const { race, track } = data;

  const board = document.getElementById("race-board");
  if (board) {
    const set = (key, text) => (board.querySelector(`[data-rb="${key}"]`).textContent = text);
    const [from, to] = (track.dates || []).map(shortDate);
    const when = !from ? "" : from.split(" ")[1] === to.split(" ")[1] ? `${from.split(" ")[0]}–${to}` : `${from} – ${to}`;
    const daysTo = (iso) => Math.round((new Date(`${iso}T00:00:00`) - new Date().setHours(0, 0, 0, 0)) / 864e5);
    let upcoming = "NEXT UP";
    if (track.relation === "next" && track.dates) {
      if (daysTo(track.dates[0]) <= 0 && daysTo(track.dates[1]) >= 0) upcoming = "RACE WEEKEND";
      else if (daysTo(track.dates[0]) <= 6) upcoming = "THIS WEEKEND";
    }
    set("relation", { last: "THIS TRACK · LAST RACE", next: `${upcoming} · ${when}`, past: `${data.season} CALENDAR` }[track.relation] || "TRACK MAP");
    set("track", track.name);
    set("length", `${(track.length_m / 1000).toFixed(2)} KM`);
    set("race", `R${race.round} · ${race.country}`);

    // Flat track map for when the 3D one has no room (phones) — sectors coloured like the strip
    const SVG = "http://www.w3.org/2000/svg";
    const map = document.createElementNS(SVG, "svg");
    map.setAttribute("class", "rb-minimap");
    map.setAttribute("viewBox", "-1.15 -1.15 2.3 2.3");
    map.setAttribute("aria-hidden", "true");
    const pts = track.points;
    [0, 1, 2].forEach((s) => {
      const seg = pts.slice(Math.floor((s * pts.length) / 3), Math.floor(((s + 1) * pts.length) / 3) + 1);
      if (s === 2) seg.push(pts[0]);
      const line = document.createElementNS(SVG, "polyline");
      line.setAttribute("class", `s${s + 1}`);
      line.setAttribute("points", seg.map(([x, y]) => `${x},${-y}`).join(" "));
      map.append(line);
    });
    const start = document.createElementNS(SVG, "circle");
    start.setAttribute("cx", pts[0][0]);
    start.setAttribute("cy", -pts[0][1]);
    start.setAttribute("r", "0.08");
    map.append(start);
    board.querySelector(".rb-track").append(map);

    const podium = board.querySelector('[data-rb="podium"]');
    for (const p of race.podium) {
      const row = el("li", "rb-row");
      row.append(el("span", "rb-pos", `P${p.pos}`), el("span", "rb-num", p.number), el("span", "rb-rider", surname(p.rider)),
        el("span", "rb-bike", p.bike || ""), el("span", "rb-time", p.time));
      podium.append(row);
    }
    const foot = board.querySelector('[data-rb="foot"]');
    const stat = (label, lap) => {
      const node = el("span", "rb-stat", `${label} `);
      node.append(el("b", null, `${surname(lap.rider)} ${lap.time}`));
      return node;
    };
    if (race.pole) foot.append(stat("POLE", race.pole));
    if (race.fastest_lap) foot.append(stat("FASTEST LAP", race.fastest_lap));
    board.hidden = false;

    // Float the board beside the hero text when it fits; otherwise it joins
    // the flow under the buttons. scene.js then fits the track into what's left.
    const placeBoard = () => {
      board.classList.remove("rb-flow");
      if (getComputedStyle(board).position === "absolute") {
        const b = board.getBoundingClientRect();
        const clash = [...document.querySelectorAll(".hero-headline .race-only, .hero-sub.race-only, .hero-actions .btn")]
          .flatMap((node) => [...node.getClientRects()])
          .some((r) => r.width && r.right > b.left - 24 && r.bottom > b.top - 24 && r.top < b.bottom + 24);
        board.classList.toggle("rb-flow", clash);
      }
      board.closest(".hero")?.classList.toggle("board-floating", getComputedStyle(board).position === "absolute");
      document.dispatchEvent(new Event("tr-hero-layout"));
    };
    placeBoard();
    window.addEventListener("resize", placeBoard);
    document.addEventListener("tr-theme-change", placeBoard);
    document.fonts?.ready.then(placeBoard);
    setTimeout(placeBoard, 900); // after the hero reveal settles
  }

  // Street mode terminal: the same result, as a real PyMotoGP call
  const term = document.querySelector("[data-term-race]");
  if (term) {
    term.textContent = `>>> race = motogp.load(${data.season}, '${race.short}', 'race')\n>>> # podium: ${race.podium
      .map((p) => surname(p.rider))
      .join(", ")}`;
  }
});

// ===== Project clips: loop only while on screen (poster only for reduced motion) =====
const clips = document.querySelectorAll("video[data-autoplay]");
if (clips.length && !reduceMotion) {
  const clipObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
      });
    },
    { threshold: 0.35 }
  );
  clips.forEach((clip) => clipObserver.observe(clip));
}

// ===== Theme: street/race with garage-shutter transition =====
const rootEl = document.documentElement;
const modeToggle = document.getElementById("mode-toggle");
const shutter = document.getElementById("shutter");
const shutterText = document.getElementById("shutter-text");

const setToggleLabel = () => {
  modeToggle.textContent = rootEl.dataset.theme === "race" ? "STREET MODE" : "RACE MODE";
};
setToggleLabel();

const applyTheme = (theme) => {
  rootEl.dataset.theme = theme;
  localStorage.setItem("tr-theme", theme);
  setToggleLabel();
  document.dispatchEvent(new CustomEvent("tr-theme-change", { detail: { theme } }));
};

const panelSlide = document.getElementById("panel-slide");

// Header hint: shown until the visitor switches sides once, then gone for good
const modeHint = document.getElementById("mode-hint");
if (modeHint && localStorage.getItem("tr-hint-done")) modeHint.remove();
// ...and it steps aside once the visitor scrolls into the content
if (modeHint?.isConnected) {
  const hideHintOnScroll = () => modeHint.classList.toggle("is-away", window.scrollY > window.innerHeight * 0.35);
  window.addEventListener("scroll", hideHintOnScroll, { passive: true });
  hideHintOnScroll();
}

let switching = false;
const switchTheme = () => {
  if (switching) return;
  if (modeHint && modeHint.isConnected) {
    localStorage.setItem("tr-hint-done", "1");
    modeHint.remove();
  }
  const next = rootEl.dataset.theme === "race" ? "street" : "race";
  if (reduceMotion) { applyTheme(next); return; }
  switching = true;

  if (next === "race") {
    // entering race mode: the garage shutter rolls down
    shutterText.textContent = "ENTERING RACE MODE";
    shutter.classList.add("closed");
    shutter.addEventListener("transitionend", function onClose() {
      shutter.removeEventListener("transitionend", onClose);
      applyTheme(next);
      setTimeout(() => {
        shutter.classList.remove("closed");
        shutter.addEventListener("transitionend", function onOpen() {
          shutter.removeEventListener("transitionend", onOpen);
          switching = false;
        });
      }, 260);
    });
  } else {
    // entering street mode: a clean panel wipes across
    panelSlide.classList.add("animating", "cover");
    panelSlide.addEventListener("transitionend", function onCover() {
      panelSlide.removeEventListener("transitionend", onCover);
      applyTheme(next);
      setTimeout(() => {
        panelSlide.classList.remove("cover");
        panelSlide.classList.add("exit");
        panelSlide.addEventListener("transitionend", function onExit() {
          panelSlide.removeEventListener("transitionend", onExit);
          panelSlide.classList.remove("animating", "exit"); // snap home off-screen, no transition
          switching = false;
        });
      }, 220);
    });
  }
};

modeToggle.addEventListener("click", switchTheme);

// ===== Racing-line scroll spine =====
const spine = document.querySelector(".race-spine");
if (spine) {
  const progressEl = spine.querySelector(".spine-progress");
  const carEl = spine.querySelector(".spine-car");
  const readout = spine.querySelector(".spine-readout");
  const sectorLabels = {
    about: "S1 — About",
    projects: "S2 — The garage",
    skills: "S3 — The toolkit",
    experience: "S4 — Race history",
    contact: "S5 — Pit wall",
  };
  const markers = [];
  let scrollMax = 1;

  const layoutMarkers = () => {
    scrollMax = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    sections.forEach((sec, i) => {
      let m = markers[i];
      if (!m) {
        m = document.createElement("button");
        m.className = "spine-marker";
        m.type = "button";
        m.addEventListener("click", () => sec.scrollIntoView({ behavior: "smooth" }));
        spine.appendChild(m);
        markers[i] = m;
      }
      m.title = sectorLabels[sec.id] || sec.id;
      m.style.top = `${Math.min(sec.offsetTop / scrollMax, 1) * 100}%`;
    });
  };

  let spineTicking = false;
  const updateSpine = () => {
    spineTicking = false;
    const p = Math.min(window.scrollY / scrollMax, 1);
    progressEl.style.transform = `scaleY(${p})`;
    carEl.style.top = `${p * 100}%`;
    readout.textContent = `${String(Math.round(p * 100)).padStart(3, "0")}%`;
    markers.forEach((m) => m.classList.toggle("passed", parseFloat(m.style.top) <= p * 100 + 0.5));
  };
  const requestSpine = () => {
    if (!spineTicking) { spineTicking = true; requestAnimationFrame(updateSpine); }
  };

  layoutMarkers();
  updateSpine();
  window.addEventListener("scroll", requestSpine, { passive: true });
  window.addEventListener("resize", () => { layoutMarkers(); requestSpine(); });
  window.addEventListener("load", () => { layoutMarkers(); requestSpine(); });
}
