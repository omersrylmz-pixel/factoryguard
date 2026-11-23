import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { Link } from "react-router";
import { bi, getLocale, tx } from "../i18n";
import type { Criticality } from "../types/api";
import { CountUp, SpotlightCard } from "./reactBits";

/**
 * FactoryGuard Lite — Endüstriyel OT Komuta & Telemetri Tasarım Sistemi (Dark + Light Mode).
 * Renk Şeması:
 * - Birincil Komuta Rengi: Endüstriyel Kobalt & Elektrik Mavisi (#2563EB -> #0284C7 / #38BDF8)
 * - Koyu Mod Yüzeyler: Obsidyen (#0B0F19) & Çelik Antrasit (#111827 / #161F30)
 * - Açık Mod Yüzeyler: Teknik Gri (#EEF2F6) & Beyaz (#FFFFFF)
 * - Anlamlı Durum Renkleri: Zümrüt (Doğrulanmış/Güvenli), Kehribar (İnceleme/Uyarı), Kızıl (Kritik Risk)
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
      "border border-[#1D4ED8] bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_8px_rgba(37,99,235,0.32)] hover:from-[#60A5FA] hover:to-[#2563EB] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 disabled:border-slate-300 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-500 disabled:shadow-none dark:disabled:border-slate-800 dark:disabled:from-slate-800 dark:disabled:to-slate-800 dark:disabled:text-slate-500",
    secondary:
      "border border-[#CBD5E1] bg-gradient-to-b from-white to-[#F1F5F9] text-[#0F172A] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.06)] hover:border-[#2563EB] hover:text-[#2563EB] active:translate-y-[0.5px] disabled:opacity-50 dark:border-[#334155] dark:from-[#1E293B] dark:to-[#0F172A] dark:text-[#E2E8F0] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:border-[#38BDF8] dark:hover:text-[#38BDF8]",
    outline:
      "border border-[#2563EB]/70 bg-[#2563EB]/10 text-[#1D4ED8] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-[#2563EB]/20 active:translate-y-[0.5px] disabled:opacity-45 dark:border-[#38BDF8]/50 dark:bg-[#0284C7]/15 dark:text-[#38BDF8] dark:hover:bg-[#0284C7]/25",
    ghost:
      "bg-transparent text-slate-600 hover:bg-slate-200/60 hover:text-[#0F172A] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
    danger:
      "border border-rose-500/40 bg-gradient-to-b from-rose-500/15 to-rose-600/25 text-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-rose-500/25 hover:to-rose-600/35 active:translate-y-[0.5px] disabled:opacity-40 dark:text-rose-300",
    dark:
      "border border-[#334155] bg-gradient-to-b from-[#1E293B] to-[#0F172A] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_2px_6px_rgba(15,23,42,0.25)] hover:border-[#38BDF8]/60 hover:from-[#334155] hover:to-[#1E293B] active:translate-y-[0.5px] disabled:opacity-45",
  }[variant];

  const sizeStyles = {
    sm: "h-7 px-2.5 text-[11px] gap-1.5 tracking-wide",
    md: "h-9 px-3.5 text-xs gap-2 tracking-wide",
    lg: "h-10 px-4 text-sm gap-2 tracking-wide",
  }[size];

  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center rounded-[5px] font-semibold whitespace-nowrap transition-all duration-150 disabled:cursor-not-allowed ${variantStyles} ${sizeStyles} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-9 w-full rounded-[5px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:outline-none disabled:bg-slate-100 dark:border-[#334155] dark:bg-[#0F172A] dark:text-[#F1F5F9] dark:placeholder:text-slate-500 dark:focus:border-[#38BDF8] ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-9 w-full rounded-[5px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:outline-none disabled:bg-slate-100 dark:border-[#334155] dark:bg-[#0F172A] dark:text-[#F1F5F9] dark:focus:border-[#38BDF8] ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold text-[#1E293B] dark:text-slate-300">{label}</span>
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
      className={`overflow-hidden rounded-[6px] border border-[#CBD5E1]/90 bg-white shadow-[0px_10px_22px_-6px_rgba(15,23,42,0.08)] dark:border-[#1E293B] dark:bg-[#111827] dark:shadow-[0px_12px_28px_-8px_rgba(0,0,0,0.45)] ${className}`}
    >
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-gradient-to-r from-[#F8FAFC] via-white to-[#F8FAFC] px-5 py-3.5 dark:border-[#1E293B] dark:from-[#161F30] dark:via-[#111827] dark:to-[#161F30]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#06B6D4]" />
              <h2 className="text-sm font-bold tracking-tight text-[#0F172A] dark:text-slate-100">{title}</h2>
            </div>
            {subtitle && <p className="mt-0.5 pl-3 text-xs text-[#64748B] dark:text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </section>
  );
}

type Tone = "teal" | "amber" | "red" | "slate" | "emerald";

/**
 * Endüstriyel Telemetri KPI Kartı (StatCard):
 * - Her kart kendi durum tonuna (Kobalt Mavi, Zümrüt, Kehribar, Kızıl, Çelik İndigo) göre
 *   farklı üst lazer şeridi, ikon kutusu, sağ mikro sinyal barları ve alt durum LED şeridi alır.
 */
export function StatCard({
  label,
  value,
  subtext,
  hint,
  tone,
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
  badge?: string | { text: string; tone?: Tone };
  badgeTone?: Tone;
  icon: ReactNode;
  to?: string;
}) {
  const badgeText = typeof badge === "object" && badge !== null ? badge.text : badge;
  const effectiveBadgeTone: Tone =
    typeof badge === "object" && badge !== null ? (badge.tone ?? badgeTone) : badgeTone;

  // Eğer tone açıkça verilmemişse badgeTone'dan türet; böylece 4 kart aynı renkte kalmaz!
  const effectiveCardTone = tone ?? effectiveBadgeTone;

  const badgeToneMap = {
    teal: "bg-sky-500/12 text-sky-700 border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/30",
    emerald:
      "bg-emerald-500/12 text-emerald-700 border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30",
    amber:
      "bg-amber-500/14 text-amber-800 border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/30",
    red: "bg-rose-500/14 text-rose-700 border-rose-500/35 dark:bg-rose-500/18 dark:text-rose-300 dark:border-rose-400/35",
    slate:
      "bg-slate-500/12 text-slate-700 border-slate-500/25 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600",
  }[effectiveBadgeTone];

  const topBarColor = {
    teal: "bg-gradient-to-r from-[#2563EB] via-[#0284C7] to-[#06B6D4]",
    emerald: "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400",
    amber: "bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400",
    red: "bg-gradient-to-r from-rose-600 via-red-500 to-orange-500",
    navy: "bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-400",
    slate: "bg-gradient-to-r from-slate-600 to-slate-400",
  }[effectiveCardTone];

  const iconStyle = {
    teal: "bg-blue-500/10 text-[#2563EB] ring-1 ring-blue-500/25 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-400/30",
    emerald:
      "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-400/30",
    amber:
      "bg-amber-500/12 text-amber-600 ring-1 ring-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-400/30",
    red: "bg-rose-500/12 text-rose-600 ring-1 ring-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-400/30",
    navy: "bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/25 dark:bg-indigo-500/15 dark:text-indigo-400 dark:ring-indigo-400/30",
    slate:
      "bg-slate-500/10 text-slate-600 ring-1 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  }[effectiveCardTone];

  const barHex = {
    teal: "#3B82F6",
    emerald: "#10B981",
    amber: "#F59E0B",
    red: "#F43F5E",
    navy: "#6366F1",
    slate: "#64748B",
  }[effectiveCardTone];

  const displaySub = subtext ?? hint;
  const subTitle = typeof displaySub === "string" ? displaySub : undefined;

  const inner = (
    <SpotlightCard
      tone={effectiveCardTone}
      className="flex h-full flex-col justify-between rounded-[6px] border border-[#CBD5E1]/90 bg-white px-5 pt-4 pb-3.5 shadow-[0px_10px_20px_-6px_rgba(15,23,42,0.08)] transition-all duration-150 hover:-translate-y-0.5 hover:border-[#3B82F6]/60 hover:shadow-lg dark:border-[#1E293B] dark:bg-[#111827] dark:shadow-[0px_12px_26px_-8px_rgba(0,0,0,0.5)] dark:hover:border-sky-500/50"
    >
      <div className={`absolute top-0 right-0 left-0 h-1 ${topBarColor}`} />

      {/* Üst Satır: İkon + Durum Rozeti */}
      <div className="flex items-center justify-between gap-2">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] ${iconStyle}`}>
          {icon}
        </div>
        {badgeText && (
          <span
            title={badgeText}
            className={`max-w-[62%] truncate rounded-[4px] border px-2.5 py-0.5 font-mono text-[10.5px] font-bold ${badgeToneMap}`}
          >
            {badgeText}
          </span>
        )}
      </div>

      {/* Orta Satır: Büyük Sayısal Metrik + Sağ Mikro Telemetri Sinyal Çubukları */}
      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate font-mono text-2xl leading-tight font-extrabold tracking-tight text-[#0F172A] tabular-nums dark:text-white">
            <CountUp value={value} />
          </h4>
          <div title={label} className="mt-1 truncate text-xs font-bold text-[#334155] dark:text-slate-200">
            {label}
          </div>
        </div>

        {/* Sağ Mikro Sinyal Barları (Kart içi boşluğu dolduran endüstriyel gösterge) */}
        <div className="flex h-8 shrink-0 items-end gap-1 pb-0.5 opacity-80" aria-hidden="true">
          {[35, 60, 45, 80, 65, 100, 75].map((h, i) => (
            <span
              key={i}
              className="w-1 rounded-t-[1px]"
              style={{
                height: `${h}%`,
                backgroundColor: i >= 4 ? barHex : "rgba(148,163,184,0.28)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Alt Telemetri Durum Şeridi */}
      {displaySub && (
        <div
          title={subTitle}
          className="mt-3 flex items-center gap-2 border-t border-[#E2E8F0] pt-2 text-[11px] font-medium text-[#64748B] dark:border-[#1E293B] dark:text-slate-400"
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: barHex }}
          />
          <span className="truncate">{displaySub}</span>
        </div>
      )}
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
    default:
      "bg-slate-500/12 text-slate-700 border-slate-400/30 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    teal: "bg-sky-500/12 text-sky-700 border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/30",
    success:
      "bg-emerald-500/12 text-emerald-700 border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30",
    warning:
      "bg-amber-500/14 text-amber-800 border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/30",
    danger:
      "bg-rose-500/14 text-rose-700 border-rose-500/35 dark:bg-rose-500/18 dark:text-rose-300 dark:border-rose-400/35",
    outline:
      "bg-white text-slate-700 border-[#CBD5E1] dark:bg-[#0F172A] dark:text-slate-300 dark:border-[#334155]",
    mono: "bg-[#F1F5F9] text-[#0F172A] border-[#CBD5E1] font-mono dark:bg-[#1E293B] dark:text-sky-300 dark:border-[#334155]",
  }[effectiveVariant];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${styles} ${className}`}
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
    <div className="rounded-[5px] border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300">
      {msg}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-xs text-[#64748B] dark:text-slate-400">{children}</p>;
}

/** Endüstriyel Komuta Sayfa Başlığı (Framed Command Header) */
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
    <div className="relative mb-5 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-[6px] border border-[#CBD5E1]/90 bg-white px-5 py-4 shadow-[0px_8px_18px_-6px_rgba(15,23,42,0.06)] dark:border-[#1E293B] dark:bg-[#111827] dark:shadow-[0px_10px_24px_-8px_rgba(0,0,0,0.45)]">
      <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-[#3B82F6] via-[#0284C7] to-[#06B6D4]" />
      <div className="min-w-0 pl-1">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
          {breadcrumb && (
            <nav className="flex items-center gap-1.5">
              <Link to="/" className="hover:text-[#2563EB] dark:hover:text-sky-400">
                {tx("Genel Bakış", "Overview")}
              </Link>
              <span>/</span>
              <span className="text-[#2563EB] dark:text-sky-400">{breadcrumb}</span>
            </nav>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.2 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {tx("SPAN TELEMETRİ · AKTİF", "SPAN TELEMETRY · LIVE")}
          </span>
        </div>
        <h1 className="text-xl font-extrabold tracking-tight text-[#0F172A] dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-xs text-[#64748B] dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export const CRITICALITY_LABEL: Record<Criticality, string> = bi({
  low: ["Düşük", "Low"],
  medium: ["Orta", "Medium"],
  high: ["Yüksek", "High"],
  critical: ["Kritik", "Critical"],
});

export function CriticalityBadge({ value }: { value: Criticality }) {
  const style = {
    low: "border-slate-400/30 bg-slate-500/12 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    medium:
      "border-amber-500/35 bg-amber-500/14 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300",
    high: "border-orange-500/35 bg-orange-500/15 text-orange-800 dark:border-orange-400/35 dark:bg-orange-500/18 dark:text-orange-300",
    critical:
      "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-300",
  }[value];
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${style}`}
    >
      {CRITICALITY_LABEL[value]}
    </span>
  );
}

export function ProtocolBadge({ protocol, confidence }: { protocol: string; confidence?: string }) {
  const isHint = confidence === "port_hint" || protocol.endsWith("?");
  const clean = protocol.replace(/\?+$/, "");
  return (
    <span
      title={isHint ? tx("Yalnızca port numarasından tahmin edildi", "Inferred from port number only") : undefined}
      className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] font-bold whitespace-nowrap uppercase ${
        isHint
          ? "border-amber-500/35 bg-amber-500/14 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300"
          : "border-sky-500/30 bg-sky-500/12 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300"
      }`}
    >
      {clean}
      {isHint && (
        <span className="font-sans text-[9px] font-normal normal-case">{tx("port tahmini", "port hint")}</span>
      )}
    </span>
  );
}

export const ROLE_LABEL: Record<string, string> = bi({
  owner: ["Sahip", "Owner"],
  admin: ["Yönetici", "Admin"],
  analyst: ["Analist", "Analyst"],
  viewer: ["İzleyici", "Viewer"],
});

export const ASSET_TYPE_LABEL: Record<string, string> = bi({
  plc: ["PLC / Kontrolcü", "PLC / Controller"],
  hmi: ["HMI Paneli", "HMI Panel"],
  scada_server: ["SCADA Sunucusu", "SCADA Server"],
  industrial_pc: ["Endüstriyel PC", "Industrial PC"],
  network_device: ["Ağ Cihazı", "Network Device"],
  engineering_workstation: ["Mühendislik İstasyonu", "Engineering Workstation"],
  server: ["Sunucu", "Server"],
  computer: ["İş İstasyonu", "Workstation"],
  unknown_device: ["Bilinmeyen Cihaz", "Unknown Device"],
});

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(getLocale(), { dateStyle: "short", timeStyle: "short" });
}

const AUDIT_ACTION_LABEL: Record<string, readonly [string, string]> = {
  "auth.login": ["Oturum açıldı", "Signed in"],
  "auth.logout": ["Oturum kapatıldı", "Signed out"],
  "auth.register": ["Kullanıcı kaydı", "User registered"],
  "asset.create": ["Cihaz eklendi", "Asset created"],
  "asset.update": ["Cihaz güncellendi", "Asset updated"],
  "asset.verify": ["Cihaz doğrulandı", "Asset verified"],
  "asset.bulk_verify": ["Cihazlar toplu doğrulandı", "Assets bulk-verified"],
  "asset.csv_import": ["CSV envanter içe aktarıldı", "CSV inventory imported"],
  "sensor.enroll": ["Sensör kaydedildi", "Sensor enrolled"],
  "sensor.analyze_upload": ["PCAP / log analizi yüklendi", "PCAP / log analysis uploaded"],
  "site.create": ["Fabrika eklendi", "Site created"],
  "site.delete": ["Fabrika silindi", "Site deleted"],
  "zone.create": ["Bölge eklendi", "Zone created"],
  "zone.delete": ["Bölge silindi", "Zone deleted"],
  "risk.status_change": ["Risk durumu değişti", "Risk status changed"],
  "risk.bulk_status": ["Risk durumları toplu değişti", "Risk statuses bulk-changed"],
  "risk.evaluate": ["Risk motoru çalıştırıldı", "Risk engine run"],
  "communication.approve_baseline": ["İletişim baseline'a alındı", "Flow approved to baseline"],
  "communication.approve_all_baseline": ["Tüm akışlar baseline'a alındı", "All flows approved to baseline"],
  "organization.update": ["Organizasyon güncellendi", "Organization updated"],
  "vulnerability_catalog.create": ["Zafiyet kataloğuna CVE eklendi", "CVE added to vulnerability catalog"],
  "member.add": ["Yeni kullanıcı eklendi", "New member added"],
  "member.update": ["Kullanıcı yetkisi güncellendi", "Member role updated"],
  "cli.seed_demo": ["Demo verisi yüklendi", "Demo data seeded"],
};

export function formatAuditAction(action: string): string {
  const key = action.toLowerCase();
  const hit = AUDIT_ACTION_LABEL[key];
  if (hit) return tx(hit[0], hit[1]);
  const [entity, verb] = key.split(".");
  const pretty = (s: string) => s.replace(/_/g, " ");
  return verb ? `${pretty(entity).replace(/^./, (c) => c.toUpperCase())} · ${pretty(verb)}` : pretty(key);
}

const TARGET_TYPE_LABEL = bi({
  asset: ["Cihaz", "Asset"],
  sensor: ["Sensör", "Sensor"],
  site: ["Fabrika", "Site"],
  zone: ["Bölge", "Zone"],
  risk: ["Risk", "Risk"],
  risk_finding: ["Risk bulgusu", "Risk finding"],
  communication: ["İletişim", "Flow"],
  organization: ["Organizasyon", "Organization"],
  user: ["Kullanıcı", "User"],
});

export function formatAuditTarget(targetType: string | null): string {
  if (!targetType) return "—";
  return (TARGET_TYPE_LABEL as Record<string, string>)[targetType] ?? targetType;
}
