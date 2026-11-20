import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { Link } from "react-router";
import type { Criticality } from "../types/api";

/**
 * TailAdmin + shadcn/ui tasarım sistemi bileşenleri.
 * Renk yönelimi:
 * - Koyu Lacivert Kenar Çubuğu: #1C2434
 * - İçerik Zemin: #F1F5F9 / Kartlar: #FFFFFF (Border: #E2E8F0)
 * - Birincil Vurgu (Teal): #0D9488 (teal-600) / #0F766E (teal-700)
 * - Anlamlı Risk Durumları: Amber (Orta/Doğrulanmamış), Orange (Yüksek), Red/Rose (Kritik)
 */

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "dark";
  size?: "sm" | "md" | "lg";
}) {
  const variantStyles = {
    primary:
      "bg-[#0D9488] text-white shadow-2xs hover:bg-[#0F766E] focus-visible:ring-2 focus-visible:ring-[#0D9488]/30 disabled:bg-teal-300",
    secondary:
      "border border-[#E2E8F0] bg-white text-[#1C2434] shadow-2xs hover:bg-[#F8FAFC] hover:text-[#0D9488] disabled:text-slate-400",
    outline:
      "border border-[#0D9488] bg-transparent text-[#0D9488] hover:bg-teal-50/70 disabled:border-slate-200 disabled:text-slate-400",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-[#1C2434]",
    danger:
      "border border-red-200 bg-red-50/60 text-red-700 hover:bg-red-100 disabled:text-red-300",
    dark: "bg-[#1C2434] text-white hover:bg-[#2E3A52] disabled:bg-slate-400",
  }[variant];

  const sizeStyles = {
    sm: "h-7 px-2.5 text-xs gap-1.5",
    md: "h-9 px-3.5 text-xs gap-2",
    lg: "h-10 px-4 text-sm gap-2",
  }[size];

  return (
    <button
      className={`inline-flex items-center justify-center rounded-[4px] font-medium transition-colors disabled:cursor-not-allowed ${variantStyles} ${sizeStyles} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-9 w-full rounded-[4px] border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs text-[#1C2434] placeholder:text-slate-400 focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/15 focus:outline-none disabled:bg-slate-100 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-9 w-full rounded-[4px] border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs text-[#1C2434] focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/15 focus:outline-none disabled:bg-slate-100 ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-[#1C2434]">{label}</span>
      {children}
    </label>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  noPadding = false,
  className = "",
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  noPadding?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-[4px] border border-[#E2E8F0] bg-white shadow-[0px_8px_13px_-3px_rgba(0,0,0,0.05)] ${className}`}
    >
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-[#1C2434]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#64748B]">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </section>
  );
}

/** TailAdmin imza KPI / Metrik Kartı */
export function StatCard({
  label,
  value,
  subtext,
  hint,
  badge,
  badgeTone = "teal",
  icon,
  to,
}: {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  hint?: ReactNode;
  tone?: "teal" | "navy" | "emerald" | "amber" | "red" | "slate";
  badge?: string | { text: string; tone?: "teal" | "amber" | "red" | "slate" | "emerald" };
  badgeTone?: "teal" | "amber" | "red" | "slate" | "emerald";
  icon: ReactNode;
  to?: string;
}) {
  const badgeText = typeof badge === "object" && badge !== null ? badge.text : badge;
  const effectiveTone =
    typeof badge === "object" && badge !== null ? (badge.tone ?? badgeTone) : badgeTone;

  const toneMap = {
    teal: "bg-teal-50 text-[#0D9488] border-teal-200/70",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
    amber: "bg-amber-50 text-amber-800 border-amber-200/70",
    red: "bg-red-50 text-red-700 border-red-200/70",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  }[effectiveTone];

  const displaySub = subtext ?? hint;

  const inner = (
    <div className="rounded-[4px] border border-[#E2E8F0] bg-white px-5 py-4 shadow-[0px_8px_13px_-3px_rgba(0,0,0,0.05)] transition hover:border-teal-600/40">
      <div className="flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F1F5F9] text-[#0D9488]">
          {icon}
        </div>
        {badgeText && (
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${toneMap}`}>
            {badgeText}
          </span>
        )}
      </div>
      <div className="mt-3.5 flex items-end justify-between gap-2">
        <div>
          <h4 className="text-2xl font-bold tracking-tight text-[#1C2434]">{value}</h4>
          <span className="mt-0.5 block text-xs font-medium text-[#64748B]">{label}</span>
        </div>
        {displaySub && <div className="text-right text-[11px] text-[#64748B]">{displaySub}</div>}
      </div>
    </div>
  );

  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

export function Badge({
  variant = "default",
  tone,
  dot = false,
  children,
  className = "",
}: {
  variant?: "default" | "teal" | "success" | "warning" | "danger" | "outline" | "mono";
  tone?: "teal" | "emerald" | "amber" | "red" | "slate" | "navy";
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const toneToVariant = {
    teal: "teal",
    emerald: "success",
    amber: "warning",
    red: "danger",
    slate: "default",
    navy: "mono",
  } as const;

  const effectiveVariant = tone ? toneToVariant[tone] : variant;

  const styles = {
    default: "bg-slate-100 text-slate-700 border-slate-200",
    teal: "bg-teal-50 text-[#0F766E] border-teal-200/80",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    warning: "bg-amber-50 text-amber-800 border-amber-200/80",
    danger: "bg-red-50 text-red-700 border-red-200/80",
    outline: "bg-white text-slate-700 border-[#E2E8F0]",
    mono: "bg-[#F1F5F9] text-[#1C2434] border-[#E2E8F0] font-mono",
  }[effectiveVariant];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[3px] border px-2 py-0.5 text-[11px] font-medium ${styles} ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-[4px] border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800">
      {msg}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-xs text-[#64748B]">{children}</p>;
}

/** TailAdmin Sayfa Başlığı + Breadcrumb */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#1C2434]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-[#64748B]">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {breadcrumb && (
          <nav className="hidden items-center gap-1.5 text-xs font-medium text-[#64748B] sm:flex">
            <Link to="/" className="hover:text-[#0D9488]">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-[#0D9488]">{breadcrumb}</span>
          </nav>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export const CRITICALITY_LABEL: Record<Criticality, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  critical: "Kritik",
};

export function CriticalityBadge({ value }: { value: Criticality }) {
  const style = {
    low: "border-slate-200 bg-slate-100 text-slate-700",
    medium: "border-amber-200 bg-amber-50 text-amber-800",
    high: "border-orange-200 bg-orange-50 text-orange-800",
    critical: "border-red-200 bg-red-50 text-red-700",
  }[value];
  return (
    <span className={`inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[11px] font-semibold ${style}`}>
      {CRITICALITY_LABEL[value]}
    </span>
  );
}

export function ProtocolBadge({ protocol, confidence }: { protocol: string; confidence?: string }) {
  const isHint = confidence === "port_hint" || protocol.endsWith("?");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
        isHint
          ? "border-amber-200 bg-amber-50/70 text-amber-800"
          : "border-teal-200/80 bg-teal-50/80 text-[#0F766E]"
      }`}
    >
      {protocol}
      {isHint && <span className="font-sans text-[9px] font-normal">(port)</span>}
    </span>
  );
}

export const ROLE_LABEL: Record<string, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  analyst: "Analist",
  viewer: "İzleyici",
};

export const ASSET_TYPE_LABEL: Record<string, string> = {
  plc: "PLC / Kontrolcü",
  hmi: "HMI Paneli",
  scada_server: "SCADA Sunucusu",
  industrial_pc: "Endüstriyel PC",
  network_device: "Ağ Cihazı",
  engineering_workstation: "Mühendislik İstasyonu",
  server: "Sunucu",
  computer: "İş İstasyonu",
  unknown_device: "Bilinmeyen Cihaz",
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}
