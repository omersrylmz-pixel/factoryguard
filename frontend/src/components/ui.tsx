import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Link } from "react-router";
import { bi, tx } from "../i18n";
import { ApiError } from "../services/api";
import type { AssetType, Criticality, RiskStatus, Role } from "../types/api";
import { CountUp, SpotlightCard } from "./reactBits";

/* ============================================================================
 * FactoryGuard — Endüstriyel OT Siber Güvenlik & Komuta Tasarım Sistemi
 * ============================================================================ */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  noPadding = false,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <section
      className={`rounded-[8px] border border-[#CBD5E1]/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-[#1E293B] dark:bg-[#111827] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-6 py-4 dark:border-[#1E293B]">
          <div>
            {title && (
              <h2 className="font-display flex items-center gap-2.5 text-sm font-bold tracking-tight text-[#1C2434]">
                <span className="inline-block h-3.5 w-1 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#06B6D4]" />
                <span>{title}</span>
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-[#64748B]">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={noPadding ? "" : "p-6"}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: string;
}) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-[8px] border border-[#CBD5E1] bg-white px-6 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] dark:border-[#1E293B] dark:bg-[#111827]">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#2563EB] via-[#0284C7] to-[#06B6D4]" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {breadcrumb && (
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
              <span>{tx("Genel Bakış", "Overview")}</span>
              <span>/</span>
              <span className="text-[#2563EB] dark:text-[#38BDF8]">{breadcrumb}</span>
              <span className="ml-2 inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {tx("SPAN TELEMETRİ · AKTİF", "SPAN TELEMETRY · LIVE")}
              </span>
            </div>
          )}
          <h1 className="font-display text-xl font-bold tracking-tight text-[#1C2434] sm:text-2xl">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-xs text-[#64748B]">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

export type Tone =
  | "teal"
  | "navy"
  | "amber"
  | "red"
  | "emerald"
  | "slate"
  | "mono"
  | "default"
  | "success"
  | "warning"
  | "danger";

const TONE_BADGE_CLASSES: Record<Tone, string> = {
  teal: "bg-sky-500/10 text-sky-700 border border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  navy: "bg-[#1E293B] text-white border border-[#334155]",
  amber:
    "bg-amber-500/10 text-amber-800 border border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  warning:
    "bg-amber-500/10 text-amber-800 border border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  red: "bg-rose-500/10 text-rose-700 border border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  danger:
    "bg-rose-500/10 text-rose-700 border border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  emerald:
    "bg-emerald-500/10 text-emerald-800 border border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  success:
    "bg-emerald-500/10 text-emerald-800 border border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  slate:
    "bg-slate-500/10 text-slate-700 border border-slate-500/25 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30",
  default:
    "bg-slate-500/10 text-slate-700 border border-slate-500/25 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30",
  mono:
    "bg-slate-500/10 text-[#1C2434] border border-slate-500/25 font-mono dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
};

const TONE_DOT_CLASSES: Record<Tone, string> = {
  teal: "bg-sky-500",
  navy: "bg-indigo-400",
  amber: "bg-amber-500",
  warning: "bg-amber-500",
  red: "bg-rose-500",
  danger: "bg-rose-500",
  emerald: "bg-emerald-500",
  success: "bg-emerald-500",
  slate: "bg-slate-400",
  default: "bg-slate-400",
  mono: "bg-sky-500",
};

const STAT_TOP_BAR_GRADIENT: Record<Tone, string> = {
  teal: "from-[#2563EB] via-[#0284C7] to-[#06B6D4]",
  navy: "from-[#4F46E5] via-[#3B82F6] to-[#38BDF8]",
  amber: "from-[#D97706] via-[#F59E0B] to-[#FBBF24]",
  warning: "from-[#D97706] via-[#F59E0B] to-[#FBBF24]",
  red: "from-[#E11D48] via-[#F43F5E] to-[#FB7185]",
  danger: "from-[#E11D48] via-[#F43F5E] to-[#FB7185]",
  emerald: "from-[#059669] via-[#10B981] to-[#34D399]",
  success: "from-[#059669] via-[#10B981] to-[#34D399]",
  slate: "from-[#475569] via-[#64748B] to-[#94A3B8]",
  default: "from-[#475569] via-[#64748B] to-[#94A3B8]",
  mono: "from-[#2563EB] to-[#06B6D4]",
};

const STAT_ICON_BOX: Record<Tone, string> = {
  teal: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  navy: "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  red: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  slate: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400",
  default: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400",
  mono: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

const STAT_SIGNAL_BAR: Record<Tone, string> = {
  teal: "bg-sky-500/80 dark:bg-sky-400/80",
  navy: "bg-indigo-500/80 dark:bg-indigo-400/80",
  amber: "bg-amber-500/80 dark:bg-amber-400/80",
  warning: "bg-amber-500/80 dark:bg-amber-400/80",
  red: "bg-rose-500/85 dark:bg-rose-400/85",
  danger: "bg-rose-500/85 dark:bg-rose-400/85",
  emerald: "bg-emerald-500/80 dark:bg-emerald-400/80",
  success: "bg-emerald-500/80 dark:bg-emerald-400/80",
  slate: "bg-slate-500/70 dark:bg-slate-400/70",
  default: "bg-slate-500/70 dark:bg-slate-400/70",
  mono: "bg-sky-500/80 dark:bg-sky-400/80",
};

export function StatCard({
  label,
  value,
  subtext,
  hint,
  icon,
  badge,
  badgeTone,
  tone,
  to,
}: {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode | { text: ReactNode; tone?: Tone };
  badgeTone?: Tone;
  tone?: Tone;
  to?: string;
}) {
  const isBadgeObj =
    badge !== null && typeof badge === "object" && "text" in (badge as Record<string, unknown>);
  const resolvedBadgeText = isBadgeObj
    ? (badge as { text: ReactNode; tone?: Tone }).text
    : (badge as ReactNode);
  const effectiveBadgeTone: Tone =
    (isBadgeObj ? (badge as { text: ReactNode; tone?: Tone }).tone : undefined) ??
    badgeTone ??
    tone ??
    "teal";
  const effectiveCardTone: Tone = tone ?? effectiveBadgeTone;
  const resolvedSubtext = subtext ?? hint;

  const animatedValue =
    typeof value === "number" ||
    (typeof value === "string" && /^\d+(\.\d+)?(\/100|%|\s*ms)?$/.test(value.trim())) ? (
      <CountUp value={value} />
    ) : (
      value
    );

  const signalBars = [34, 58, 44, 78, 62, 95, 72];

  const spotlightTone: "teal" | "navy" | "amber" | "red" | "emerald" | "slate" =
    effectiveCardTone === "warning"
      ? "amber"
      : effectiveCardTone === "danger"
        ? "red"
        : effectiveCardTone === "success"
          ? "emerald"
          : effectiveCardTone === "default" || effectiveCardTone === "mono"
            ? "teal"
            : effectiveCardTone;

  const inner = (
    <SpotlightCard
      tone={spotlightTone}
      className="group relative flex h-full flex-col justify-between rounded-[8px] border border-[#CBD5E1]/90 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3B82F6]/60 hover:shadow-[0_10px_24px_-8px_rgba(37,99,235,0.22)] dark:border-[#1E293B] dark:bg-[#111827] dark:hover:border-[#38BDF8]/50"
    >
      <div
        className={`mb-3.5 h-1 w-full rounded-full bg-gradient-to-r ${STAT_TOP_BAR_GRADIENT[effectiveCardTone]}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border ${STAT_ICON_BOX[effectiveCardTone]}`}
        >
          {icon ?? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          )}
        </div>
        {resolvedBadgeText && (
          <span
            className={`inline-flex items-center rounded-[5px] px-2.5 py-0.5 font-mono text-[11px] font-semibold ${TONE_BADGE_CLASSES[effectiveBadgeTone]}`}
          >
            {resolvedBadgeText}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-mono text-2xl font-bold tracking-tight text-[#1C2434]">
            {animatedValue}
          </div>
          <div
            className="mt-1 truncate text-xs font-semibold text-[#1C2434]"
            title={typeof label === "string" ? label : undefined}
          >
            {label}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="flex h-8 shrink-0 items-end gap-[3px] pb-0.5 opacity-80 transition-opacity group-hover:opacity-100"
        >
          {signalBars.map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%` }}
              className={`w-[3px] rounded-t-[1.5px] ${
                i >= 4
                  ? STAT_SIGNAL_BAR[effectiveCardTone]
                  : "bg-slate-300 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#E2E8F0] pt-2.5 text-[11px] text-[#64748B] dark:border-[#1E293B]">
        <span className="inline-flex items-center gap-1.5 truncate">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASSES[effectiveCardTone]}`} />
          <span className="truncate">{resolvedSubtext ?? "\u00A0"}</span>
        </span>
        {to && (
          <span className="ml-2 shrink-0 font-mono text-[10px] font-bold text-[#2563EB] opacity-0 transition-opacity group-hover:opacity-100 dark:text-[#38BDF8]">
            →
          </span>
        )}
      </div>
    </SpotlightCard>
  );
  return to ? (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/* ============================================================================
 * Taktil Mühendislik Butonları (Matte Precision Engineering Style)
 * ============================================================================ */

const BTN_VARIANTS = {
  primary:
    "border border-[#3B82F6]/80 bg-[#2563EB] text-white shadow-[0_1px_2px_rgba(15,23,42,0.2),inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-[#1D4ED8] hover:border-[#60A5FA] active:translate-y-[0.5px] dark:border-[#3B82F6]/70 dark:bg-[#2563EB] dark:hover:bg-[#3B82F6]",
  secondary:
    "border border-[#CBD5E1] bg-white text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-[#94A3B8] hover:bg-[#F8FAFC] active:translate-y-[0.5px] dark:border-[#2A364F] dark:bg-[#161F30] dark:text-[#E2E8F0] dark:hover:border-[#3B82F6]/60 dark:hover:bg-[#1E293B]",
  outline:
    "border border-[#3B82F6]/45 bg-[#EFF6FF] text-[#1D4ED8] shadow-[0_1px_2px_rgba(37,99,235,0.06)] hover:border-[#2563EB] hover:bg-[#DBEAFE]/70 active:translate-y-[0.5px] dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:border-sky-400 dark:hover:bg-sky-500/20",
  dark:
    "border border-[#334155] bg-[#0F172A] text-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] hover:bg-[#1E293B] active:translate-y-[0.5px] dark:border-[#334155] dark:bg-[#1E293B] dark:hover:bg-[#283548]",
  danger:
    "border border-rose-500/40 bg-rose-50 text-rose-700 hover:bg-rose-100 active:translate-y-[0.5px] dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25",
  ghost:
    "border border-transparent text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1C2434] dark:text-[#94A3B8] dark:hover:bg-[#1E293B] dark:hover:text-white",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BTN_VARIANTS;
  size?: "sm" | "md" | "lg";
}) {
  const sz =
    size === "sm"
      ? "px-2.5 py-1 text-xs"
      : size === "lg"
        ? "px-4 py-2.5 text-sm"
        : "px-3.5 py-2 text-xs";
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[6px] font-semibold tracking-[-0.01em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${BTN_VARIANTS[variant]} ${sz} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const el = (
    <input
      className={`h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs text-[#1C2434] placeholder:text-[#64748B] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none dark:border-[#2A364F] dark:bg-[#161F30] dark:text-[#F8FAFC] dark:focus:border-[#38BDF8] ${className}`}
      {...rest}
    />
  );
  if (!label) return el;
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#1C2434]">{label}</span>
      {el}
    </label>
  );
}

/* ============================================================================
 * Özel Temalı Popover Açılır Menü (Custom Themed Select Dropdown)
 * Siyah-beyaz ham işletim sistemi penceresi yerine koyu/açık komuta temalı menü açar.
 * ============================================================================ */

interface ParsedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

function extractOptions(children: ReactNode): ParsedOption[] {
  const list: ParsedOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{
      value?: string | number;
      disabled?: boolean;
      children?: ReactNode;
    }>;
    if (el.type === "option") {
      list.push({
        value: String(el.props.value ?? ""),
        label: el.props.children,
        disabled: Boolean(el.props.disabled),
      });
    }
  });
  return list;
}

export function Select({
  label,
  className = "",
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const options = extractOptions(children);
  const [open, setOpen] = useState(false);
  const [internalVal, setInternalVal] = useState(
    String(value ?? defaultValue ?? options[0]?.value ?? ""),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const currentVal = value !== undefined ? String(value) : internalVal;
  const activeOption = options.find((o) => o.value === currentVal) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  function handleSelect(nextValue: string) {
    setInternalVal(nextValue);
    setOpen(false);
    if (onChange) {
      const syntheticEvent = {
        target: { value: nextValue },
        currentTarget: { value: nextValue },
      } as unknown as ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  }

  const dropdownEl = (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-[6px] border px-3 py-1.5 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? "border-[#2563EB] bg-white text-[#0F172A] ring-2 ring-[#2563EB]/20 dark:border-[#38BDF8] dark:bg-[#161F30] dark:text-[#F8FAFC]"
            : "border-[#CBD5E1] bg-white text-[#0F172A] hover:border-[#94A3B8] dark:border-[#2A364F] dark:bg-[#161F30] dark:text-[#E2E8F0] dark:hover:border-[#3B82F6]/60"
        }`}
      >
        <span className="truncate">{activeOption?.label ?? currentVal}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-[#64748B] transition-transform duration-150 dark:text-[#94A3B8] ${
            open ? "rotate-180 text-[#2563EB] dark:text-[#38BDF8]" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 left-0 z-50 mt-1.5 max-h-64 min-w-[200px] overflow-y-auto rounded-[8px] border border-[#CBD5E1] bg-white p-1 shadow-[0_12px_32px_rgba(15,23,42,0.16)] dark:border-[#2A364F] dark:bg-[#0F172A] dark:shadow-[0_16px_40px_rgba(0,0,0,0.75)]"
        >
          {options.map((opt) => {
            const isSelected = opt.value === currentVal;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onClick={() => handleSelect(opt.value)}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-[5px] px-2.5 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected
                    ? "bg-[#2563EB]/12 font-semibold text-[#1D4ED8] dark:bg-[#2563EB]/25 dark:text-[#38BDF8]"
                    : "text-[#1E293B] hover:bg-[#F1F5F9] dark:text-[#E2E8F0] dark:hover:bg-[#1E293B]"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-[#2563EB] dark:text-[#38BDF8]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!label) return dropdownEl;
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-semibold text-[#1C2434]">{label}</span>
      {dropdownEl}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-semibold text-[#1C2434]">{label}</span>
      {children}
    </div>
  );
}

export function Badge({
  children,
  variant,
  tone,
  dot = false,
  className = "",
}: {
  children: ReactNode;
  variant?: Tone;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  const effectiveTone: Tone = tone ?? variant ?? "slate";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${TONE_BADGE_CLASSES[effectiveTone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT_CLASSES[effectiveTone]}`} />}
      {children}
    </span>
  );
}

export function ProtocolBadge({
  protocol,
  confidence,
}: {
  protocol: string;
  confidence?: "observed" | "port_hint" | "unknown" | "none";
}) {
  const clean = protocol.replace(/\?+$/, "").toUpperCase();
  const isHint = confidence === "port_hint" || protocol.endsWith("?");
  return (
    <span
      title={
        isHint
          ? tx(
              `${clean} — Port numarasına dayalı olası protokol tahmini`,
              `${clean} — Port-based protocol inference`,
            )
          : tx(
              `${clean} — Pasif paket analiziyle doğrulandı`,
              `${clean} — Verified via passive deep packet inspection`,
            )
      }
      className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 font-mono text-[11px] font-semibold ${
        isHint
          ? "border border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : "border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
      }`}
    >
      <span>{clean}</span>
      {isHint && (
        <span className="font-sans text-[10px] font-normal text-amber-700 dark:text-amber-400">
          {tx("(port tahmini)", "(port hint)")}
        </span>
      )}
    </span>
  );
}

export const CRITICALITY_LABEL: Record<Criticality, string> = bi({
  low: ["Düşük", "Low"],
  medium: ["Orta", "Medium"],
  high: ["Yüksek", "High"],
  critical: ["Kritik", "Critical"],
});

export function CriticalityBadge({ value }: { value: Criticality }) {
  const map: Record<Criticality, Tone> = {
    low: "slate",
    medium: "amber",
    high: "amber",
    critical: "red",
  };
  return (
    <Badge variant={map[value]} dot>
      {CRITICALITY_LABEL[value] ?? value}
    </Badge>
  );
}

export const STATUS_LABEL: Record<RiskStatus, string> = bi({
  open: ["Açık", "Open"],
  investigating: ["İnceleniyor", "Investigating"],
  accepted: ["Risk Kabul Edildi", "Risk Accepted"],
  resolved: ["Çözüldü", "Resolved"],
  false_positive: ["Yanlış Pozitif", "False Positive"],
});

export function StatusBadge({ value }: { value: RiskStatus }) {
  const map: Record<RiskStatus, Tone> = {
    open: "red",
    investigating: "amber",
    accepted: "slate",
    resolved: "emerald",
    false_positive: "slate",
  };
  return (
    <Badge variant={map[value]} dot>
      {STATUS_LABEL[value] ?? value}
    </Badge>
  );
}

export const ASSET_TYPE_LABEL: Record<AssetType, string> = bi({
  plc: ["PLC Kontrolcü", "PLC Controller"],
  hmi: ["Operatör Paneli (HMI)", "Operator Panel (HMI)"],
  scada_server: ["SCADA Sunucusu", "SCADA Server"],
  engineering_workstation: ["Mühendislik İstasyonu", "Engineering Workstation"],
  industrial_pc: ["Endüstriyel PC", "Industrial PC"],
  network_device: ["Endüstriyel Ağ Cihazı", "Industrial Network Device"],
  server: ["Endüstriyel Sunucu", "Industrial Server"],
  computer: ["İstemci / İş İstasyonu", "Client / Workstation"],
  unknown_device: ["Sınıflandırılmamış Cihaz", "Unclassified Device"],
});

export const ROLE_LABEL: Record<Role, string> = bi({
  owner: ["Sahip", "Owner"],
  admin: ["Yönetici", "Administrator"],
  analyst: ["OT Güvenlik Analisti", "OT Security Analyst"],
  viewer: ["Gözlemci", "Viewer"],
});

const AUDIT_ACTION_LABEL: Record<string, string> = bi({
  "sensor.enrolled": ["Sensör Kaydedildi", "Sensor Enrolled"],
  "sensor.ingest": ["Pasif Keşif Paketi Alındı", "Passive Discovery Ingested"],
  "sensor.upload_analyzed": ["PCAP / Zeek Dosyası Analiz Edildi", "PCAP / Zeek File Analyzed"],
  "site.created": ["Fabrika Oluşturuldu", "Site Created"],
  "zone.created": ["Ağ Bölgesi Oluşturuldu", "Network Zone Created"],
  "asset.updated": ["Cihaz Kaydı Güncellendi", "Asset Record Updated"],
  "asset.bulk_updated": ["Toplu Cihaz Doğrulaması", "Bulk Asset Verification"],
  "communication.baseline_approved": ["İletişim Baseline Onaylandı", "Flow Baseline Approved"],
  "communication.baseline_approved_all": ["Tüm İletişim Baseline Onaylandı", "All Flows Baseline Approved"],
  "risk.status_changed": ["Risk Durumu Değiştirildi", "Risk Status Changed"],
  "risk.bulk_status_changed": ["Toplu Risk Durumu Güncellendi", "Bulk Risk Status Updated"],
  "organization.created": ["Organizasyon Oluşturuldu", "Organization Created"],
  "organization.member_added": ["Yeni Üye Eklendi", "New Member Added"],
  "organization.member_updated": ["Üye Yetkisi Güncellendi", "Member Role Updated"],
});

const AUDIT_TARGET_LABEL: Record<string, string> = bi({
  sensor: ["Sensör", "Sensor"],
  discovery_run: ["Keşif Çalışması", "Discovery Run"],
  site: ["Fabrika", "Site"],
  zone: ["Ağ Bölgesi", "Network Zone"],
  asset: ["Cihaz", "Asset"],
  communication: ["İletişim Akışı", "Communication Flow"],
  risk_finding: ["Risk Bulgusu", "Risk Finding"],
  organization: ["Organizasyon", "Organization"],
  user: ["Kullanıcı", "User"],
});

export function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

export function formatAuditTarget(targetType: string | null): string {
  if (!targetType) return "—";
  return AUDIT_TARGET_LABEL[targetType] ?? targetType;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg =
    error instanceof ApiError
      ? `${error.message} (HTTP ${error.status})`
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    <div className="rounded-[6px] border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
      {msg}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[6px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-8 text-center text-xs text-[#64748B] dark:border-[#1E293B] dark:bg-[#161F30]">
      {children}
    </div>
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/* ============================================================================
 * Sağdan Kayarak Açılan İnceleme Çekmecesi (shadcn Sheet / Slide-Over Drawer)
 * Tablo veya topoloji bağlamını kaybetmeden cihaz/risk detayını sağ panelde açar.
 * ============================================================================ */
export function SlideOverDrawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  footer,
  children,
  widthClass = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  widthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-[2px] transition-opacity"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`relative flex h-full w-full ${widthClass} flex-col border-l border-[#CBD5E1] bg-white shadow-[0_0_50px_rgba(0,0,0,0.45)] dark:border-[#1E293B] dark:bg-[#0B0F19]`}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#2563EB] via-[#0284C7] to-[#10B981]" />
        <header className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4 dark:border-[#1E293B] dark:bg-[#111827]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display truncate text-base font-bold text-[#1C2434]">
                {title}
              </h2>
              {badge}
            </div>
            {subtitle && <p className="mt-0.5 text-xs text-[#64748B]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx("Çekmeceyi kapat", "Close drawer")}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-[#CBD5E1] bg-white text-xs font-bold text-[#64748B] transition hover:border-rose-500/50 hover:text-rose-500 dark:border-[#2A364F] dark:bg-[#161F30] dark:text-[#94A3B8]"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-3.5 dark:border-[#1E293B] dark:bg-[#111827]">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

