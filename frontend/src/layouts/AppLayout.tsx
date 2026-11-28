import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { CommandPalette } from "../components/CommandPalette";
import { StaggerStage, useLenisSmoothScroll } from "../components/reactBits";
import { CriticalityBadge, ROLE_LABEL, formatDate } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useLang } from "../i18n";
import { api } from "../services/api";
import type { Page, RiskFinding, Sensor } from "../types/api";

interface SidebarItem {
  to: string;
  label: string;
  icon: "dashboard" | "inventory" | "topology" | "events" | "sensors" | "pcap" | "reports" | "settings";
  badge?: number;
  badgeTone?: "teal" | "amber" | "red";
}

function SidebarIcon({ name }: { name: SidebarItem["icon"] }) {
  switch (name) {
    case "dashboard":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "inventory":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2" y="4" width="20" height="6" rx="1.5" />
          <rect x="2" y="14" width="20" height="6" rx="1.5" />
          <circle cx="6" cy="7" r="1" fill="currentColor" />
          <circle cx="6" cy="17" r="1" fill="currentColor" />
        </svg>
      );
    case "topology":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="12" cy="18" r="3" />
          <path d="M8.5 7.5L10.5 15.5M15.5 7.5L13.5 15.5M9 6h6" />
        </svg>
      );
    case "events":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "sensors":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "pcap":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      );
    case "reports":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "settings":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

export default function AppLayout() {
  const { user, organizations, activeOrg, setActiveOrg, logout } = useAuth();
  const { lang, setLang, theme, toggleTheme, t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [globalSearch, setGlobalSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  useLenisSmoothScroll(scrollWrapperRef);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sensorsQuery = useQuery({
    queryKey: ["sensors", activeOrg?.id],
    queryFn: () => api<Sensor[]>("/sensors"),
    enabled: !!activeOrg,
  });

  const openRisksQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "open"],
    queryFn: () => api<Page<RiskFinding>>("/risks?status=open&limit=200"),
    enabled: !!activeOrg,
  });

  const openRiskCount = openRisksQuery.data?.total ?? 0;
  const topOpenRisks = [...(openRisksQuery.data?.items ?? [])]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const activeSensorCount = (sensorsQuery.data ?? []).filter((s) => s.is_connected).length;
  const totalSensorCount = (sensorsQuery.data ?? []).length;

  const MENU_GROUPS: { title: string; items: SidebarItem[] }[] = [
    {
      title: t("Görünürlük & Envanter", "Visibility & Inventory"),
      items: [
        { to: "/", label: t("Genel Bakış", "Overview"), icon: "dashboard" },
        { to: "/assets", label: t("Cihaz Envanteri", "Device Inventory"), icon: "inventory" },
        { to: "/network", label: t("Ağ Topolojisi", "Network Topology"), icon: "topology" },
      ],
    },
    {
      title: t("Tespit & İzleme", "Detection & Monitoring"),
      items: [
        {
          to: "/risks",
          label: t("Olaylar & Risk Bulguları", "Events & Risk Findings"),
          icon: "events",
          badge: openRiskCount,
          badgeTone: openRiskCount > 0 ? "amber" : "teal",
        },
        {
          to: "/sensors",
          label: t("Sensörler & PCAP Analizi", "Sensors & PCAP Analysis"),
          icon: "sensors",
          badge: totalSensorCount,
          badgeTone: "teal",
        },
      ],
    },
    {
      title: t("Raporlama & Yönetişim", "Reporting & Governance"),
      items: [
        { to: "/reports", label: t("Raporlar & SIEM", "Reports & SIEM"), icon: "reports" },
        { to: "/settings", label: t("Ayarlar & Bölgeler", "Settings & Zones"), icon: "settings" },
      ],
    },
  ];

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const q = globalSearch.trim();
    navigate(q ? `/assets?q=${encodeURIComponent(q)}` : "/assets");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F1F5F9] text-[#1C2434]">
      {/* Endüstriyel Karbon Sol Kenar Çubuğu */}
      <aside
        className={`${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-white/[0.08] bg-[#09090B] text-zinc-300 transition-transform duration-200 lg:static lg:translate-x-0`}
      >
        {/* Marka Başlığı */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-blue-500/40 bg-blue-600 text-white">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white">FactoryGuard</div>
              <div className="font-mono text-[9.5px] font-medium tracking-wider text-zinc-400 uppercase">
                {t("OT KOMUTA & RİSK", "OT COMMAND & RISK")}
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="text-zinc-400 hover:text-white lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* Menü Grupları */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <nav className="space-y-5">
            {MENU_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="mb-2 px-3 font-mono text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                  {group.title}
                </h3>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const isAssetDetail =
                      item.to === "/assets" && location.pathname.startsWith("/assets/");
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.to === "/"}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) => {
                            const active = isActive || isAssetDetail;
                            return `group relative flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-all ${
                              active
                                ? "border border-white/[0.1] bg-[#18181B] text-white"
                                : "border border-transparent text-zinc-400 hover:bg-[#141417] hover:text-zinc-100"
                            }`;
                          }}
                        >
                          {({ isActive }) => {
                            const active = isActive || isAssetDetail;
                            return (
                              <>
                                {active && (
                                  <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-blue-500" />
                                )}
                                <span className="flex items-center gap-2.5">
                                  <span className={active ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-200"}>
                                    <SidebarIcon name={item.icon} />
                                  </span>
                                  <span>{item.label}</span>
                                </span>
                                {item.badge !== undefined && item.badge > 0 && (
                                  <span
                                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                                      item.badgeTone === "amber"
                                        ? "border border-amber-500/25 bg-amber-500/10 text-amber-400"
                                        : "border border-white/[0.1] bg-[#18181B] text-zinc-300"
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                              </>
                            );
                          }}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Alt Pasif Gözlem Güvenlik Garantisi Kartı */}
        <div className="border-t border-white/[0.08] p-3.5">
          <div className="rounded-md border border-white/[0.08] bg-[#111113] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-100">
                {t("Yalnızca Pasif Gözlem", "Passive Observation")}
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t("GÜVENLİ", "SAFE")}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[10px] text-zinc-400">
              <span>{t("Aktif sensör", "Active sensors")}</span>
              <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                {activeSensorCount}/{totalSensorCount} · 0 Tx
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Sağ İçerik Sütunu: TailAdmin Üst Beyaz Header + Ana İçerik Tuvali (Lenis Smooth Scroll) */}
      <div
        ref={scrollWrapperRef}
        className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto"
      >
        <div className="flex min-h-full flex-col">
        {/* Keskin Endüstriyel Üst Başlık Çubuğu (Topbar) */}
        <header className="sticky top-0 z-30 flex h-13 w-full items-center justify-between gap-4 border-b border-zinc-200 bg-white px-5 dark:border-white/[0.08] dark:bg-[#111113]">
          {/* Sol: Mobil Menü + Geniş Arama Kutusu (w-64 / w-80, kesilmeyen metin) */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-md border border-zinc-200 p-1.5 text-zinc-800 lg:hidden dark:border-white/[0.08] dark:text-zinc-200"
              title={t("Menüyü aç", "Open menu")}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <form onSubmit={handleSearchSubmit} className="w-60 sm:w-72 md:w-80">
              <div className="relative flex items-center">
                <svg
                  className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder={t(
                    "Cihaz, IP, MAC veya protokol ara...",
                    "Search device, IP, MAC or protocol...",
                  )}
                  className="h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 pr-16 pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/[0.08] dark:bg-[#18181B] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setCmdkOpen(true)}
                  title={t("Hızlı Komut Paletini Aç (Ctrl+K)", "Open Command Palette (Ctrl+K)")}
                  className="absolute right-1.5 inline-flex cursor-pointer items-center rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-500 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-[#111113] dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Ctrl+K
                </button>
              </div>
            </form>
          </div>

          {/* Sağ: İkon Tema/Dil Butonları, Bildirim Zili ve Şirket/Kullanıcı Profil Bloğu */}
          <div className="flex items-center gap-2">
            {/* Çoklu Organizasyon Seçici (Yalnızca birden fazla organizasyon varsa) */}
            {organizations.length > 1 && (
              <select
                aria-label="Organizasyon"
                className="h-8 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#18181B] dark:text-zinc-200"
                value={activeOrg?.id ?? ""}
                onChange={(e) => setActiveOrg(e.target.value)}
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}

            {/* Kompakt İkon Tema Butonu (☀️ / 🌙) */}
            <button
              type="button"
              onClick={toggleTheme}
              title={
                theme === "dark"
                  ? t("Açık Moda Geç", "Switch to Light Mode")
                  : t("Koyu Moda Geç", "Switch to Dark Mode")
              }
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-100 dark:border-white/[0.08] dark:bg-[#18181B] dark:text-zinc-300 dark:hover:border-white/[0.16] dark:hover:text-white"
            >
              {theme === "dark" ? (
                <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Kompakt İkon Dil Butonu (Tek tıkla TR ⇄ EN) */}
            <button
              type="button"
              onClick={() => setLang(lang === "tr" ? "en" : "tr")}
              title={t("Dili Değiştir (TR / EN)", "Toggle Language (TR / EN)")}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 font-mono text-[11px] font-semibold text-zinc-700 uppercase transition hover:bg-zinc-100 dark:border-white/[0.08] dark:bg-[#18181B] dark:text-zinc-300 dark:hover:border-white/[0.16] dark:hover:text-white"
            >
              <svg className="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>{lang}</span>
            </button>

            {/* Bildirim Zili & Açılır Canlı Uyarı Çekmecesi */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((v) => !v)}
                aria-expanded={notificationsOpen}
                title={t(`${openRiskCount} açık risk bulgusu`, `${openRiskCount} open risk findings`)}
                className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border transition ${
                  notificationsOpen
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-500"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-[#18181B] dark:text-zinc-300 dark:hover:border-white/[0.16] dark:hover:text-white"
                }`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {openRiskCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[9px] font-bold text-white tabular-nums">
                    {openRiskCount > 99 ? "99+" : openRiskCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 z-50 mt-2 w-88 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl sm:w-96 dark:border-white/[0.08] dark:bg-[#111113]">
                  <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-900 px-4 py-2.5 text-white dark:border-white/[0.08] dark:bg-[#18181B]">
                    <div>
                      <div className="text-xs font-semibold">
                        {t("Canlı OT Güvenlik Bildirimleri", "Live OT Security Notifications")}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {t(
                          `${openRiskCount} açık bulgu · En yüksek öncelikliler`,
                          `${openRiskCount} open findings · Highest priority`,
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  {topOpenRisks.length === 0 ? (
                    <div className="p-5 text-center text-xs text-zinc-500">
                      {t("Açık risk bildirimi bulunmuyor.", "No open risk notifications.")}
                    </div>
                  ) : (
                    <div className="max-h-80 divide-y divide-zinc-200 overflow-y-auto dark:divide-white/[0.07]">
                      {topOpenRisks.map((rf) => (
                        <div
                          key={rf.id}
                          onClick={() => {
                            setNotificationsOpen(false);
                            navigate("/risks");
                          }}
                          className="cursor-pointer px-4 py-2.5 text-xs transition hover:bg-[#F8FAFC]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <CriticalityBadge value={rf.severity} />
                              <span className="font-mono font-bold text-[#1C2434] tabular-nums">
                                {rf.score}/100
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-[#64748B] tabular-nums">
                              {formatDate(rf.last_seen_at)}
                            </span>
                          </div>
                          <div className="mt-1 font-semibold text-[#1C2434]">{rf.title}</div>
                          <div className="mt-0.5 flex items-center justify-between font-mono text-[11px] text-[#64748B]">
                            <span>{rf.rule_key}</span>
                            {rf.asset_ip && (
                              <span className="font-semibold text-emerald-500 tabular-nums">
                                {rf.asset_ip}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs dark:border-white/[0.08] dark:bg-[#18181B]">
                    <Link
                      to="/network"
                      onClick={() => setNotificationsOpen(false)}
                      className="font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                    >
                      {t("Topoloji Haritası", "Topology Map")}
                    </Link>
                    <Link
                      to="/risks"
                      onClick={() => setNotificationsOpen(false)}
                      className="font-semibold text-blue-500 hover:underline"
                    >
                      {t(`Tüm Bulguları İncele (${openRiskCount}) →`, `Inspect All Findings (${openRiskCount}) →`)}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Kullanıcı Profili + Tek Satırda Temiz Şirket Adı + Çıkış */}
            <div className="flex items-center gap-2.5 border-l border-zinc-200 pl-3 dark:border-white/[0.08]">
              <div className="hidden text-right sm:block">
                <div className="whitespace-nowrap text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {(user?.full_name ?? t("OT Kullanıcısı", "OT User")).replace(/\s*\(.*\)\s*$/, "")}
                </div>
                <div className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>{activeOrg?.name ?? "—"}</span>
                  <span>·</span>
                  <span>{activeOrg ? ROLE_LABEL[activeOrg.role] : ROLE_LABEL.analyst}</span>
                </div>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-[#18181B] font-mono text-[11px] font-bold text-zinc-200">
                {(user?.full_name ?? "FG")
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="h-8 cursor-pointer rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-500 dark:border-white/[0.08] dark:bg-[#18181B] dark:text-zinc-300"
              >
                {t("Çıkış", "Sign out")}
              </button>
            </div>
          </div>
        </header>

        {/* Ana İçerik Alanı (GSAP StaggerStage Sahne Geçişi ile) */}
        <main className="mx-auto w-full max-w-screen-2xl flex-1 p-5 md:p-6">
          {activeOrg ? (
            <StaggerStage stageKey={`${location.pathname}:${lang}`}>
              <Outlet />
            </StaggerStage>
          ) : (
            <div className="rounded-[4px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {t(
                "Herhangi bir organizasyona üye değilsiniz. Yöneticinizden davet isteyin.",
                "You are not a member of any organization. Ask your administrator for an invite.",
              )}
            </div>
          )}
        </main>
        </div>
      </div>

      {/* Global Ctrl+K Hızlı Komut & Arama Paleti */}
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
    </div>
  );
}
