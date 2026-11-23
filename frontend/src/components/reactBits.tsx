import gsap from "gsap";
import Lenis from "lenis";
import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * React Bits + GSAP + Lenis Endüstriyel UI Bileşen Koleksiyonu:
 * 1. SpotlightCard — Fare hareketini takip eden radyal ışık yansıması ve parlak kenarlık (React Bits SpotlightCard)
 * 2. CountUp — GSAP tabanlı akıcı sayısal telemetri sayacı (`12`, `65/100`, `%90` vb. değerleri destekler)
 * 3. DecryptedText — IP, MAC, seri no ve SHA-256 parmak izleri için siber-kripto karakter çözülme efekti
 * 4. InteractiveDotGrid — Giriş, Topoloji ve Cihaz Şasisi için fareye duyarlı teknik siber güvenlik ızgarası
 * 5. StaggerStage — Sayfa geçişlerinde kartların GSAP timeline ile kademeli (stagger) sahneye girişi
 * 6. useLenisSmoothScroll — Ana içerik alanı için Lenis pürüzsüz kaydırma (buttery smooth scroll)
 */

const SPOTLIGHT_COLORS: Record<
  "teal" | "emerald" | "amber" | "red" | "navy" | "slate",
  string
> = {
  teal: "rgba(13, 148, 136, 0.14)",
  emerald: "rgba(16, 185, 129, 0.14)",
  amber: "rgba(245, 158, 11, 0.15)",
  red: "rgba(225, 29, 72, 0.15)",
  navy: "rgba(30, 41, 59, 0.12)",
  slate: "rgba(100, 116, 139, 0.12)",
};

/** React Bits SpotlightCard: Fareyi takip eden radyal spot ışığı */
export function SpotlightCard({
  children,
  tone = "teal",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "teal" | "emerald" | "amber" | "red" | "navy" | "slate";
  children: ReactNode;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={`relative overflow-hidden ${className}`}
      {...props}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(380px circle at ${pos.x}px ${pos.y}px, ${SPOTLIGHT_COLORS[tone]}, transparent 75%)`,
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

/**
 * React Bits + GSAP CountUp:
 * `12`, `28`, `65/100`, `0/100`, `%90` gibi sayısal veya ön/son ekli metrikleri
 * GSAP ile 0'dan hedef değere akıcı şekilde saydırır.
 */
export function CountUp({ value }: { value: ReactNode }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const rawStr = typeof value === "number" ? String(value) : typeof value === "string" ? value : null;

  useEffect(() => {
    if (!rawStr || !spanRef.current) return;
    // Ön ek (ör. "%"), ana tam sayı ve son ek (ör. "/100") ayrıştır
    const match = rawStr.match(/^([^0-9]*)(\d+)(.*)$/);
    if (!match) return;

    const [, prefix, numPart, suffix] = match;
    const target = Number(numPart);
    if (!Number.isFinite(target)) return;

    const state = { current: 0 };
    const tween = gsap.to(state, {
      current: target,
      duration: 0.65,
      ease: "power2.out",
      onUpdate: () => {
        if (spanRef.current) {
          spanRef.current.textContent = `${prefix}${Math.round(state.current)}${suffix}`;
        }
      },
    });

    return () => {
      tween.kill();
    };
  }, [rawStr]);

  if (!rawStr || !/^[^0-9]*\d+.*$/.test(rawStr)) {
    return <>{value}</>;
  }

  return <span ref={spanRef}>{rawStr}</span>;
}

const CIPHER_CHARS = "0123456789ABCDEF";

/**
 * React Bits DecryptedText:
 * IP, MAC, Seri No ve SHA-256 değerlerini kısa bir siber-kripto karakter çözülme
 * animasyonuyla ekrana getirir (üzerine gelindiğinde tekrar tetiklenebilir).
 */
export function DecryptedText({
  text,
  className = "",
  replayOnHover = true,
}: {
  text: string;
  className?: string;
  replayOnHover?: boolean;
}) {
  const [display, setDisplay] = useState(text);
  const timerRef = useRef<number | null>(null);

  function runScramble() {
    if (!text || text === "—") {
      setDisplay(text);
      return;
    }
    if (timerRef.current) window.clearInterval(timerRef.current);
    let step = 0;
    const totalSteps = 8;

    timerRef.current = window.setInterval(() => {
      step += 1;
      if (step >= totalSteps) {
        setDisplay(text);
        if (timerRef.current) window.clearInterval(timerRef.current);
        return;
      }
      const progress = step / totalSteps;
      const lockedCount = Math.floor(text.length * progress);
      const next = text
        .split("")
        .map((ch, idx) => {
          if (idx < lockedCount || ch === "." || ch === ":" || ch === "-" || ch === " ") {
            return ch;
          }
          return CIPHER_CHARS[(idx + step * 3) % CIPHER_CHARS.length];
        })
        .join("");
      setDisplay(next);
    }, 28);
  }

  useEffect(() => {
    runScramble();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [text]);

  return (
    <span
      onMouseEnter={replayOnHover ? runScramble : undefined}
      className={className}
    >
      {display}
    </span>
  );
}

/**
 * GSAP StaggerStage:
 * Sayfa veya dil değiştiğinde (`stageKey`) altındaki bölümleri yukarıdan aşağıya
 * kademeli (staggered) ve pürüzsüz bir geçişle sahneye alır.
 */
export function StaggerStage({
  stageKey,
  children,
}: {
  stageKey: string;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const targets = el.querySelectorAll(":scope > div > *");
    if (targets.length === 0) return;

    const tween = gsap.fromTo(
      targets,
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: 0.36,
        stagger: 0.045,
        ease: "power2.out",
        clearProps: "transform,opacity",
      },
    );

    return () => {
      tween.kill();
    };
  }, [stageKey]);

  return <div ref={containerRef}>{children}</div>;
}

/**
 * React Bits InteractiveDotGrid:
 * Giriş ekranı ve koyu donanım şasisi için fareyi takip eden siber güvenlik nokta ızgarası.
 */
export function InteractiveDotGrid({
  className = "",
  dotColor = "rgba(20, 184, 166, 0.22)",
}: {
  className?: string;
  dotColor?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        backgroundImage: `radial-gradient(${dotColor} 1.25px, transparent 1.25px)`,
        backgroundSize: "18px 18px",
      }}
    />
  );
}

/**
 * Lenis Smooth Scroll Hook:
 * `<main>` kaydırma kapsayıcısına Lenis pürüzsüz kaydırma davranışını bağlar.
 */
export function useLenisSmoothScroll(wrapperRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const content = wrapper.firstElementChild as HTMLElement | null;
    if (!content) return;

    const lenis = new Lenis({
      wrapper,
      content,
      lerp: 0.14,
      smoothWheel: true,
    });

    let rafId = 0;
    function raf(time: number) {
      lenis.raf(time);
      rafId = window.requestAnimationFrame(raf);
    }
    rafId = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [wrapperRef]);
}
