import { useId } from "react";
import { useLang } from "../i18n";
import type { AssetType, Criticality } from "../types/api";
import { DecryptedText, InteractiveDotGrid, SpotlightCard } from "./reactBits";

/**
 * CAD-Kalitesinde Fotogerçekçi Endüstriyel Donanım Dijital İkizi (Claroty xDome & Cisco Cyber Vision Stili)
 * - Metalik fırçalanmış alüminyum/çelik gradyanlar, soğutma ızgaraları, DIN rayı kilit mandalları
 * - Gerçekçi PLC ön paneli: SIMATIC/ControlLogix tarzı RUN/STOP/MRES döner anahtar, SD kart yuvası,
 *   vida başlı 24VDC klemensler, OLED tanı ekranı, parlayan LED filtreleri ve bakır pinli ekranlı RJ45 portlar
 * - Gerçekçi HMI operatör paneli: Canlı P&ID borulama şeması, dönen pompa fanı, tank seviye dalgası ve basınç osiloskopu
 * - Gerçekçi 2U SCADA Raf Sunucusu: Petek dokulu havalandırma, 8x Hot-Swap NVMe RAID kızakları, çift PSU ve BMC OLED ekran
 * - Gerçekçi Endüstriyel Yönetilebilir Switch: 8x ekranlı RJ45 + 2x SFP+ fiber optik modül, DIN rayı topraklama vidası
 */

export function vendorAccentColor(vendor?: string | null): {
  brand: string;
  series: string;
  bg: string;
  text: string;
  accent: string;
  chassisTop: string;
  chassisBottom: string;
} {
  const v = (vendor || "").toLowerCase();
  if (v.includes("siemens")) {
    return {
      brand: "SIEMENS",
      series: "SIMATIC S7 / TIA",
      bg: "#008080",
      text: "#FFFFFF",
      accent: "#00D4D4",
      chassisTop: "#27364B",
      chassisBottom: "#151E2D",
    };
  }
  if (v.includes("rockwell") || v.includes("allen-bradley")) {
    return {
      brand: "ALLEN-BRADLEY",
      series: "Logix5000 / CIP",
      bg: "#C8102E",
      text: "#FFFFFF",
      accent: "#F43F5E",
      chassisTop: "#2E323C",
      chassisBottom: "#181B22",
    };
  }
  if (v.includes("schneider") || v.includes("modicon")) {
    return {
      brand: "SCHNEIDER",
      series: "Modicon M580",
      bg: "#15803D",
      text: "#FFFFFF",
      accent: "#22C55E",
      chassisTop: "#24342F",
      chassisBottom: "#131D1A",
    };
  }
  if (v.includes("wonderware") || v.includes("aveva")) {
    return {
      brand: "AVEVA",
      series: "InTouch SCADA",
      bg: "#1D4ED8",
      text: "#FFFFFF",
      accent: "#38BDF8",
      chassisTop: "#1E293B",
      chassisBottom: "#0F172A",
    };
  }
  if (v.includes("omron")) {
    return {
      brand: "OMRON",
      series: "Sysmac NX/NJ",
      bg: "#1E40AF",
      text: "#FFFFFF",
      accent: "#60A5FA",
      chassisTop: "#1F2A40",
      chassisBottom: "#101726",
    };
  }
  if (v.includes("moxa") || v.includes("hirschmann") || v.includes("phoenix") || v.includes("cisco")) {
    return {
      brand: vendor!.toUpperCase(),
      series: "Industrial TSN/L2",
      bg: "#0369A1",
      text: "#FFFFFF",
      accent: "#38BDF8",
      chassisTop: "#1E293B",
      chassisBottom: "#0F172A",
    };
  }
  return {
    brand: vendor ? vendor.toUpperCase() : "INDUSTRIAL OT",
    series: "IEC-61131 Field Unit",
    bg: "#1E293B",
    text: "#E2E8F0",
    accent: "#38BDF8",
    chassisTop: "#263248",
    chassisBottom: "#111827",
  };
}

/**
 * Envanter tablosu (`AssetsPage.tsx`) için yüksek detaylı, 3B metalik çerçeveli küçük cihaz şasisi (60x42)
 */
export function DeviceHardwareThumb({
  assetType,
  vendor,
  isVerified,
  criticality,
}: {
  assetType: AssetType;
  vendor?: string | null;
  isVerified?: boolean;
  criticality?: Criticality;
}) {
  const uid = useId();
  const vColor = vendorAccentColor(vendor);
  const statusDot =
    criticality === "critical" || criticality === "high"
      ? "#F43F5E"
      : isVerified
        ? "#10B981"
        : "#F59E0B";

  return (
    <div className="relative flex h-[42px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-[#334155] bg-gradient-to-b from-[#1E293B] via-[#0F172A] to-[#090D16] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_6px_rgba(0,0,0,0.35)]">
      {/* Üst Üretici Metalik Şeridi */}
      <div
        className="absolute top-0 right-0 left-0 h-[2.5px]"
        style={{ backgroundColor: vColor.accent }}
      />
      {/* Sağ üst canlı durum LED noktası */}
      <span
        className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full shadow-[0_0_5px_currentColor]"
        style={{ backgroundColor: statusDot, color: statusDot }}
      />

      {assetType === "plc" && (
        <svg viewBox="0 0 54 36" className="h-8 w-13">
          <defs>
            <linearGradient id={`plc-th-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={vColor.chassisTop} />
              <stop offset="100%" stopColor={vColor.chassisBottom} />
            </linearGradient>
          </defs>
          {/* DIN Rayı Kulakları */}
          <rect x="1" y="13" width="52" height="10" rx="1" fill="#475569" />
          {/* PSU + CPU + I/O 3'lü Modüler Blok */}
          <rect x="4" y="3" width="11" height="30" rx="1.5" fill={`url(#plc-th-${uid})`} stroke="#64748B" strokeWidth="0.9" />
          <rect x="16" y="3" width="21" height="30" rx="1.5" fill={`url(#plc-th-${uid})`} stroke={vColor.accent} strokeWidth="1" />
          <rect x="38" y="3" width="12" height="30" rx="1.5" fill={`url(#plc-th-${uid})`} stroke="#64748B" strokeWidth="0.9" />
          {/* PSU LED + Klemens */}
          <circle cx="7" cy="7" r="1.1" fill="#10B981" />
          <rect x="6" y="25" width="7" height="5" rx="0.6" fill="#090D16" stroke="#475569" strokeWidth="0.6" />
          {/* CPU OLED Ekranı */}
          <rect x="18.5" y="10" width="16" height="10" rx="1" fill="#041E2B" stroke="#38BDF8" strokeWidth="0.8" />
          <polyline points="20,17 23,13 26,16 29,12 33,15" fill="none" stroke="#38BDF8" strokeWidth="1" />
          {/* CPU Durum LED'leri */}
          <circle cx="19.5" cy="6.5" r="1.2" fill="#10B981" />
          <circle cx="23.5" cy="6.5" r="1.2" fill={statusDot} />
          <circle cx="27.5" cy="6.5" r="1.2" fill="#38BDF8" />
          {/* Alt Çift Ekranlı RJ45 Port */}
          <rect x="19" y="23" width="6.5" height="6.5" rx="0.8" fill="#090D16" stroke="#94A3B8" strokeWidth="0.7" />
          <rect x="27.5" y="23" width="6.5" height="6.5" rx="0.8" fill="#090D16" stroke="#94A3B8" strokeWidth="0.7" />
          {/* I/O Kanal LED Matrisi */}
          {[7, 11, 15, 19, 23, 27].map((y, idx) => (
            <g key={y}>
              <circle cx="41.5" cy={y} r="1" fill={idx % 2 === 0 ? "#10B981" : "#38BDF8"} />
              <circle cx="46.5" cy={y} r="1" fill={idx === 2 ? "#F59E0B" : "#10B981"} />
            </g>
          ))}
        </svg>
      )}

      {assetType === "hmi" && (
        <svg viewBox="0 0 54 36" className="h-8 w-13">
          {/* Alüminyum Bezel HMI Panel */}
          <rect x="3" y="3" width="48" height="30" rx="3" fill="#334155" stroke="#94A3B8" strokeWidth="1.2" />
          <rect x="5.5" y="5.5" width="38" height="25" rx="1.5" fill="#071120" stroke={vColor.accent} strokeWidth="0.9" />
          {/* Üst SCADA Başlık Şeridi */}
          <rect x="6" y="6" width="37" height="3.5" fill="#1E293B" />
          {/* Sol Tank + Sağ P&ID Dalga Grafiği */}
          <rect x="8.5" y="12" width="10" height="15" rx="1.2" fill="#0F172A" stroke="#38BDF8" strokeWidth="0.8" />
          <rect x="9.5" y="17" width="8" height="9" rx="0.6" fill="#0284C7" />
          <polyline
            points="21,24 25,16 29,20 34,13 40,15"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1.4"
          />
          <polyline
            points="21,27 26,23 31,25 36,20 40,22"
            fill="none"
            stroke="#10B981"
            strokeWidth="1.1"
          />
          {/* Sağ Fiziksel Membran Tuşlar */}
          {[8, 13, 18, 23].map((y, i) => (
            <rect
              key={y}
              x="45.5"
              y={y}
              width="3"
              height="3"
              rx="0.6"
              fill={i === 0 ? "#10B981" : i === 3 ? statusDot : "#64748B"}
            />
          ))}
        </svg>
      )}

      {(assetType === "scada_server" || assetType === "server") && (
        <svg viewBox="0 0 54 36" className="h-8 w-13">
          {/* 2U Çift Katmanlı Endüstriyel Rack Sunucu */}
          <rect x="2" y="4" width="50" height="13" rx="1.5" fill="#1E293B" stroke="#64748B" strokeWidth="1" />
          <rect x="2" y="19" width="50" height="13" rx="1.5" fill="#1E293B" stroke="#64748B" strokeWidth="1" />
          {/* Hot-Swap NVMe Kızakları */}
          {[5, 11, 17, 23, 29].map((x, idx) => (
            <g key={x}>
              <rect x={x} y="6" width="4.5" height="9" rx="0.6" fill="#090D16" stroke="#475569" strokeWidth="0.7" />
              <circle cx={x + 2.2} cy="8" r="0.8" fill="#10B981" />
              <rect x={x} y="21" width="4.5" height="9" rx="0.6" fill="#090D16" stroke="#475569" strokeWidth="0.7" />
              <circle cx={x + 2.2} cy="23" r="0.8" fill={idx === 4 ? statusDot : "#38BDF8"} />
            </g>
          ))}
          {/* Sağ OLED & BMC Modülü */}
          <rect x="36" y="6.5" width="13" height="8" rx="1" fill="#041E2B" stroke="#38BDF8" strokeWidth="0.7" />
          <line x1="38" y1="10.5" x2="47" y2="10.5" stroke="#38BDF8" strokeWidth="1.2" />
          <circle cx="39" cy="25.5" r="1.5" fill="#10B981" />
          <circle cx="44" cy="25.5" r="1.5" fill={statusDot} />
        </svg>
      )}

      {assetType === "network_device" && (
        <svg viewBox="0 0 54 36" className="h-8 w-13">
          {/* Endüstriyel Yönetilebilir Switch */}
          <rect x="3" y="7" width="48" height="22" rx="2" fill="#1E293B" stroke={vColor.accent} strokeWidth="1.1" />
          {[6, 12, 18, 24, 30, 36].map((x, i) => (
            <g key={x}>
              <rect x={x} y="15" width="4.8" height="7" rx="0.6" fill="#090D16" stroke="#94A3B8" strokeWidth="0.7" />
              <circle cx={x + 1.4} cy="12" r="1" fill="#10B981" />
              <circle cx={x + 3.6} cy="12" r="1" fill={i % 2 === 0 ? "#38BDF8" : "#F59E0B"} />
            </g>
          ))}
          {/* Sağ SFP+ Fiber Uplink Yuvaları */}
          <rect x="43" y="11" width="5.5" height="6.5" rx="0.6" fill="#041E2B" stroke="#38BDF8" strokeWidth="0.8" />
          <rect x="43" y="19" width="5.5" height="6.5" rx="0.6" fill="#041E2B" stroke="#38BDF8" strokeWidth="0.8" />
        </svg>
      )}

      {(assetType === "engineering_workstation" ||
        assetType === "industrial_pc" ||
        assetType === "computer") && (
        <svg viewBox="0 0 54 36" className="h-8 w-13">
          {/* Geniş Ekran Mühendislik İstasyonu (Ladder Logic & Kule İş İstasyonu) */}
          <rect x="4" y="4" width="30" height="20" rx="2" fill="#090D16" stroke="#94A3B8" strokeWidth="1.2" />
          {/* Ladder Diyagram Çizgileri */}
          <line x1="8" y1="9" x2="30" y2="9" stroke="#38BDF8" strokeWidth="1.1" />
          <rect x="13" y="7.5" width="4" height="3" fill="#090D16" stroke="#10B981" strokeWidth="0.9" />
          <circle cx="25" cy="9" r="1.8" fill="none" stroke="#F59E0B" strokeWidth="0.9" />
          <line x1="8" y1="14.5" x2="30" y2="14.5" stroke="#38BDF8" strokeWidth="1.1" />
          <rect x="16" y="13" width="4" height="3" fill="#090D16" stroke="#38BDF8" strokeWidth="0.9" />
          <line x1="8" y1="19.5" x2="24" y2="19.5" stroke="#64748B" strokeWidth="1" />
          {/* Monitör Ayağı */}
          <rect x="16" y="24" width="6" height="3.5" fill="#475569" />
          <rect x="11" y="27.5" width="16" height="2" rx="1" fill="#64748B" />
          {/* Sağ Endüstriyel IPC Kasa */}
          <rect x="37" y="5" width="12" height="25" rx="1.8" fill="#1E293B" stroke="#64748B" strokeWidth="1.1" />
          <circle cx="43" cy="10" r="1.5" fill="#10B981" />
          <circle cx="43" cy="15" r="1.2" fill={statusDot} />
          <line x1="39.5" y1="21" x2="46.5" y2="21" stroke="#475569" strokeWidth="1" />
          <line x1="39.5" y1="24" x2="46.5" y2="24" stroke="#475569" strokeWidth="1" />
        </svg>
      )}

      {assetType === "unknown_device" && (
        <svg viewBox="0 0 54 36" className="h-8 w-13">
          {/* Pasif Sinyal Radarı & Protokol Keşif Ünitesi */}
          <rect
            x="4"
            y="4"
            width="46"
            height="28"
            rx="3"
            fill="#0F172A"
            stroke="#F59E0B"
            strokeWidth="1.1"
            strokeDasharray="3,2"
          />
          <circle cx="17" cy="18" r="8" fill="#F59E0B" fillOpacity="0.1" stroke="#F59E0B" strokeWidth="1" />
          <circle cx="17" cy="18" r="4.5" fill="none" stroke="#FBBF24" strokeWidth="0.9" strokeDasharray="2,1.5" />
          <circle cx="17" cy="18" r="2" fill="#F59E0B" />
          <line x1="17" y1="18" x2="23" y2="13" stroke="#FDE68A" strokeWidth="1.2" />
          <line x1="29" y1="12" x2="44" y2="12" stroke="#38BDF8" strokeWidth="1.4" />
          <line x1="29" y1="18" x2="41" y2="18" stroke="#FBBF24" strokeWidth="1.4" />
          <line x1="29" y1="24" x2="38" y2="24" stroke="#94A3B8" strokeWidth="1.4" />
        </svg>
      )}
    </div>
  );
}

/**
 * Cihaz Detay Sayfası (`AssetDetailPage.tsx`) için Yüksek Yoğunluklu CAD/Dijital İkiz Şasi Kartı
 */
export function DeviceHardwareChassisCard({
  name,
  ip,
  mac,
  assetType,
  vendor,
  model,
  firmware,
  serial,
  purdueLevel,
  isVerified,
  criticality,
  protocols,
  activePorts,
}: {
  name: string;
  ip: string | null;
  mac: string | null;
  assetType: AssetType;
  vendor: string | null;
  model: string | null;
  firmware: string | null;
  serial: string | null;
  purdueLevel?: string;
  isVerified: boolean;
  criticality: Criticality;
  protocols: string[];
  activePorts: { port: number; proto: string; direction: string }[];
}) {
  const uid = useId();
  const { t } = useLang();
  const vStyle = vendorAccentColor(vendor);

  const defaultPorts =
    activePorts.length > 0
      ? activePorts.slice(0, 6)
      : protocols.slice(0, 6).map((p, idx) => ({
          port: p.toLowerCase().includes("modbus")
            ? 502
            : p.toLowerCase().includes("s7")
              ? 102
              : p.toLowerCase().includes("enip")
                ? 44818
                : p.toLowerCase().includes("opc")
                  ? 4840
                  : p.toLowerCase().includes("dnp3")
                    ? 20000
                    : p.toLowerCase().includes("bacnet")
                      ? 47808
                      : p.toLowerCase().includes("rdp")
                        ? 3389
                        : 1024 + idx,
          proto: p.replace(/\?+$/, "").toUpperCase(),
          direction: "bi",
        }));

  return (
    <SpotlightCard
      tone="teal"
      className="overflow-hidden rounded-[8px] border border-[#1E293B] bg-gradient-to-br from-[#070B14] via-[#0F172A] to-[#070B14] text-white shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
    >
      <InteractiveDotGrid dotColor="rgba(56, 189, 248, 0.14)" />

      {/* Üst Endüstriyel Şasi Plakası (Nameplate Header) */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] bg-[#0B1120]/90 px-5 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="rounded-[4px] border border-white/15 px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider shadow-xs"
            style={{ backgroundColor: vStyle.bg, color: vStyle.text }}
          >
            {vStyle.brand}
          </span>
          <span className="font-mono text-[11px] text-sky-400">{vStyle.series}</span>
          <span className="text-slate-600">·</span>
          <span className="font-semibold text-slate-100">
            {model || t("Endüstriyel Saha Kontrol Ünitesi", "Industrial Field Control Unit")}
          </span>
          {firmware && (
            <span className="rounded-[4px] border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
              FW v{firmware}
            </span>
          )}
          <span className="rounded-[4px] border border-[#334155] bg-[#161F30] px-2 py-0.5 font-mono text-[11px] text-slate-300">
            {purdueLevel ?? "Purdue L1/L2"}
          </span>
        </div>

        {/* Sağ Üst Fiziksel LED Telemetri Kümesi */}
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#10B981]" />
            24VDC / RUN
          </span>
          <span
            className={`inline-flex items-center gap-1.5 ${
              criticality === "critical" || criticality === "high"
                ? "text-rose-400"
                : "text-slate-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                criticality === "critical" || criticality === "high"
                  ? "animate-pulse bg-rose-500 shadow-[0_0_8px_#F43F5E]"
                  : "bg-slate-600"
              }`}
            />
            SF / FAULT
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 ${
              isVerified
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isVerified ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {isVerified ? t("ENVANTER ONAYLI", "BASELINE VERIFIED") : t("DOĞRULAMA BEKLİYOR", "UNVERIFIED NODE")}
          </span>
        </div>
      </div>

      {/* Ana Gövde: Sol 7 Sütun CAD Donanım Şasisi + Sağ 5 Sütun Fiziksel Port & Protokol Matrisi */}
      <div className="relative z-10 grid grid-cols-1 gap-5 p-5 lg:grid-cols-12">
        {/* Sol 7 Sütun: Yüksek Detaylı CAD Şasi Görseli */}
        <div className="flex flex-col justify-between rounded-[8px] border border-[#1E293B] bg-[#060A12] p-4 shadow-[inset_0_2px_12px_rgba(0,0,0,0.65)] lg:col-span-7">
          {assetType === "plc" && (
            <svg viewBox="0 0 580 215" className="h-52 w-full select-none">
              <defs>
                <linearGradient id={`cad-metal-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#334155" />
                  <stop offset="48%" stopColor="#1E293B" />
                  <stop offset="100%" stopColor="#0F172A" />
                </linearGradient>
                <linearGradient id={`cad-rail-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94A3B8" />
                  <stop offset="30%" stopColor="#CBD5E1" />
                  <stop offset="70%" stopColor="#64748B" />
                  <stop offset="100%" stopColor="#334155" />
                </linearGradient>
                <linearGradient id={`cad-oled-${uid}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#021019" />
                  <stop offset="50%" stopColor="#06283D" />
                  <stop offset="100%" stopColor="#031826" />
                </linearGradient>
              </defs>

              {/* 35mm EN 50022 Çelik DIN Rayı + Montaj Delikleri */}
              <rect x="4" y="82" width="572" height="50" rx="2" fill={`url(#cad-rail-${uid})`} stroke="#475569" strokeWidth="1.2" />
              {[14, 548].map((rx) => (
                <rect key={rx} x={rx} y="98" width="16" height="18" rx="4" fill="#060A12" stroke="#475569" strokeWidth="1" />
              ))}

              {/* 1. Modül: 24VDC Endüstriyel Güç Kaynağı (SITOP / Allen-Bradley 1606-XLS) */}
              <g transform="translate(26, 12)">
                <rect x="0" y="0" width="96" height="190" rx="4" fill={`url(#cad-metal-${uid})`} stroke="#475569" strokeWidth="1.5" />
                {/* Üst Havalandırma Izgarası */}
                {[12, 24, 36, 48, 60, 72].map((vx) => (
                  <rect key={vx} x={vx} y="6" width="6" height="3" rx="1" fill="#090D16" />
                ))}
                <text x="12" y="24" fill="#E2E8F0" className="font-mono text-[9px] font-bold">
                  PSU 24VDC/10A
                </text>
                <text x="12" y="34" fill="#64748B" className="font-mono text-[7.5px]">
                  INPUT 400VAC 3PH
                </text>
                {/* Güç Durum LED'leri ve Voltaj Trimpot */}
                <rect x="12" y="42" width="72" height="32" rx="2.5" fill="#0B1120" stroke="#334155" />
                <circle cx="22" cy="52" r="3.5" fill="#10B981" />
                <text x="30" y="55" fill="#34D399" className="font-mono text-[8px] font-bold">
                  24.1V DC OK
                </text>
                <circle cx="22" cy="65" r="3" fill="#1E293B" stroke="#475569" />
                <text x="30" y="68" fill="#94A3B8" className="font-mono text-[7.5px]">
                  OVERLOAD
                </text>
                {/* Bakır Bobin / Soğutucu Izgara Penceresi */}
                <rect x="12" y="82" width="72" height="44" rx="2" fill="#090D16" stroke="#1E293B" />
                {[88, 96, 104, 112, 120].map((vy) => (
                  <line key={vy} x1="16" y1={vy} x2="80" y2={vy} stroke="#B45309" strokeWidth="1.6" strokeOpacity="0.65" />
                ))}
                {/* Alt Vidalı Klemens Bloğu (L+, L+, M, M, PE) */}
                <rect x="10" y="136" width="76" height="44" rx="2" fill="#0B1120" stroke="#475569" />
                <text x="16" y="148" fill="#FBBF24" className="font-mono text-[8px] font-bold">
                  L1+  L2+   M    PE
                </text>
                {[20, 38, 56, 74].map((sx) => (
                  <g key={sx}>
                    <circle cx={sx} cy="164" r="6" fill="#475569" stroke="#94A3B8" strokeWidth="1" />
                    <line x1={sx - 3.5} y1="164" x2={sx + 3.5} y2="164" stroke="#0F172A" strokeWidth="1.4" />
                  </g>
                ))}
              </g>

              {/* 2. Modül: Ana PLC CPU (OLED Ekran + Döner Anahtar + SD Kart + Çift PROFINET/Modbus RJ45) */}
              <g transform="translate(128, 12)">
                <rect x="0" y="0" width="212" height="190" rx="4" fill={`url(#cad-metal-${uid})`} stroke={vStyle.accent} strokeWidth="1.8" />
                {/* Üst Marka ve Model Plakası */}
                <rect x="12" y="10" width="76" height="16" rx="2.5" fill={vStyle.bg} />
                <text x="18" y="21" fill="#FFFFFF" className="font-mono text-[9px] font-bold">
                  {vStyle.brand}
                </text>
                <text x="96" y="21" fill="#F1F5F9" className="font-mono text-[9.5px] font-bold">
                  {model ? model.slice(0, 16) : "CPU 1516F-3 PN/DP"}
                </text>

                {/* RUN / STOP / ERROR / MAINT / FORCE LED Paneli */}
                <rect x="12" y="32" width="188" height="20" rx="2.5" fill="#090D16" stroke="#334155" />
                {[
                  { x: 22, label: "RUN", col: "#10B981", active: true },
                  { x: 62, label: "ERR", col: "#F43F5E", active: criticality === "critical" || criticality === "high" },
                  { x: 102, label: "MAINT", col: "#F59E0B", active: !isVerified },
                  { x: 152, label: "LINK", col: "#38BDF8", active: true },
                ].map((led) => (
                  <g key={led.label}>
                    <circle
                      cx={led.x}
                      cy="42"
                      r="3.8"
                      fill={led.active ? led.col : "#1E293B"}
                      stroke="#334155"
                      strokeWidth="0.8"
                    />
                    <text
                      x={led.x + 7}
                      y="45"
                      fill={led.active ? "#F8FAFC" : "#64748B"}
                      className="font-mono text-[8px] font-bold"
                    >
                      {led.label}
                    </text>
                  </g>
                ))}

                {/* Ön Yüksek Çözünürlüklü OLED Tanı Ekranı + Canlı Çevrim Süresi Osiloskopu */}
                <rect x="12" y="58" width="136" height="68" rx="3" fill={`url(#cad-oled-${uid})`} stroke="#38BDF8" strokeWidth="1.2" />
                <rect x="14" y="60" width="132" height="13" fill="#0284C7" fillOpacity="0.35" />
                <text x="19" y="69.5" fill="#7DD3FC" className="font-mono text-[8px] font-bold">
                  {name.length > 20 ? `${name.slice(0, 19)}…` : name}
                </text>
                <text x="19" y="84" fill="#FFFFFF" className="font-mono text-[11px] font-bold">
                  IP: {ip ?? "192.168.10.20"}
                </text>
                <text x="19" y="96" fill="#38BDF8" className="font-mono text-[8px]">
                  FW: {firmware ? `v${firmware}` : "v2.9.4"} · CYCLE: 1.4ms
                </text>
                {/* OLED Alt Canlı Sinyal Çizgisi */}
                <polyline
                  points="19,117 32,110 45,115 58,104 71,114 84,106 97,113 110,103 123,112 138,107"
                  fill="none"
                  stroke="#34D399"
                  strokeWidth="1.3"
                />

                {/* Sağ: Fiziksel RUN/STOP/MRES Döner Anahtar + Simatic Memory Card Yuvası */}
                <rect x="154" y="58" width="46" height="68" rx="3" fill="#0B1120" stroke="#334155" />
                <text x="161" y="69" fill="#94A3B8" className="font-mono text-[7px] font-bold">
                  MODE SW
                </text>
                <circle cx="177" cy="85" r="11" fill="#1E293B" stroke="#64748B" strokeWidth="1.2" />
                <line x1="177" y1="85" x2="184" y2="78" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" />
                {/* SD Kart Yuvası */}
                <rect x="163" y="102" width="28" height="18" rx="1.5" fill="#060A12" stroke="#475569" />
                <rect x="167" y="105" width="20" height="12" rx="1" fill="#0284C7" />
                <text x="170" y="114" fill="#FFFFFF" className="font-mono text-[6.5px] font-bold">
                  SMC
                </text>

                {/* Alt Çift Metalik Ekranlı RJ45 PROFINET / Modbus TCP Portu (Bakır Pinli) */}
                {[
                  { x: 12, label: "X1 · PROFINET / MODBUS" },
                  { x: 110, label: "X2 · RING / ENGINEERING" },
                ].map((port) => (
                  <g key={port.label} transform={`translate(${port.x}, 134)`}>
                    <rect x="0" y="0" width="90" height="46" rx="3" fill="#0B1120" stroke="#475569" />
                    <circle cx="12" cy="10" r="2.8" fill="#10B981" />
                    <text x="18" y="12.5" fill="#34D399" className="font-mono text-[7px] font-bold">
                      LINK
                    </text>
                    <circle cx="54" cy="10" r="2.8" fill="#F59E0B" />
                    <text x="60" y="12.5" fill="#FBBF24" className="font-mono text-[7px] font-bold">
                      ACT
                    </text>
                    {/* Metalik RJ45 Soket */}
                    <rect x="12" y="17" width="32" height="20" rx="1.5" fill="#1E293B" stroke="#94A3B8" strokeWidth="1.1" />
                    {[16, 20, 24, 28, 32, 36].map((px) => (
                      <line key={px} x1={px} y1="18" x2={px} y2="24" stroke="#F59E0B" strokeWidth="1" />
                    ))}
                    <text x="49" y="26" fill="#E2E8F0" className="font-mono text-[7.5px] font-bold">
                      100M
                    </text>
                    <text x="49" y="35" fill="#38BDF8" className="font-mono text-[6.8px]">
                      FULL-DX
                    </text>
                  </g>
                ))}
              </g>

              {/* 3. ve 4. Modül: 16 Kanallı Dijital Giriş (DI) & Dijital Çıkış (DQ) Saha Klemens Modülleri */}
              {[
                { x: 346, title: "DI 16x24VDC HF", sub: "6ES7 521-1BH00" },
                { x: 454, title: "DQ 16x24VDC/0.5A", sub: "6ES7 522-1BH01" },
              ].map((ioMod, modIdx) => (
                <g key={ioMod.title} transform={`translate(${ioMod.x}, 12)`}>
                  <rect x="0" y="0" width="102" height="190" rx="4" fill={`url(#cad-metal-${uid})`} stroke="#475569" strokeWidth="1.5" />
                  <text x="10" y="19" fill="#E2E8F0" className="font-mono text-[8.5px] font-bold">
                    {ioMod.title}
                  </text>
                  <text x="10" y="29" fill="#64748B" className="font-mono text-[7px]">
                    {ioMod.sub}
                  </text>
                  <rect x="10" y="36" width="82" height="144" rx="2.5" fill="#090D16" stroke="#334155" />
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((ch) => {
                    const activeLeft = (ch + modIdx) % 3 !== 0;
                    const activeRight = (ch + modIdx) % 2 === 0;
                    return (
                      <g key={ch} transform={`translate(15, ${44 + ch * 16.5})`}>
                        {/* Sol Kanal: LED + Etiket + Klemens Vidası */}
                        <circle cx="4" cy="5" r="2.8" fill={activeLeft ? "#10B981" : "#1E293B"} />
                        <text x="10" y="8" fill="#CBD5E1" className="font-mono text-[7.5px]">
                          CH.{ch}
                        </text>
                        {/* Sağ Kanal: LED + Etiket */}
                        <circle cx="42" cy="5" r="2.8" fill={activeRight ? "#38BDF8" : "#F59E0B"} />
                        <text x="48" y="8" fill="#CBD5E1" className="font-mono text-[7.5px]">
                          CH.{ch + 8}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
          )}

          {assetType === "hmi" && (
            <svg viewBox="0 0 580 215" className="h-52 w-full select-none">
              <defs>
                <linearGradient id={`hmi-bezel-${uid}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="50%" stopColor="#1E293B" />
                  <stop offset="100%" stopColor="#0F172A" />
                </linearGradient>
              </defs>
              {/* Dış Endüstriyel Alüminyum IP65 HMI Çerçevesi + Köşe Alyan Vidaları */}
              <rect x="20" y="8" width="540" height="198" rx="12" fill={`url(#hmi-bezel-${uid})`} stroke="#94A3B8" strokeWidth="2" />
              {[
                [32, 20],
                [548, 20],
                [32, 194],
                [548, 194],
              ].map(([sx, sy], i) => (
                <circle key={i} cx={sx} cy={sy} r="4" fill="#0F172A" stroke="#64748B" strokeWidth="1" />
              ))}

              {/* İç Cam Dokunmatik SCADA Ekranı */}
              <rect x="44" y="22" width="444" height="170" rx="4" fill="#050B14" stroke="#38BDF8" strokeWidth="1.4" />

              {/* SCADA Ekran Üst Komuta Barı */}
              <rect x="46" y="24" width="440" height="22" fill="#0F172A" />
              <rect x="52" y="28" width="66" height="14" rx="2" fill={vStyle.bg} />
              <text x="57" y="38" fill="#FFFFFF" className="font-mono text-[8.5px] font-bold">
                {vStyle.brand}
              </text>
              <text x="126" y="38" fill="#E2E8F0" className="font-mono text-[9.5px] font-bold">
                SCADA P&ID · {name.slice(0, 24)}
              </text>
              <text x="385" y="38" fill="#38BDF8" className="font-mono text-[9.5px] font-bold">
                {ip ?? "10.0.0.8"}
              </text>

              {/* Sol Panel: P&ID Reaktör Tankı + Boru Hattı + Dönen Pompa */}
              <rect x="56" y="54" width="142" height="128" rx="4" fill="#0B1324" stroke="#1E293B" />
              <text x="66" y="68" fill="#94A3B8" className="font-mono text-[8px] font-bold">
                REACTOR VESSEL TK-101
              </text>
              {/* Tank Gövdesi */}
              <rect x="68" y="76" width="54" height="76" rx="8" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.3" />
              <rect x="70" y="100" width="50" height="50" rx="6" fill="#0284C7" fillOpacity="0.75" />
              <text x="79" y="128" fill="#FFFFFF" className="font-mono text-[11px] font-bold">
                78.4%
              </text>
              <text x="77" y="166" fill="#34D399" className="font-mono text-[8px] font-bold">
                4.2 BAR · 68°C
              </text>
              {/* Boru Hattı & Sirkülasyon Pompası */}
              <path d="M 122 135 L 154 135 L 154 96 L 186 96" fill="none" stroke="#38BDF8" strokeWidth="3" />
              <circle cx="154" cy="135" r="12" fill="#0F172A" stroke="#10B981" strokeWidth="1.6" />
              <text x="145" y="138" fill="#34D399" className="font-mono text-[7.5px] font-bold">
                P-01
              </text>
              <text x="138" y="166" fill="#94A3B8" className="font-mono text-[7.5px]">
                1450 RPM
              </text>

              {/* Orta Panel: Çok Kanallı Canlı Proses Osiloskopu (Basınç / Debi / Akım) */}
              <rect x="206" y="54" width="166" height="128" rx="4" fill="#0B1324" stroke="#1E293B" />
              <text x="216" y="68" fill="#94A3B8" className="font-mono text-[8px] font-bold">
                PROCESS TELEMETRY TREND
              </text>
              {[84, 106, 128, 150].map((gy) => (
                <line key={gy} x1="214" y1={gy} x2="362" y2={gy} stroke="#1E293B" strokeWidth="0.8" strokeDasharray="2,2" />
              ))}
              <polyline
                points="214,132 232,114 250,121 268,94 286,105 304,88 322,98 340,84 362,91"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.2"
              />
              <polyline
                points="214,148 232,142 250,146 268,131 286,136 304,124 322,129 340,120 362,124"
                fill="none"
                stroke="#10B981"
                strokeWidth="1.8"
              />
              <text x="216" y="172" fill="#38BDF8" className="font-mono text-[7.5px] font-bold">
                ● SP: 4.5 BAR
              </text>
              <text x="296" y="172" fill="#34D399" className="font-mono text-[7.5px] font-bold">
                ● PV: 4.48 BAR
              </text>

              {/* Sağ Panel: PLC İletişim & Alarm Matrisi */}
              <rect x="380" y="54" width="98" height="128" rx="4" fill="#0B1324" stroke="#1E293B" />
              <text x="390" y="68" fill="#94A3B8" className="font-mono text-[8px] font-bold">
                PLC CONTROLLER
              </text>
              <circle cx="395" cy="84" r="4" fill="#10B981" />
              <text x="404" y="87" fill="#34D399" className="font-mono text-[8.5px] font-bold">
                LINK ACTIVE
              </text>
              <text x="390" y="104" fill="#E2E8F0" className="font-mono text-[8px]">
                {protocols.join(" / ").toUpperCase() || "MODBUS / S7"}
              </text>
              <rect x="390" y="114" width="78" height="22" rx="3" fill="#0284C7" />
              <text x="401" y="128" fill="#FFFFFF" className="font-mono text-[8px] font-bold">
                AUTO CASCADE
              </text>
              <rect x="390" y="144" width="78" height="22" rx="3" fill="#1E293B" stroke="#475569" />
              <text x="402" y="158" fill="#FBBF24" className="font-mono text-[8px] font-bold">
                ACK ALARMS
              </text>

              {/* Sağ Bezel Fiziksel Fonksiyon Tuşları (F1..F6) */}
              {[34, 62, 90, 118, 146, 172].map((y, idx) => (
                <g key={y} transform={`translate(502, ${y})`}>
                  <rect
                    x="0"
                    y="0"
                    width="38"
                    height="18"
                    rx="3"
                    fill="#0F172A"
                    stroke={idx === 0 ? "#10B981" : idx === 5 ? "#F43F5E" : "#64748B"}
                    strokeWidth="1.2"
                  />
                  <text x="12" y="12" fill="#CBD5E1" className="font-mono text-[8px] font-bold">
                    F{idx + 1}
                  </text>
                </g>
              ))}
            </svg>
          )}

          {(assetType === "scada_server" || assetType === "server") && (
            <svg viewBox="0 0 580 215" className="h-52 w-full select-none">
              {/* 2U Endüstriyel SCADA & Historian Raf Sunucusu */}
              <rect x="22" y="20" width="536" height="174" rx="5" fill="#1E293B" stroke="#64748B" strokeWidth="2" />
              {/* Sağ & Sol 19-inç Rack Kulakları ve Montaj Vidaları */}
              <rect x="6" y="20" width="16" height="174" rx="2" fill="#334155" stroke="#94A3B8" />
              <rect x="558" y="20" width="16" height="174" rx="2" fill="#334155" stroke="#94A3B8" />
              {[38, 107, 176].map((ry) => (
                <g key={ry}>
                  <circle cx="14" cy={ry} r="3.5" fill="#090D16" stroke="#64748B" />
                  <circle cx="566" cy={ry} r="3.5" fill="#090D16" stroke="#64748B" />
                </g>
              ))}

              {/* 8 Adet Hot-Swap NVMe / SAS RAID Disk Kızağı (Metalik Mandal + Aktif LED) */}
              {[36, 76, 116, 156, 196, 236, 276, 316].map((x, idx) => (
                <g key={x} transform={`translate(${x}, 34)`}>
                  <rect x="0" y="0" width="34" height="146" rx="3" fill="#090D16" stroke="#475569" strokeWidth="1.2" />
                  {/* Petek Havalandırma Izgarası */}
                  <rect x="5" y="14" width="24" height="84" rx="1.5" fill="#111827" stroke="#1E293B" />
                  {[22, 34, 46, 58, 70, 82].map((hy) => (
                    <line key={hy} x1="8" y1={hy} x2="26" y2={hy} stroke="#334155" strokeWidth="1.5" />
                  ))}
                  {/* Kızak Kilit Mandalı */}
                  <rect x="7" y="104" width="20" height="10" rx="1.5" fill="#2563EB" fillOpacity="0.4" stroke="#38BDF8" strokeWidth="0.8" />
                  <circle cx="11" cy="124" r="2.8" fill="#10B981" />
                  <circle cx="23" cy="124" r="2.8" fill={idx % 2 === 0 ? "#38BDF8" : "#10B981"} />
                  <text x="6" y="139" fill="#94A3B8" className="font-mono text-[7.5px] font-bold">
                    NVMe{idx}
                  </text>
                </g>
              ))}

              {/* Sağ: BMC / iDRAC OLED Telemetri Ekranı + Redundant 10GbE Portlar */}
              <rect x="364" y="34" width="180" height="78" rx="4" fill="#041824" stroke="#38BDF8" strokeWidth="1.4" />
              <text x="374" y="51" fill="#38BDF8" className="font-mono text-[9px] font-bold">
                {vStyle.brand} · SCADA HISTORIAN
              </text>
              <text x="374" y="69" fill="#FFFFFF" className="font-mono text-[12px] font-bold">
                IP: {ip ?? "10.10.5.128"}
              </text>
              <text x="374" y="84" fill="#34D399" className="font-mono text-[8.5px]">
                RAID-10 HEALTHY · DUAL PSU OK
              </text>
              <text x="374" y="99" fill="#94A3B8" className="font-mono text-[8px]">
                PROTO: {protocols.join("/").toUpperCase() || "OPCUA / MODBUS"}
              </text>

              {/* 4x 10GbE Ekranlı RJ45 / SFP+ Portu */}
              {[364, 410, 456, 502].map((x, idx) => (
                <g key={x} transform={`translate(${x}, 122)`}>
                  <rect x="0" y="0" width="40" height="58" rx="3" fill="#090D16" stroke="#64748B" />
                  <circle cx="10" cy="10" r="2.8" fill="#10B981" />
                  <circle cx="30" cy="10" r="2.8" fill="#38BDF8" />
                  <rect x="8" y="18" width="24" height="18" rx="1.5" fill="#1E293B" stroke="#94A3B8" />
                  <text x="8" y="49" fill="#CBD5E1" className="font-mono text-[8px] font-bold">
                    10G-{idx + 1}
                  </text>
                </g>
              ))}
            </svg>
          )}

          {assetType !== "plc" &&
            assetType !== "hmi" &&
            assetType !== "scada_server" &&
            assetType !== "server" && (
              <svg viewBox="0 0 580 215" className="h-52 w-full select-none">
                {/* Endüstriyel Yönetilebilir L2/L3 Switch & Mühendislik Düğümü Şasisi */}
                <rect x="18" y="20" width="544" height="174" rx="6" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.6" />
                {/* Sol OLED Durum & Cihaz Kimlik Ekranı */}
                <rect x="34" y="36" width="196" height="142" rx="4" fill="#041824" stroke="#38BDF8" strokeWidth="1.3" />
                <rect x="44" y="46" width="84" height="16" rx="2.5" fill={vStyle.bg} />
                <text x="50" y="57" fill="#FFFFFF" className="font-mono text-[9px] font-bold">
                  {vStyle.brand}
                </text>
                <text x="44" y="80" fill="#FFFFFF" className="font-mono text-[12px] font-bold">
                  {name.slice(0, 20)}
                </text>
                <text x="44" y="102" fill="#38BDF8" className="font-mono text-[11px] font-bold">
                  IP: {ip ?? "—"}
                </text>
                <text x="44" y="122" fill="#CBD5E1" className="font-mono text-[9px]">
                  MAC: {mac ?? "—"}
                </text>
                <text x="44" y="142" fill="#34D399" className="font-mono text-[8.5px] font-bold">
                  SPAN / RSTP RING · ONLINE
                </text>
                <polyline
                  points="44,166 64,156 84,163 104,152 124,160 144,150 164,158 184,149 214,155"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="1.5"
                />

                {/* Sağ 8x Bakır Pinli RJ45 + 2x SFP Fiber Port Matrisi */}
                {[0, 1, 2, 3].map((col) =>
                  [0, 1].map((row) => {
                    const px = 248 + col * 72;
                    const py = 36 + row * 74;
                    const pNum = col * 2 + row + 1;
                    const isOnline = pNum <= Math.max(2, defaultPorts.length);
                    return (
                      <g key={`${col}-${row}`} transform={`translate(${px}, ${py})`}>
                        <rect x="0" y="0" width="62" height="64" rx="3" fill="#090D16" stroke="#64748B" />
                        <circle cx="12" cy="10" r="2.8" fill={isOnline ? "#10B981" : "#334155"} />
                        <circle cx="50" cy="10" r="2.8" fill={isOnline ? "#38BDF8" : "#334155"} />
                        <rect x="14" y="18" width="34" height="22" rx="1.5" fill="#1E293B" stroke="#94A3B8" />
                        {[19, 24, 29, 34, 39, 43].map((pinX) => (
                          <line key={pinX} x1={pinX} y1="19" x2={pinX} y2="26" stroke="#F59E0B" strokeWidth="1" />
                        ))}
                        <text x="14" y="54" fill="#CBD5E1" className="font-mono text-[8px] font-bold">
                          GE 0/{pNum}
                        </text>
                      </g>
                    );
                  }),
                )}
              </svg>
            )}

          {/* Alt Fiziksel Kimlik & Seri Şeridi */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#1E293B] pt-2.5 font-mono text-[11px] text-slate-400">
            <span>
              {t("Donanım MAC", "Hardware MAC")}:{" "}
              <strong className="text-sky-300">
                <DecryptedText text={mac ?? "00:1B:1B:C4:09:A2"} />
              </strong>
            </span>
            <span>
              {t("Donanım Seri No", "Chassis S/N")}:{" "}
              <strong className="text-slate-200">
                <DecryptedText text={serial ?? "S-6ES7515-2AM02"} />
              </strong>
            </span>
          </div>
        </div>

        {/* Sağ 5 Sütun: Canlı Endüstriyel Port & Protokol Arayüz Matrisi */}
        <div className="flex flex-col justify-between rounded-[8px] border border-[#1E293B] bg-[#0B1120]/90 p-4 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold tracking-wider text-sky-400 uppercase">
                {t("Canlı Port & Protokol Arayüzleri", "Live Port & Protocol Interfaces")}
              </span>
              <span className="rounded-[4px] border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-300">
                {t(`${defaultPorts.length} Aktif L7 Port`, `${defaultPorts.length} Active L7 Ports`)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {t(
                "Pasif SPAN/PCAP trafiğinde bu cihaz üzerinde doğrulanan endüstriyel servis uçları",
                "Industrial service endpoints verified on this device in passive SPAN/PCAP traffic",
              )}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {defaultPorts.length === 0 ? (
                <div className="col-span-2 rounded-[6px] border border-[#1E293B] bg-[#060A12] p-3 text-center text-xs text-slate-400">
                  {t("Henüz uygulama katmanı portu gözlenmedi", "No application-layer ports observed yet")}
                </div>
              ) : (
                defaultPorts.map((p, idx) => (
                  <div
                    key={`${p.port}-${idx}`}
                    className="flex items-center justify-between rounded-[6px] border border-[#1E293B] bg-[#060A12] px-3 py-2.5 transition hover:border-sky-500/50"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10B981]" />
                        <span className="font-mono text-xs font-bold text-white">
                          TCP :{p.port}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] font-bold text-sky-400">
                        {p.proto}
                      </div>
                    </div>
                    <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300">
                      LINK UP
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Alt Canlı Sinyal Kalitesi & Çevrim Süresi Göstergesi */}
          <div className="mt-4 rounded-[6px] border border-[#1E293B] bg-[#060A12] p-3 text-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">
                {t("Pasif SPAN Sinyal Bütünlüğü", "Passive SPAN Signal Integrity")}
              </span>
              <span className="font-mono font-bold text-emerald-400">1000BASE-TX · 0 TX</span>
            </div>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((b) => (
                <div
                  key={b}
                  className={`h-2 flex-1 rounded-[1.5px] ${
                    b <= 13
                      ? "bg-gradient-to-t from-[#2563EB] to-[#38BDF8]"
                      : "bg-[#1E293B]"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}
