import React, { useEffect, useRef, useState } from "react";
import { Mic, PhoneIncoming, CalendarCheck } from "lucide-react";

const EXCHANGES = [
  { caller: "Hi, I'd like to book an appointment.", agent: "Of course. Does Thursday at 10:30 work?" },
  { caller: "What are your opening hours?", agent: "We're open 9 to 6, Monday to Saturday." },
  { caller: "Can someone call me back today?", agent: "Done. I've scheduled a callback for 4 PM." },
];

const CAPABILITIES = [
  { icon: PhoneIncoming, label: "Answers every call" },
  { icon: Mic, label: "Understands and speaks" },
  { icon: CalendarCheck, label: "Books and qualifies" },
];

const ROWS = [
  { amp: 92, f1: 0.011, f2: 0.027, s1: 0.9, s2: 0.6, ph: 0.0, size: 2.1, alpha: 1 },
  { amp: 74, f1: 0.011, f2: 0.027, s1: 0.9, s2: 0.6, ph: 0.35, size: 1.9, alpha: 0.85 },
  { amp: 56, f1: 0.011, f2: 0.027, s1: 0.9, s2: 0.6, ph: 0.7, size: 1.8, alpha: 0.7 },
  { amp: 36, f1: 0.011, f2: 0.027, s1: 0.9, s2: 0.6, ph: 1.05, size: 1.7, alpha: 0.55 },
  { amp: 112, f1: 0.011, f2: 0.027, s1: 0.9, s2: 0.6, ph: -0.35, size: 1.5, alpha: 0.4 },
  { amp: 18, f1: 0.011, f2: 0.027, s1: 0.9, s2: 0.6, ph: 1.4, size: 1.5, alpha: 0.35 },
  { amp: 132, f1: 0.011, f2: 0.027, s1: 0.9, s2: 0.6, ph: -0.7, size: 1.3, alpha: 0.25 },
];
const SPACING = 9;

interface Ripple {
  x: number;
  y: number;
  t0: number;
}

export const ProductExperiencePanel: React.FC = () => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [touched, setTouched] = useState(false);
  const [exIdx, setExIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setExIdx((i) => (i + 1) % EXCHANGES.length), 5200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    const ripples: Ripple[] = [];
    const mouse = { x: 0, y: 0, tx: 0, ty: 0, hover: 0, target: 0 };
    let surge = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);

      mouse.x += (mouse.tx - mouse.x) * 0.14;
      mouse.y += (mouse.ty - mouse.y) * 0.14;
      mouse.hover += (mouse.target - mouse.hover) * 0.08;
      surge *= 0.965;
      while (ripples.length && (now - ripples[0].t0) / 1000 > 3.2) ripples.shift();

      const cy = h * 0.46;
      const cols = Math.floor(w / SPACING) + 1;
      const idle = 0.85 + 0.15 * Math.sin(t * 1.3);

      for (let r = 0; r < ROWS.length; r++) {
        const row = ROWS[r];
        for (let i = 0; i < cols; i++) {
          const x = i * SPACING;
          const nx = x / w;
          const env = Math.pow(Math.sin(Math.PI * nx), 1.2);

          const wave =
            Math.sin(x * row.f1 + t * row.s1 + row.ph * 3) * 0.6 +
            Math.sin(x * row.f2 - t * row.s2 + row.ph * 5) * 0.4;

          const dxm = x - mouse.x;
          let y0 = cy + row.amp * env * wave * idle;
          const dym = mouse.y - y0;
          const near = Math.exp(-(dxm * dxm + dym * dym) / (2 * 140 * 140)) * mouse.hover;

          const amp = 1 + near * 1.5 + surge * 0.7;
          let y = cy + row.amp * env * wave * idle * amp;
          y += (mouse.y - y) * 0.16 * near;

          let glow = 0;
          for (let k = 0; k < ripples.length; k++) {
            const rp = ripples[k];
            const age = (now - rp.t0) / 1000;
            const d = Math.hypot(x - rp.x, y - rp.y);
            const delta = d - age * 420;
            if (delta > -90 && delta < 90) {
              const p = Math.exp(-((delta / 38) * (delta / 38))) * Math.exp(-age * 1.1);
              y += Math.sin(delta * 0.12) * 26 * p;
              glow = Math.max(glow, p);
            }
          }

          const radius = row.size * (1 + near * 0.9 + glow * 1.1);
          const base = (0.25 + 0.75 * env) * row.alpha;
          const a = Math.min(1, base + near * 0.5 + glow * 0.7);
          const mix = Math.min(1, near * 0.9 + glow);
          const k = 0.9 * env;
          const rC = Math.round(79 + (103 - 79) * k + (255 - 79) * mix * 0.7);
          const gC = Math.round(70 + (232 - 70) * k + (255 - 70) * mix * 0.7);
          const bC = Math.round(229 + (249 - 229) * k + (255 - 229) * mix * 0.7);

          ctx.fillStyle = `rgba(${Math.min(rC, 255)},${Math.min(gC, 255)},${Math.min(bC, 255)},${a})`;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    const local = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (mouse.target === 0) {
        mouse.x = p.x;
        mouse.y = p.y;
      }
      mouse.tx = p.x;
      mouse.ty = p.y;
      mouse.target = 1;
    };
    const onLeave = () => {
      mouse.target = 0;
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      ripples.push({ x: p.x, y: p.y, t0: performance.now() });
      surge = 1;
      setTouched(true);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    wrap.addEventListener("pointerdown", onDown);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full h-full overflow-hidden bg-[#070b1d] text-white cursor-pointer select-none">
      {/* Corner glows mirror the blue and cyan glows on the sign-in side */}
      <div className="absolute -top-40 -right-32 w-[520px] h-[520px] rounded-full bg-[var(--color-primary-light)] blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-48 -left-24 w-[480px] h-[480px] rounded-full bg-cyan-500/15 blur-[130px] pointer-events-none" />

      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Soft vignette so text stays readable */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(7,11,29,0.78)_100%)]" />

      {/* Seam between the two sections */}
      <div className="absolute inset-y-0 left-0 w-px pointer-events-none bg-gradient-to-b from-transparent via-blue-400/60 to-transparent" />

      <div className="absolute top-10 left-12 xl:left-16 pointer-events-none text-[11px] font-medium tracking-[0.32em] uppercase text-cyan-200/80">
        Real-Time Spoken AI
      </div>

      {/* Sample exchange: what callers say, what the agent answers */}
      <div
        key={exIdx}
        className="absolute top-[17%] right-12 xl:right-16 w-[300px] pointer-events-none space-y-2.5"
        style={{ animation: "pep-in .6s cubic-bezier(.2,.7,.2,1) both" }}
      >
        <style>{`@keyframes pep-in { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }`}</style>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 w-7 h-7 shrink-0 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
            <Mic className="w-3.5 h-3.5 text-blue-100" />
          </span>
          <div className="rounded-2xl rounded-tl-md bg-white/[0.07] border border-white/10 backdrop-blur px-3.5 py-2 text-[13px] text-slate-200">
            {EXCHANGES[exIdx].caller}
          </div>
        </div>
        <div className="flex items-start gap-2.5 justify-end">
          <div className="rounded-2xl rounded-tr-md bg-[var(--color-primary)] border border-white/20 px-3.5 py-2 text-[13px] text-white">
            {EXCHANGES[exIdx].agent}
          </div>
        </div>
      </div>

      <div className="absolute bottom-12 left-12 xl:left-16 right-12 pointer-events-none">
        <h2 className="text-3xl xl:text-4xl font-semibold tracking-tight leading-[1.12] text-slate-50">
          Every call answered.
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-cyan-300 bg-clip-text text-transparent">
            Every lead qualified.
          </span>
        </h2>
        <p className="mt-4 text-sm text-blue-200/50 max-w-sm">
          Voice agents that listen, reason and respond in real time.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2.5">
          {CAPABILITIES.map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-2 text-xs text-blue-100/70">
              <span className="w-6 h-6 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
                <Icon className="w-3 h-3 text-cyan-300" />
              </span>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div
        className={`absolute bottom-12 right-12 xl:right-16 pointer-events-none text-[11px] tracking-[0.2em] uppercase text-blue-200/30 transition-opacity duration-700 ${
          touched ? "opacity-0" : "opacity-100"
        }`}
      >
        Touch the wave
      </div>
    </div>
  );
};
