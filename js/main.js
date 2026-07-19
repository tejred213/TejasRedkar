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
