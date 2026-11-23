import { useLang } from "../i18n";
import type { AssetType, Criticality } from "../types/api";

/**
 * Endüstriyel OT cihaz türlerine ve üreticilere (Siemens, Rockwell, Schneider, Wonderware, Omron vb.)
 * özel gerçekçi donanım şasisi (Digital Twin Front Panel) ve küçük cihaz görselleri (Thumbnail).
 *
 * Her cihaz türü birbirinden tamamen farklı, gerçek saha ekipmanı görünümüne sahiptir:
 * - PLC (`plc`): DIN raylı modüler kontrolcü, RUN/ERR/MAINT LED'leri, ön LCD tanı ekranı, I/O kanal LED'leri ve çift PROFINET/Modbus RJ45 portu
 * - HMI (`hmi`): Endüstriyel dokunmatik operatör paneli, canlı proses tank/vana/basınç grafiği ve durum LED'leri
 * - SCADA Sunucusu (`scada_server` / `server`): 2U endüstriyel raf tipi (rackmount) sunucu, disk yuvaları, çift PSU ve yüksek yoğunluklu Ethernet portları
 * - Ağ Cihazı (`network_device`): DIN raylı endüstriyel yönetilebilir Ethernet switch, 8x RJ45 + 2x SFP fiber uplink
 * - Mühendislik İstasyonu / Endüstriyel PC (`engineering_workstation` / `industrial_pc` / `computer`): Endüstriyel monitör + kasa, ekranda PLC ladder diyagramı
 * - Bilinmeyen / Doğrulanmamış (`unknown_device`): Pasif ağ radarı ve protokol analiz şasisi
 */

export function vendorAccentColor(vendor?: string | null): {
  brand: string;
  bg: string;
  text: string;
  accent: string;
} {
  const v = (vendor || "").toLowerCase();
  if (v.includes("siemens")) {
    return { brand: "SIEMENS", bg: "#009999", text: "#FFFFFF", accent: "#00B5B5" };
  }
  if (v.includes("rockwell") || v.includes("allen-bradley")) {
    return { brand: "ALLEN-BRADLEY", bg: "#C8102E", text: "#FFFFFF", accent: "#EF4444" };
  }
  if (v.includes("schneider") || v.includes("modicon")) {
    return { brand: "SCHNEIDER", bg: "#16A34A", text: "#FFFFFF", accent: "#22C55E" };
  }
  if (v.includes("wonderware") || v.includes("aveva")) {
    return { brand: "AVEVA / WONDERWARE", bg: "#2563EB", text: "#FFFFFF", accent: "#3B82F6" };
  }
  if (v.includes("omron")) {
    return { brand: "OMRON", bg: "#1D4ED8", text: "#FFFFFF", accent: "#60A5FA" };
  }
  if (v.includes("moxa") || v.includes("hirschmann") || v.includes("phoenix")) {
    return { brand: vendor!.toUpperCase(), bg: "#0F766E", text: "#FFFFFF", accent: "#14B8A6" };
  }
  return {
    brand: vendor ? vendor.toUpperCase() : "INDUSTRIAL OT",
    bg: "#334155",
    text: "#E2E8F0",
    accent: "#0D9488",
  };
}

/** Envanter tablosu ve listeler için cihaza özel gerçekçi küçük donanım görseli (52x40) */
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
  const vColor = vendorAccentColor(vendor);
  const statusDot =
    criticality === "critical" || criticality === "high"
      ? "#E11D48"
      : isVerified
        ? "#10B981"
        : "#F59E0B";

  return (
    <div className="relative flex h-10 w-13 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-slate-200 bg-gradient-to-b from-slate-800 to-slate-900 shadow-xs">
      {/* Üst Üretici / Durum Şeridi */}
      <div
        className="absolute top-0 right-0 left-0 h-1"
        style={{ backgroundColor: vColor.accent }}
      />

      {assetType === "plc" && (
        <svg viewBox="0 0 48 34" className="h-7 w-11">
          {/* DIN-Rail PLC Gövdesi */}
          <rect x="3" y="3" width="26" height="28" rx="2" fill="#1E293B" stroke="#475569" strokeWidth="1.2" />
          <rect x="29" y="3" width="16" height="28" rx="1.5" fill="#0F172A" stroke="#334155" strokeWidth="1" />
          {/* Ön LCD Ekran */}
          <rect x="6" y="10" width="15" height="9" rx="1" fill="#0D9488" fillOpacity="0.25" stroke="#14B8A6" strokeWidth="0.9" />
          <line x1="8" y1="13" x2="18" y2="13" stroke="#5EEAD4" strokeWidth="1" />
          <line x1="8" y1="16" x2="15" y2="16" stroke="#5EEAD4" strokeWidth="1" />
          {/* RUN / ERR / MAINT LED'leri */}
          <circle cx="7" cy="6.5" r="1.3" fill="#10B981" />
          <circle cx="11" cy="6.5" r="1.3" fill={statusDot} />
          <circle cx="15" cy="6.5" r="1.3" fill="#38BDF8" />
          {/* I/O Kanal LED'leri */}
          <circle cx="33" cy="8" r="1" fill="#10B981" />
          <circle cx="37" cy="8" r="1" fill="#10B981" />
          <circle cx="41" cy="8" r="1" fill="#F59E0B" />
          <circle cx="33" cy="13" r="1" fill="#10B981" />
          <circle cx="37" cy="13" r="1" fill="#475569" />
          <circle cx="41" cy="13" r="1" fill="#10B981" />
          {/* Alt RJ45 Portları */}
          <rect x="7" y="23" width="6" height="5" rx="0.8" fill="#0F172A" stroke="#64748B" strokeWidth="0.8" />
          <rect x="15" y="23" width="6" height="5" rx="0.8" fill="#0F172A" stroke="#64748B" strokeWidth="0.8" />
        </svg>
      )}

      {assetType === "hmi" && (
        <svg viewBox="0 0 48 34" className="h-7 w-11">
          {/* Endüstriyel Dokunmatik HMI Çerçevesi */}
          <rect x="3" y="4" width="42" height="26" rx="2.5" fill="#1E293B" stroke="#64748B" strokeWidth="1.3" />
          <rect x="6" y="7" width="32" height="20" rx="1" fill="#0F172A" stroke="#0D9488" strokeWidth="0.9" />
          {/* Canlı Proses Grafiği (Tank & Trend Çizgisi) */}
          <rect x="9" y="13" width="7" height="11" rx="1" fill="#1E293B" stroke="#38BDF8" strokeWidth="0.8" />
          <rect x="10" y="17" width="5" height="6" fill="#0D9488" />
          <polyline
            points="19,22 23,16 27,19 31,12 35,14"
            fill="none"
            stroke="#2DD4BF"
            strokeWidth="1.4"
          />
          {/* Sağ Dokunmatik Fonksiyon Tuşları */}
          <rect x="40" y="8" width="2.5" height="2.5" rx="0.5" fill="#10B981" />
          <rect x="40" y="13" width="2.5" height="2.5" rx="0.5" fill="#38BDF8" />
          <rect x="40" y="18" width="2.5" height="2.5" rx="0.5" fill={statusDot} />
        </svg>
      )}

      {(assetType === "scada_server" || assetType === "server") && (
        <svg viewBox="0 0 48 34" className="h-7 w-11">
          {/* 2U Rackmount SCADA Sunucu Kasası */}
          <rect x="2" y="5" width="44" height="11" rx="1.5" fill="#1E293B" stroke="#64748B" strokeWidth="1.1" />
          <rect x="2" y="18" width="44" height="11" rx="1.5" fill="#1E293B" stroke="#64748B" strokeWidth="1.1" />
          {/* Disk Yuvaları */}
          {[6, 12, 18, 24].map((x) => (
            <rect key={x} x={x} y="7.5" width="4.5" height="6" rx="0.6" fill="#0F172A" stroke="#475569" strokeWidth="0.7" />
          ))}
          {[6, 12, 18, 24].map((x) => (
            <rect key={x} x={x} y="20.5" width="4.5" height="6" rx="0.6" fill="#0F172A" stroke="#475569" strokeWidth="0.7" />
          ))}
          {/* Sağ Durum LED'leri */}
          <circle cx="35" cy="10.5" r="1.4" fill="#10B981" />
          <circle cx="40" cy="10.5" r="1.4" fill="#38BDF8" />
          <circle cx="35" cy="23.5" r="1.4" fill="#10B981" />
          <circle cx="40" cy="23.5" r="1.4" fill={statusDot} />
        </svg>
      )}

      {assetType === "network_device" && (
        <svg viewBox="0 0 48 34" className="h-7 w-11">
          {/* Endüstriyel Switch */}
          <rect x="3" y="8" width="42" height="18" rx="2" fill="#1E293B" stroke="#64748B" strokeWidth="1.2" />
          {[7, 13, 19, 25, 31, 37].map((x, i) => (
            <g key={x}>
              <rect x={x} y="14" width="4.5" height="6" rx="0.6" fill="#0F172A" stroke="#475569" strokeWidth="0.7" />
              <circle cx={x + 2.2} cy="11.5" r="1" fill={i % 3 === 0 ? "#10B981" : "#2DD4BF"} />
            </g>
          ))}
        </svg>
      )}

      {(assetType === "engineering_workstation" ||
        assetType === "industrial_pc" ||
        assetType === "computer") && (
        <svg viewBox="0 0 48 34" className="h-7 w-11">
          {/* Mühendislik İstasyonu Monitör + Kasa */}
          <rect x="5" y="4" width="26" height="18" rx="1.8" fill="#0F172A" stroke="#64748B" strokeWidth="1.2" />
          <line x1="9" y1="9" x2="27" y2="9" stroke="#2DD4BF" strokeWidth="1.2" />
          <line x1="9" y1="13" x2="23" y2="13" stroke="#38BDF8" strokeWidth="1.2" />
          <line x1="9" y1="17" x2="25" y2="17" stroke="#A7F3D0" strokeWidth="1.2" />
          <rect x="14" y="22" width="8" height="3" fill="#475569" />
          <rect x="10" y="25" width="16" height="2" rx="1" fill="#64748B" />
          {/* Sağ Kule Kasa */}
          <rect x="34" y="5" width="9" height="22" rx="1.5" fill="#1E293B" stroke="#64748B" strokeWidth="1.1" />
          <circle cx="38.5" cy="9" r="1.3" fill="#10B981" />
          <circle cx="38.5" cy="13" r="1.1" fill={statusDot} />
        </svg>
      )}

      {assetType === "unknown_device" && (
        <svg viewBox="0 0 48 34" className="h-7 w-11">
          {/* Pasif Gözlenen / Doğrulanmamış Saha Düğümü */}
          <rect x="5" y="5" width="38" height="24" rx="2.5" fill="#1E293B" stroke="#F59E0B" strokeWidth="1.1" strokeDasharray="3,2" />
          <circle cx="17" cy="17" r="6" fill="none" stroke="#F59E0B" strokeWidth="1.2" />
          <circle cx="17" cy="17" r="2" fill="#F59E0B" />
          <line x1="27" y1="12" x2="38" y2="12" stroke="#94A3B8" strokeWidth="1.3" />
          <line x1="27" y1="17" x2="36" y2="17" stroke="#FCD34D" strokeWidth="1.3" />
          <line x1="27" y1="22" x2="34" y2="22" stroke="#94A3B8" strokeWidth="1.3" />
        </svg>
      )}
    </div>
  );
}

/**
 * Cihaz Detay Sayfası (`AssetDetailPage.tsx`) için Büyük Endüstriyel Donanım Şasisi & Ön Panel
 * Dijital İkiz Görünümü (Hardware Digital Twin & Live Port Matrix).
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
  const { t } = useLang();
  const vStyle = vendorAccentColor(vendor);

  const defaultPorts =
    activePorts.length > 0
      ? activePorts.slice(0, 4)
      : protocols.slice(0, 4).map((p, idx) => ({
          port: p.toLowerCase().includes("modbus")
            ? 502
            : p.toLowerCase().includes("s7")
              ? 102
              : p.toLowerCase().includes("enip")
                ? 44818
                : p.toLowerCase().includes("opc")
                  ? 4840
                  : p.toLowerCase().includes("rdp")
                    ? 3389
                    : 1000 + idx,
          proto: p.replace(/\?+$/, "").toUpperCase(),
          direction: "bi",
        }));

  return (
    <div className="overflow-hidden rounded-[6px] border border-[#1E293B] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white shadow-lg">
      {/* Üst Endüstriyel Şasi Şeridi */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 bg-slate-900/70 px-5 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="rounded-[3px] px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider"
            style={{ backgroundColor: vStyle.bg, color: vStyle.text }}
          >
            {vStyle.brand}
          </span>
          <span className="font-semibold text-slate-200">
            {model || t("Endüstriyel Saha Ünitesi", "Industrial Field Unit")}
          </span>
          {firmware && (
            <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-300">
              FW v{firmware}
            </span>
          )}
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">
            {purdueLevel ?? "Purdue L1/L2"}
          </span>
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            PWR / RUN
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
                  ? "bg-rose-500"
                  : "bg-slate-600"
              }`}
            />
            ALM / SF
          </span>
          <span
            className={`inline-flex items-center gap-1.5 ${
              isVerified ? "text-teal-300" : "text-amber-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isVerified ? "bg-teal-400" : "bg-amber-400"
              }`}
            />
            {isVerified ? t("DOĞRULANDI", "VERIFIED") : t("DOĞRULANMADI", "UNVERIFIED")}
          </span>
        </div>
      </div>

      {/* Ana Gövde: Sol Gerçekçi Cihaz Ön Panel Çizimi + Sağ Canlı Port / Telemetri Matrisi */}
      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-12">
        {/* Sol 7 Sütun: Cihaz Türüne Özel Yüksek Detaylı Donanım Şasi Görseli */}
        <div className="flex flex-col justify-between rounded-[6px] border border-slate-700/80 bg-[#0B1120] p-4 lg:col-span-7">
          {assetType === "plc" && (
            <svg viewBox="0 0 520 190" className="h-44 w-full select-none">
              <defs>
                <linearGradient id="plc-body" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#1E293B" />
                </linearGradient>
                <linearGradient id="plc-lcd" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#042F2E" />
                  <stop offset="100%" stopColor="#0F766E" />
                </linearGradient>
              </defs>
              {/* DIN Rayı */}
              <rect x="6" y="76" width="508" height="38" rx="2" fill="#475569" stroke="#64748B" strokeWidth="1" />
              {/* 1. Modül: PSU (24V DC Güç Kaynağı) */}
              <rect x="20" y="14" width="82" height="162" rx="4" fill="url(#plc-body)" stroke="#64748B" strokeWidth="1.5" />
              <text x="30" y="32" className="fill-slate-300 font-mono text-[9px] font-bold">PM 24V/8A</text>
              <circle cx="34" cy="48" r="3.5" fill="#10B981" />
              <text x="43" y="51" className="fill-slate-300 font-mono text-[8px]">24V OK</text>
              <rect x="30" y="135" width="60" height="28" rx="2" fill="#0F172A" stroke="#475569" />
              <text x="38" y="152" className="fill-amber-400 font-mono text-[8px]">L+  M  PE</text>

              {/* 2. Modül: CPU / Ana PLC Kontrolcü (LCD Ekranlı) */}
              <rect x="108" y="14" width="185" height="162" rx="4" fill="url(#plc-body)" stroke="#14B8A6" strokeWidth="1.8" />
              <rect x="118" y="24" width="70" height="14" rx="2" fill={vStyle.bg} />
              <text x="123" y="34" className="fill-white font-mono text-[8.5px] font-bold">{vStyle.brand}</text>
              <text x="196" y="34" className="fill-slate-200 font-mono text-[9px] font-bold">
                {model ? model.slice(0, 14) : "CPU 1515-2 PN"}
              </text>

              {/* RUN / STOP / ERROR / MAINT LED Dizisi */}
              <g transform="translate(118, 46)">
                <rect x="0" y="0" width="165" height="18" rx="2" fill="#0F172A" stroke="#334155" />
                <circle cx="12" cy="9" r="3.5" fill="#10B981" />
                <text x="20" y="12" className="fill-emerald-300 font-mono text-[8px] font-bold">RUN</text>
                <circle cx="58" cy="9" r="3.5" fill={criticality === "critical" ? "#EF4444" : "#334155"} />
                <text x="66" y="12" className="fill-slate-400 font-mono text-[8px]">ERROR</text>
                <circle cx="114" cy="9" r="3.5" fill={!isVerified ? "#F59E0B" : "#334155"} />
                <text x="122" y="12" className="fill-amber-300 font-mono text-[8px]">MAINT</text>
              </g>

              {/* Ön Tanı LCD Ekranı */}
              <rect x="118" y="70" width="165" height="54" rx="3" fill="url(#plc-lcd)" stroke="#2DD4BF" strokeWidth="1.2" />
              <text x="126" y="85" className="fill-teal-200 font-mono text-[9px] font-bold">
                {name.slice(0, 22)}
              </text>
              <text x="126" y="100" className="fill-white font-mono text-[11px] font-bold">
                IP: {ip ?? "0.0.0.0"}
              </text>
              <text x="126" y="114" className="fill-teal-300 font-mono text-[8.5px]">
                FW: {firmware ? `V${firmware}` : "V2.9.2"} · {protocols.join("/").toUpperCase() || "MODBUS"}
              </text>

              {/* Çift Endüstriyel Ethernet / PROFINET RJ45 Portu */}
              <g transform="translate(118, 132)">
                <rect x="0" y="0" width="52" height="34" rx="2" fill="#0F172A" stroke="#64748B" />
                <circle cx="10" cy="8" r="2.5" fill="#10B981" />
                <circle cx="42" cy="8" r="2.5" fill="#F59E0B" />
                <rect x="14" y="13" width="24" height="15" rx="1" fill="#1E293B" stroke="#94A3B8" />
                <text x="14" y="31" className="fill-slate-400 font-mono text-[7px]">X1 P1R</text>

                <rect x="60" y="0" width="52" height="34" rx="2" fill="#0F172A" stroke="#64748B" />
                <circle cx="70" cy="8" r="2.5" fill="#10B981" />
                <circle cx="102" cy="8" r="2.5" fill="#10B981" />
                <rect x="74" y="13" width="24" height="15" rx="1" fill="#1E293B" stroke="#94A3B8" />
                <text x="74" y="31" className="fill-slate-400 font-mono text-[7px]">X2 P2R</text>
              </g>

              {/* 3. ve 4. Modül: Dijital & Analog I/O Sinyal Modülleri */}
              {[300, 402].map((xPos, modIdx) => (
                <g key={xPos} transform={`translate(${xPos}, 14)`}>
                  <rect x="0" y="0" width="94" height="162" rx="4" fill="url(#plc-body)" stroke="#64748B" strokeWidth="1.5" />
                  <text x="10" y="18" className="fill-slate-300 font-mono text-[8.5px] font-bold">
                    {modIdx === 0 ? "DI 16x24VDC" : "DQ 16x24VDC/0.5A"}
                  </text>
                  <rect x="10" y="28" width="74" height="122" rx="2" fill="#0F172A" stroke="#334155" />
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((ch) => (
                    <g key={ch} transform={`translate(16, ${36 + ch * 13.5})`}>
                      <circle
                        cx="4"
                        cy="4"
                        r="2.6"
                        fill={(ch + modIdx) % 3 === 0 ? "#475569" : "#10B981"}
                      />
                      <text x="12" y="7" className="fill-slate-400 font-mono text-[7.5px]">
                        .{ch}
                      </text>
                      <circle
                        cx="38"
                        cy="4"
                        r="2.6"
                        fill={(ch + modIdx) % 2 === 0 ? "#10B981" : "#F59E0B"}
                      />
                      <text x="46" y="7" className="fill-slate-400 font-mono text-[7.5px]">
                        .{ch + 8}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
            </svg>
          )}

          {assetType === "hmi" && (
            <svg viewBox="0 0 520 190" className="h-44 w-full select-none">
              {/* Endüstriyel Dokunmatik Operatör Paneli (SIMATIC HMI Comfort) */}
              <rect x="30" y="10" width="460" height="170" rx="10" fill="#334155" stroke="#94A3B8" strokeWidth="2.5" />
              <rect x="48" y="24" width="388" height="142" rx="4" fill="#09101D" stroke="#14B8A6" strokeWidth="1.5" />

              {/* HMI Ekran Üst Durum Çubuğu */}
              <rect x="50" y="26" width="384" height="20" fill="#1E293B" />
              <text x="60" y="39" className="fill-teal-300 font-mono text-[9.5px] font-bold">
                {vStyle.brand} HMI · {name.slice(0, 26)}
              </text>
              <text x="340" y="39" className="fill-white font-mono text-[9.5px] font-bold">
                {ip ?? "10.0.0.8"}
              </text>

              {/* Sol: Proses Tankı & Seviye Göstergesi */}
              <rect x="64" y="56" width="95" height="96" rx="4" fill="#0F172A" stroke="#334155" />
              <text x="74" y="70" className="fill-slate-400 font-mono text-[8px]">TANK-01 LEVEL</text>
              <rect x="82" y="78" width="56" height="58" rx="4" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.2" />
              <rect x="84" y="96" width="52" height="38" rx="2" fill="#0D9488" fillOpacity="0.8" />
              <text x="96" y="118" className="fill-white font-mono text-[11px] font-bold">74.2%</text>

              {/* Orta: Canlı Basınç / Sıcaklık Trend Grafiği */}
              <rect x="170" y="56" width="152" height="96" rx="4" fill="#0F172A" stroke="#334155" />
              <text x="180" y="70" className="fill-slate-400 font-mono text-[8px]">LINE PRESSURE & FLOW</text>
              <polyline
                points="180,130 200,115 220,122 240,95 260,104 280,86 310,92"
                fill="none"
                stroke="#2DD4BF"
                strokeWidth="2.2"
              />
              <polyline
                points="180,140 200,135 220,138 240,126 260,130 280,118 310,122"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.5"
              />

              {/* Sağ: Aktif Protokol & PLC Bağlantı Kutusu */}
              <rect x="332" y="56" width="92" height="96" rx="4" fill="#0F172A" stroke="#334155" />
              <text x="342" y="70" className="fill-slate-400 font-mono text-[8px]">PLC LINK</text>
              <circle cx="348" cy="86" r="4" fill="#10B981" />
              <text x="358" y="89" className="fill-emerald-300 font-mono text-[9px] font-bold">ONLINE</text>
              <text x="342" y="108" className="fill-slate-300 font-mono text-[8.5px]">
                {protocols.join(", ").toUpperCase() || "MODBUS"}
              </text>
              <rect x="342" y="122" width="72" height="18" rx="2" fill="#0D9488" />
              <text x="355" y="134" className="fill-white font-mono text-[8px] font-bold">AUTO MODE</text>

              {/* Sağ Çerçeve Fiziksel Fonksiyon Tuşları */}
              {[38, 66, 94, 122, 148].map((y, idx) => (
                <rect
                  key={y}
                  x="448"
                  y={y}
                  width="24"
                  height="16"
                  rx="2.5"
                  fill="#1E293B"
                  stroke={idx === 0 ? "#10B981" : "#64748B"}
                  strokeWidth="1.2"
                />
              ))}
            </svg>
          )}

          {(assetType === "scada_server" || assetType === "server") && (
            <svg viewBox="0 0 520 190" className="h-44 w-full select-none">
              {/* 2U Endüstriyel SCADA Raf Sunucusu */}
              <rect x="16" y="24" width="488" height="142" rx="5" fill="#1E293B" stroke="#64748B" strokeWidth="2" />
              {/* Raf Kulakları */}
              <rect x="6" y="24" width="12" height="142" rx="2" fill="#334155" stroke="#64748B" />
              <circle cx="12" cy="42" r="3" fill="#0F172A" />
              <circle cx="12" cy="148" r="3" fill="#0F172A" />
              <rect x="502" y="24" width="12" height="142" rx="2" fill="#334155" stroke="#64748B" />
              <circle cx="508" cy="42" r="3" fill="#0F172A" />
              <circle cx="508" cy="148" r="3" fill="#0F172A" />

              {/* 8 Adet Hot-Swap NVMe / SAS RAID Disk Yuvası */}
              {[32, 68, 104, 140, 176, 212, 248, 284].map((x, idx) => (
                <g key={x} transform={`translate(${x}, 38)`}>
                  <rect x="0" y="0" width="30" height="114" rx="2.5" fill="#0F172A" stroke="#475569" strokeWidth="1.2" />
                  <rect x="5" y="14" width="20" height="65" rx="1" fill="#1E293B" />
                  <circle cx="10" cy="92" r="2.5" fill="#10B981" />
                  <circle cx="20" cy="92" r="2.5" fill={idx % 2 === 0 ? "#38BDF8" : "#0D9488"} />
                  <text x="6" y="107" className="fill-slate-400 font-mono text-[7px]">BAY{idx}</text>
                </g>
              ))}

              {/* Sağ Ön LCD Tanı Ekranı ve Redundant PSU/NIC Paneli */}
              <rect x="330" y="38" width="158" height="58" rx="3" fill="#042F2E" stroke="#14B8A6" strokeWidth="1.3" />
              <text x="340" y="54" className="fill-teal-200 font-mono text-[9px] font-bold">
                {vStyle.brand}
              </text>
              <text x="340" y="70" className="fill-white font-mono text-[11px] font-bold">
                {ip ?? "10.10.5.128"}
              </text>
              <text x="340" y="85" className="fill-teal-300 font-mono text-[8.5px]">
                RAID10 OK · {protocols.join("/").toUpperCase() || "MODBUS/RDP"}
              </text>

              {/* 4x 10GbE / OT Ağ Portu */}
              {[330, 370, 410, 450].map((x, idx) => (
                <g key={x} transform={`translate(${x}, 106)`}>
                  <rect x="0" y="0" width="34" height="44" rx="2" fill="#0F172A" stroke="#64748B" />
                  <circle cx="8" cy="8" r="2.5" fill="#10B981" />
                  <circle cx="26" cy="8" r="2.5" fill="#38BDF8" />
                  <rect x="7" y="15" width="20" height="14" rx="1" fill="#1E293B" stroke="#94A3B8" />
                  <text x="7" y="39" className="fill-slate-400 font-mono text-[7.5px]">ETH{idx + 1}</text>
                </g>
              ))}
            </svg>
          )}

          {assetType !== "plc" &&
            assetType !== "hmi" &&
            assetType !== "scada_server" &&
            assetType !== "server" && (
              <svg viewBox="0 0 520 190" className="h-44 w-full select-none">
                {/* Endüstriyel Ağ Switch / Mühendislik İstasyonu / Saha Ünitesi Şasisi */}
                <rect x="20" y="26" width="480" height="138" rx="6" fill="#1E293B" stroke="#14B8A6" strokeWidth="1.6" />
                <rect x="36" y="42" width="180" height="106" rx="4" fill="#042F2E" stroke="#2DD4BF" strokeWidth="1.2" />
                <text x="48" y="62" className="fill-teal-200 font-mono text-[9.5px] font-bold">
                  {vStyle.brand}
                </text>
                <text x="48" y="82" className="fill-white font-mono text-[12px] font-bold">
                  {name.slice(0, 20)}
                </text>
                <text x="48" y="102" className="fill-teal-300 font-mono text-[10.5px] font-bold">
                  IP: {ip ?? "—"}
                </text>
                <text x="48" y="122" className="fill-slate-300 font-mono text-[8.5px]">
                  MAC: {mac ?? "—"}
                </text>

                {/* 8 Portlu Endüstriyel Ethernet & SFP Matrisi */}
                {[0, 1, 2, 3].map((col) =>
                  [0, 1].map((row) => {
                    const px = 236 + col * 62;
                    const py = 44 + row * 54;
                    const pNum = col * 2 + row + 1;
                    return (
                      <g key={`${col}-${row}`} transform={`translate(${px}, ${py})`}>
                        <rect x="0" y="0" width="52" height="44" rx="2.5" fill="#0F172A" stroke="#64748B" />
                        <circle cx="10" cy="8" r="2.5" fill="#10B981" />
                        <circle cx="42" cy="8" r="2.5" fill={pNum <= 3 ? "#2DD4BF" : "#475569"} />
                        <rect x="13" y="14" width="26" height="16" rx="1" fill="#1E293B" stroke="#94A3B8" />
                        <text x="15" y="39" className="fill-slate-400 font-mono text-[7.5px]">
                          PORT {pNum}
                        </text>
                      </g>
                    );
                  }),
                )}
              </svg>
            )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2.5 font-mono text-[11px] text-slate-400">
            <span>
              {t("Fiziksel MAC", "Physical MAC")}: <strong className="text-slate-200">{mac ?? "—"}</strong>
            </span>
            <span>
              {t("Seri No", "Serial")}: <strong className="text-slate-200">{serial ?? t("Pasif Keşif", "Passive Discovery")}</strong>
            </span>
          </div>
        </div>

        {/* Sağ 5 Sütun: Canlı Endüstriyel Port & Protokol Arayüz Matrisi */}
        <div className="flex flex-col justify-between rounded-[6px] border border-slate-700/80 bg-slate-900/60 p-4 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-teal-300 uppercase">
                {t("Canlı Port & Protokol Arayüzleri", "Live Port & Protocol Interfaces")}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                {t(`${defaultPorts.length} Aktif Port`, `${defaultPorts.length} Active Ports`)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {t(
                "Pasif SPAN/PCAP trafiğinde bu cihaz üzerinde gözlemlenen endüstriyel portlar",
                "Industrial ports observed on this device in passive SPAN/PCAP traffic",
              )}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {defaultPorts.length === 0 ? (
                <div className="col-span-2 rounded border border-slate-800 bg-slate-950/60 p-3 text-center text-xs text-slate-400">
                  {t("Henüz uygulama katmanı portu gözlenmedi", "No application-layer ports observed yet")}
                </div>
              ) : (
                defaultPorts.map((p, idx) => (
                  <div
                    key={`${p.port}-${idx}`}
                    className="flex items-center justify-between rounded-[4px] border border-slate-700/80 bg-[#0B1120] px-3 py-2"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="font-mono text-xs font-bold text-white">
                          :{p.port}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] font-semibold text-teal-300">
                        {p.proto}
                      </div>
                    </div>
                    <span className="rounded border border-slate-700 bg-slate-800/90 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-300">
                      LINK UP
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-[4px] border border-slate-700/70 bg-[#0B1120] p-3 text-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{t("Pasif Telemetri Durumu", "Passive Telemetry State")}</span>
              <span className="font-mono font-semibold text-emerald-400">ONLINE · SPAN</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((b) => (
                <div
                  key={b}
                  className={`h-1.5 flex-1 rounded-full ${
                    b <= 9 ? "bg-teal-500" : "bg-slate-700"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
