import { flushSync } from "react-dom";

export type ThemeOrigin = { x: number; y: number; start?: number };

const DURATION_MS = 720;

export function originFromElement(el: EventTarget | null): ThemeOrigin {
  if (el instanceof Element) {
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      start: Math.hypot(r.width, r.height) / 2,
    };
  }
  return { x: 0, y: window.innerHeight, start: 0 };
}

function paintTheme(next: string) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(next);
}

/** Percent of the viewport so clip-path maps to the VT snapshot box in Chrome. */
export function themeCircle(origin: ThemeOrigin, vw: number, vh: number) {
  const x = origin.x;
  const y = origin.y;
  const hypot = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
  return {
    xPct: (x / vw) * 100,
    yPct: (y / vh) * 100,
    start: origin.start ?? 0,
    end: hypot * 2.5,
  };
}

/** Circle centered on the toggle, expanding until it covers the screen. */
export function applyThemeTransition(
  next: string,
  setTheme: (theme: string) => void,
  origin?: ThemeOrigin,
) {
  const commit = () => {
    paintTheme(next);
    flushSync(() => setTheme(next));
  };

  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    typeof document.startViewTransition !== "function"
  ) {
    commit();
    return;
  }

  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = document.documentElement.clientHeight || window.innerHeight;
  const { xPct, yPct, start, end } = themeCircle(
    origin ?? { x: 0, y: vh, start: 0 },
    vw,
    vh,
  );

  document.getElementById("mistri-theme-reveal")?.remove();
  const sheet = document.createElement("style");
  sheet.id = "mistri-theme-reveal";
  sheet.textContent = `
    ::view-transition-group(root) { animation: none; }
    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation: none;
      mix-blend-mode: normal;
      display: block;
    }
    html::view-transition-new(root) {
      animation: mistri-theme-circle ${DURATION_MS}ms cubic-bezier(0.25, 0.5, 0.75, 1) both;
      z-index: 2;
      will-change: clip-path;
      transform: translateZ(0);
    }
    ::view-transition-old(root) { z-index: 1; }
    @keyframes mistri-theme-circle {
      from { clip-path: circle(${start}px at ${xPct}% ${yPct}%); }
      to { clip-path: circle(${end}px at ${xPct}% ${yPct}%); }
    }
  `;
  document.head.appendChild(sheet);

  const vt = document.startViewTransition(commit);
  void vt.finished.finally(() => {
    requestAnimationFrame(() => sheet.remove());
  });
}
