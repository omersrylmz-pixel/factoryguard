import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { useLang } from "../i18n";
import { api, apiDownload } from "../services/api";
import type {
  Asset,
  Page,
  RiskFinding,
  Sensor,
  SensorUploadAnalyzeResult,
} from "../types/api";
import { ASSET_TYPE_LABEL, Badge } from "./ui";

interface CmdItem {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  monoMeta?: string;
  badgeTone?: "teal" | "emerald" | "amber" | "red" | "navy";
  badgeText?: string;
  action: () => void | Promise<void>;
}

/**
 * Ctrl+K / Cmd+K Hızlı Komut & Arama Paleti (cmdk Stili Endüstriyel SOC Hızlı Erişim)
 * - IP, MAC, cihaz adı, üretici veya protokol ile doğrudan cihaza atlama
 * - CVE veya risk kuralı ile olay merkezine atlama
 * - Tek tuşla "7 Protokollü Karma OT PCAP Analiz Et (DPI)", "Envanter CSV İndir", "Koyu/Açık Mod" tetikleme
 */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { activeOrg } = useAuth();
  const { lang, setLang, theme, toggleTheme, t } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const assetsQuery = useQuery({
    queryKey: ["assets", activeOrg?.id, "cmdk"],
    queryFn: () => api<Page<Asset>>("/assets?limit=200"),
    enabled: !!activeOrg && open,
  });

  const risksQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "open"],
    queryFn: () => api<Page<RiskFinding>>("/risks?status=open&limit=200"),
    enabled: !!activeOrg && open,
  });

  const sensorsQuery = useQuery({
    queryKey: ["sensors", activeOrg?.id],
    queryFn: () => api<Sensor[]>("/sensors"),
    enabled: !!activeOrg && open,
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setStatusMsg(null);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const items = useMemo<CmdItem[]>(() => {
    const assets = assetsQuery.data?.items ?? [];
    const risks = risksQuery.data?.items ?? [];
    const primarySensor = sensorsQuery.data?.[0];

    const quickCommands: CmdItem[] = [
      {
        id: "cmd-pcap-dpi",
        group: t("Hızlı OT Komutları", "Quick OT Commands"),
        title: t(
          "⚡ 7 Protokollü Karma OT PCAP Analiz Et (L7 DPI)",
          "⚡ Analyze 7-Protocol Multi-Vendor OT PCAP (L7 DPI)",
        ),
        subtitle: t(
          "Modbus, S7comm, ENIP, OPC UA, BACnet, DNP3 ve PROFINET paketlerini sensör hattından geçir",
          "Run Modbus, S7comm, ENIP, OPC UA, BACnet, DNP3 & PROFINET frames through the sensor pipeline",
        ),
        monoMeta: "SPAN-DPI",
        badgeTone: "teal",
        badgeText: t("Tek Tıkla Çalıştır", "Run Now"),
        action: async () => {
          if (!primarySensor) {
            onClose();
            navigate("/sensors");
            return;
          }
          setStatusMsg(
            t("7 protokollü PCAP analiz ediliyor…", "Analyzing 7-protocol OT PCAP…"),
          );
          await api<SensorUploadAnalyzeResult>(
            `/sensors/${primarySensor.id}/analyze-upload`,
            {
              method: "POST",
              body: { sample: "multi-ot-pcap" },
            },
          );
          await qc.invalidateQueries();
          onClose();
          navigate("/sensors");
        },
      },
      {
        id: "cmd-export-csv",
        group: t("Hızlı OT Komutları", "Quick OT Commands"),
        title: t("↓ OT Cihaz Envanterini CSV Olarak İndir", "↓ Download OT Device Inventory CSV"),
        subtitle: t(
          "Tüm keşfedilen varlıkları Purdue katmanı ve doğrulama durumuyla dışa aktar",
          "Export all discovered assets with Purdue level and verification status",
        ),
        monoMeta: "CSV",
        badgeTone: "emerald",
        badgeText: "ISO/IEC 62443",
        action: async () => {
          await apiDownload("/reports/inventory?format=csv", "factoryguard-inventory.csv");
          onClose();
        },
      },
      {
        id: "cmd-toggle-theme",
        group: t("Hızlı OT Komutları", "Quick OT Commands"),
        title:
          theme === "dark"
            ? t("☀️ Açık Mühendislik Moduna Geç", "☀️ Switch to Light Engineering Mode")
            : t("🌙 Koyu SOC Komuta Moduna Geç", "🌙 Switch to Dark SOC Command Mode"),
        subtitle: t("Arayüz renk şemasını anında değiştir", "Toggle interface color scheme"),
        monoMeta: theme.toUpperCase(),
        action: () => {
          toggleTheme();
          onClose();
        },
      },
      {
        id: "cmd-toggle-lang",
        group: t("Hızlı OT Komutları", "Quick OT Commands"),
        title:
          lang === "tr"
            ? "🌐 Switch Interface Language to English (EN)"
            : "🌐 Arayüz Dilini Türkçeye Çevir (TR)",
        subtitle: t("Çift dilli terminoloji dönüşümü", "Bilingual terminology switch"),
        monoMeta: lang === "tr" ? "TR → EN" : "EN → TR",
        action: () => {
          setLang(lang === "tr" ? "en" : "tr");
          onClose();
        },
      },
    ];

    const navItems: CmdItem[] = [
      {
        id: "nav-dashboard",
        group: t("Ekranlar & Modüller", "Screens & Modules"),
        title: t("Genel Bakış & OT Komuta Merkezi", "Overview & OT Command Center"),
        subtitle: t("Canlı SPAN osiloskopu, güvenlik kadranı ve Purdue özeti", "Live SPAN oscilloscope, posture gauge & Purdue summary"),
        monoMeta: "/",
        action: () => {
          onClose();
          navigate("/");
        },
      },
      {
        id: "nav-topology",
        group: t("Ekranlar & Modüller", "Screens & Modules"),
        title: t("İnteraktif Ağ Topolojisi (React Flow & Blast Radius)", "Interactive Network Topology (React Flow & Blast Radius)"),
        subtitle: t("Purdue L1–L3 akış haritası, etki alanı analizi ve Conduit firewall üretici", "Purdue L1–L3 flow map, blast radius focus & Conduit firewall generator"),
        monoMeta: "/network",
        action: () => {
          onClose();
          navigate("/network");
        },
      },
      {
        id: "nav-assets",
        group: t("Ekranlar & Modüller", "Screens & Modules"),
        title: t("Cihaz Envanteri & CAD Dijital İkizler", "Device Inventory & CAD Digital Twins"),
        subtitle: t("PLC, HMI, SCADA ve Switch varlık listesi ve sağdan açılan inceleme çekmecesi", "PLC, HMI, SCADA & Switch asset inventory with slide-over drawer"),
        monoMeta: "/assets",
        action: () => {
          onClose();
          navigate("/assets");
        },
      },
      {
        id: "nav-risks",
        group: t("Ekranlar & Modüller", "Screens & Modules"),
        title: t("Olaylar, MITRE ATT&CK® ICS & CVE Kataloğu", "Events, MITRE ATT&CK® ICS & CVE Catalog"),
        subtitle: t("6 deterministik risk kuralı ve ICS-CERT firmware zafiyet eşleştirme", "6 deterministic risk rules and ICS-CERT firmware CVE matching"),
        monoMeta: "/risks",
        action: () => {
          onClose();
          navigate("/risks");
        },
      },
      {
        id: "nav-sensors",
        group: t("Ekranlar & Modüller", "Screens & Modules"),
        title: t("Pasif Sensörler, Canlı Paket Akışı & L7 Hex Çözümleyici", "Passive Sensors, Live Packet Stream & L7 Hex Dissector"),
        subtitle: t("PCAP sürükle-bırak analizi, durdurulabilir paket terminali ve Hex dökümü", "PCAP drag-and-drop analysis, live packet stream & Hex dump"),
        monoMeta: "/sensors",
        action: () => {
          onClose();
          navigate("/sensors");
        },
      },
      {
        id: "nav-reports",
        group: t("Ekranlar & Modüller", "Screens & Modules"),
        title: t("IEC 62443-3-3 Uyumluluk Matrisi & SIEM Raporları", "IEC 62443-3-3 Compliance Matrix & SIEM Reports"),
        subtitle: t("FR1–FR7 uyumluluk karnesi, PDF/CSV ve ArcSight CEF dışa aktarım", "FR1–FR7 compliance scorecard, PDF/CSV and ArcSight CEF export"),
        monoMeta: "/reports",
        action: () => {
          onClose();
          navigate("/reports");
        },
      },
    ];

    const assetItems: CmdItem[] = assets.map((a) => ({
      id: `asset-${a.id}`,
      group: t("Keşfedilen OT Cihazları (PLC / HMI / SCADA)", "Discovered OT Devices (PLC / HMI / SCADA)"),
      title: `${a.name || a.model || a.hostname || a.ip_address || "OT Node"} (${ASSET_TYPE_LABEL[a.asset_type]})`,
      subtitle: `${a.vendor || t("Doğrulanmamış Üretici", "Unverified Vendor")} · ${(a.observed_protocols ?? []).join(", ").toUpperCase() || "PASİF"}`,
      monoMeta: `${a.ip_address ?? "—"} · ${a.mac_address ?? ""}`,
      badgeTone: a.is_verified ? "emerald" : "amber",
      badgeText: a.is_verified ? t("Doğrulandı", "Verified") : t("Doğrulanmadı", "Unverified"),
      action: () => {
        onClose();
        navigate(`/assets/${a.id}`);
      },
    }));

    const riskItems: CmdItem[] = risks.slice(0, 25).map((r) => ({
      id: `risk-${r.id}`,
      group: t("Açık Risk Bulguları & CVE'ler", "Open Risk Findings & CVEs"),
      title: r.title,
      subtitle: `${r.rule_key} · ${r.asset_name ?? r.asset_ip ?? ""}`,
      monoMeta: `${r.score}/100 · ${r.asset_ip ?? ""}`,
      badgeTone: r.severity === "critical" || r.severity === "high" ? "red" : "amber",
      badgeText: r.severity.toUpperCase(),
      action: () => {
        onClose();
        navigate("/risks");
      },
    }));

    const all = [...quickCommands, ...navItems, ...assetItems, ...riskItems];
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...quickCommands, ...navItems, ...assetItems.slice(0, 6), ...riskItems.slice(0, 4)];
    }
    return all.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        (item.monoMeta ?? "").toLowerCase().includes(q),
    );
  }, [
    assetsQuery.data,
    risksQuery.data,
    sensorsQuery.data,
    query,
    theme,
    lang,
    t,
    navigate,
    onClose,
    qc,
    setLang,
    toggleTheme,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (items.length > 0 ? (i + 1) % items.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (items.length > 0 ? (i - 1 + items.length) % items.length : 0));
      } else if (e.key === "Enter" && items[activeIndex]) {
        e.preventDefault();
        void items[activeIndex].action();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, items, activeIndex, onClose]);

  if (!open) return null;

  // Gruplara göre sıralı liste
  const grouped = new Map<string, { item: CmdItem; globalIdx: number }[]>();
  items.forEach((item, idx) => {
    const list = grouped.get(item.group) ?? [];
    list.push({ item, globalIdx: idx });
    grouped.set(item.group, list);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 p-4 pt-[9vh] backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Hızlı Komut ve Arama Paleti", "Command & Search Palette")}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-[10px] border border-[#CBD5E1] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.65)] dark:border-[#2A364F] dark:bg-[#0F172A]"
      >
        {/* Üst Arama Girişi */}
        <div className="flex items-center gap-3 border-b border-[#E2E8F0] px-4 py-3 dark:border-[#1E293B]">
          <svg
            className="h-4 w-4 shrink-0 text-sky-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              "Komut çalıştır veya IP (10.0.0.9), MAC, PLC adı, Modbus, CVE ara…",
              "Type a command or search IP (10.0.0.9), MAC, PLC name, Modbus, CVE…",
            )}
            className="w-full bg-transparent text-xs font-medium text-[#1C2434] placeholder:text-[#64748B] focus:outline-none dark:text-[#F8FAFC]"
          />
          <kbd className="rounded border border-[#CBD5E1] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#64748B] dark:border-[#334155] dark:bg-[#1E293B] dark:text-[#94A3B8]">
            ESC
          </kbd>
        </div>

        {statusMsg && (
          <div className="border-b border-sky-500/30 bg-sky-500/10 px-4 py-2 font-mono text-xs text-sky-400">
            {statusMsg}
          </div>
        )}

        {/* Sonuç Listesi */}
        <div className="max-h-[62vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#64748B]">
              {t("Eşleşen cihaz, risk veya komut bulunamadı.", "No matching devices, risks or commands found.")}
            </div>
          ) : (
            Array.from(grouped.entries()).map(([groupTitle, entries]) => (
              <div key={groupTitle} className="mb-3 last:mb-0">
                <div className="px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-[#64748B] uppercase">
                  {groupTitle}
                </div>
                <div className="space-y-0.5">
                  {entries.map(({ item, globalIdx }) => {
                    const active = globalIdx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(globalIdx)}
                        onClick={() => void item.action()}
                        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-[6px] px-3 py-2 text-left text-xs transition-colors ${
                          active
                            ? "bg-[#2563EB]/15 text-[#1D4ED8] dark:bg-[#2563EB]/25 dark:text-white"
                            : "text-[#1C2434] hover:bg-[#F8FAFC] dark:text-[#E2E8F0] dark:hover:bg-[#161F30]"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{item.title}</div>
                          <div className="mt-0.5 truncate text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                            {item.subtitle}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {item.badgeText && (
                            <Badge tone={item.badgeTone ?? "teal"}>{item.badgeText}</Badge>
                          )}
                          {item.monoMeta && (
                            <span className="rounded bg-[#F1F5F9] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#1C2434] tabular-nums dark:bg-[#1E293B] dark:text-sky-300">
                              {item.monoMeta}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Alt Kısayol Rehberi */}
        <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-[11px] text-[#64748B] dark:border-[#1E293B] dark:bg-[#0B0F19]">
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <span>↑↓ {t("Seç", "Navigate")}</span>
            <span>↵ {t("Çalıştır / Aç", "Execute / Open")}</span>
            <span>ESC {t("Kapat", "Close")}</span>
          </div>
          <span className="font-mono text-[10px] text-sky-500">
            FactoryGuard Command Palette · Ctrl+K
          </span>
        </div>
      </div>
    </div>
  );
}
