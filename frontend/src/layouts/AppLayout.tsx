import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { StaggerStage, useLenisSmoothScroll } from "../components/reactBits";
import { CriticalityBadge, ROLE_LABEL, formatDate } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useLang } from "../i18n";
import { api } from "../services/api";
import type { Page, RiskFinding, Sensor, Site } from "../types/api";

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
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  useLenisSmoothScroll(scrollWrapperRef);

  const sitesQuery = useQuery({
    queryKey: ["sites", activeOrg?.id],
    queryFn: () => api<Site[]>("/sites"),
    enabled: !!activeOrg,
  });

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
  const primarySite = sitesQuery.data?.[0];

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
      {/* Endüstriyel Komuta Sol Kenar Çubuğu */}
      <aside
        className={`${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-[#1E293B] bg-[#0B1120] text-[#DEE4EE] transition-transform duration-200 lg:static lg:translate-x-0`}
      >
        {/* Marka Başlığı */}
        <div className="flex items-center justify-between border-b border-[#1E293B] px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[5px] border border-blue-400/30 bg-gradient-to-br from-[#2563EB] to-[#0284C7] text-white shadow-[0_2px_10px_rgba(37,99,235,0.35)]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-white">FactoryGuard</div>
              <div className="font-mono text-[10px] font-semibold tracking-wider text-sky-400 uppercase">
                {t("OT KOMUTA & RİSK", "OT COMMAND & RISK")}
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="text-[#8A99AF] hover:text-white lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* Menü Grupları */}
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <nav className="space-y-6">
            {MENU_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="mb-2.5 px-3 font-mono text-[10px] font-bold tracking-wider text-[#64748B] uppercase">
                  {group.title}
                </h3>
                <ul className="space-y-1">
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
                            return `group relative flex items-center justify-between rounded-[5px] px-3.5 py-2.5 text-xs font-medium transition-all ${
                              active
                                ? "border border-blue-500/30 bg-[#17223B] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                                : "border border-transparent text-[#94A3B8] hover:bg-[#151F33] hover:text-white"
                            }`;
                          }}
                        >
                          {({ isActive }) => {
                            const active = isActive || isAssetDetail;
                            return (
                              <>
                                {active && (
                                  <span className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r bg-gradient-to-b from-sky-400 to-blue-600" />
                                )}
                                <span className="flex items-center gap-3">
                                  <span className={active ? "text-sky-400" : "text-[#64748B] group-hover:text-sky-300"}>
                                    <SidebarIcon name={item.icon} />
                                  </span>
                                  <span>{item.label}</span>
                                </span>
                                {item.badge !== undefined && item.badge > 0 && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                                      item.badgeTone === "amber"
                                        ? "border border-amber-500/30 bg-amber-500/15 text-amber-300"
                                        : "border border-sky-500/30 bg-sky-500/15 text-sky-300"
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
        <div className="border-t border-[#1E293B] p-4">
          <div className="rounded-[5px] border border-[#1E293B] bg-[#111A2E] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-white">
                {t("Yalnızca Pasif Gözlem", "Passive Observation Only")}
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t("GÜVENLİ", "SAFE")}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#94A3B8]">
              {t(
                "Aktif tarama yok · Saha ekipmanına paket gönderilmez.",
                "No active scanning · No packets sent to field devices.",
              )}
            </p>
            <div className="mt-2 space-y-1 border-t border-[#1E293B] pt-2 text-[10px] text-[#DEE4EE]">
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">{t("Aktif sensör", "Active sensors")}</span>
                <span className="font-mono font-bold text-sky-400">
                  {activeSensorCount}/{totalSensorCount}
                </span>
              </div>
              <div className="truncate text-[#CBD5E1]" title={primarySite?.name}>
                {primarySite?.name ?? t("Ana Tesis", "Main Site")}
              </div>
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
        {/* TailAdmin Üst Beyaz Başlık Çubuğu */}
        <header className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-3 shadow-[0px_2px_4px_rgba(0,0,0,0.03)]">
          {/* Sol: Mobil Menü + Küresel Arama Çubuğu */}
          <div className="flex flex-1 items-center gap-4">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-[4px] border border-[#E2E8F0] p-1.5 text-[#1C2434] lg:hidden"
              title={t("Menüyü aç", "Open menu")}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <form onSubmit={handleSearchSubmit} className="w-full max-w-md">
              <div className="relative flex items-center">
                <svg
                  className="pointer-events-none absolute left-3 h-4 w-4 text-[#64748B]"
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
                    "Cihaz adı, IP, MAC, üretici veya protokol ara...",
                    "Search device name, IP, MAC, vendor or protocol...",
                  )}
                  className="h-9 w-full rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] pr-3 pl-9 text-xs text-[#1C2434] placeholder:text-[#64748B] focus:border-[#0D9488] focus:bg-white focus:outline-none"
                />
              </div>
            </form>
          </div>

          {/* Sağ: Tesis Seçici, Açık Risk Bildirimi ve Kullanıcı Profili */}
          <div className="flex items-center gap-3">
            {/* Tesis / Organizasyon Rozeti */}
            <div className="hidden items-center gap-2 rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#0D9488]" />
              {organizations.length > 1 ? (
                <select
                  aria-label="Organizasyon"
                  className="bg-transparent text-xs font-semibold text-[#1C2434] focus:outline-none"
                  value={activeOrg?.id ?? ""}
                  onChange={(e) => setActiveOrg(e.target.value)}
                >
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="max-w-[180px] truncate font-semibold text-[#1C2434]" title={activeOrg?.name}>
                  {activeOrg?.name ?? t("Organizasyon Yok", "No Organization")}
                </span>
              )}
              {primarySite && (
                <span
                  className="hidden max-w-[160px] truncate border-l border-[#E2E8F0] pl-2 text-[#64748B] xl:inline"
                  title={primarySite.name}
                >
                  {primarySite.name}
                </span>
              )}
            </div>

            {/* Koyu / Açık Tema Değiştirici (Mühendislik Komuta Modu) */}
            <button
              type="button"
              onClick={toggleTheme}
              title={
                theme === "dark"
                  ? t("Açık Mühendislik Moduna Geç", "Switch to Light Engineering Mode")
                  : t("Koyu Komuta Moduna Geç", "Switch to Dark Command Mode")
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 text-[11px] font-semibold text-[#1C2434] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition hover:border-blue-500 hover:text-blue-600 dark:border-[#334155] dark:bg-[#1E293B] dark:text-[#F8FAFC] dark:hover:border-sky-400 dark:hover:text-sky-300"
            >
              {theme === "dark" ? (
                <>
                  <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                  <span className="hidden sm:inline">{t("Açık Mod", "Light")}</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  <span className="hidden sm:inline">{t("Koyu Mod", "Dark")}</span>
                </>
              )}
            </button>

            {/* Dil Seçici (TR / EN) */}
            <div
              role="group"
              aria-label={t("Arayüz dili", "Interface language")}
              className="flex h-9 items-center rounded-[5px] border border-[#CBD5E1] bg-[#F8FAFC] p-0.5 dark:border-[#334155] dark:bg-[#161F30]"
            >
              {(["tr", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`h-full rounded-[4px] px-2.5 text-[11px] font-bold uppercase transition-colors ${
                    lang === l
                      ? "bg-gradient-to-b from-[#2563EB] to-[#1D4ED8] text-white shadow-xs"
                      : "text-[#64748B] hover:text-[#1C2434] dark:text-[#94A3B8] dark:hover:text-white"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Bildirim Zili & Açılır Canlı Uyarı Çekmecesi */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((v) => !v)}
                aria-expanded={notificationsOpen}
                title={t(`${openRiskCount} açık risk bulgusu`, `${openRiskCount} open risk findings`)}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  notificationsOpen
                    ? "border-[#0D9488] bg-teal-50 text-[#0D9488]"
                    : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] hover:border-[#0D9488] hover:text-[#0D9488]"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {openRiskCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-bold text-white ring-2 ring-white">
                    {openRiskCount > 99 ? "99+" : openRiskCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 z-50 mt-2 w-88 overflow-hidden rounded-[4px] border border-[#E2E8F0] bg-white shadow-xl sm:w-96">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#1C2434] px-4 py-3 text-white">
                    <div>
                      <div className="text-xs font-bold">
                        {t("Canlı OT Güvenlik Bildirimleri", "Live OT Security Notifications")}
                      </div>
                      <div className="text-[11px] text-[#8A99AF]">
                        {t(
                          `${openRiskCount} açık bulgu · En yüksek öncelikliler`,
                          `${openRiskCount} open findings · Highest priority`,
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="rounded px-1.5 py-0.5 text-xs text-[#8A99AF] hover:bg-[#333A48] hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  {topOpenRisks.length === 0 ? (
                    <div className="p-5 text-center text-xs text-[#64748B]">
                      {t("Açık risk bildirimi bulunmuyor.", "No open risk notifications.")}
                    </div>
                  ) : (
                    <div className="max-h-80 divide-y divide-[#E2E8F0] overflow-y-auto">
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
                              <span className="font-mono font-bold text-[#1C2434]">
                                {rf.score}/100
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-[#64748B]">
                              {formatDate(rf.last_seen_at)}
                            </span>
                          </div>
                          <div className="mt-1 font-semibold text-[#1C2434]">{rf.title}</div>
                          <div className="mt-0.5 flex items-center justify-between font-mono text-[11px] text-[#64748B]">
                            <span>{rf.rule_key}</span>
                            {rf.asset_ip && (
                              <span className="font-semibold text-[#0D9488]">{rf.asset_ip}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-xs">
                    <Link
                      to="/network"
                      onClick={() => setNotificationsOpen(false)}
                      className="font-medium text-[#64748B] hover:text-[#1C2434]"
                    >
                      {t("Topoloji Haritası", "Topology Map")}
                    </Link>
                    <Link
                      to="/risks"
                      onClick={() => setNotificationsOpen(false)}
                      className="font-semibold text-[#0D9488] hover:underline"
                    >
                      {t(`Tüm Bulguları İncele (${openRiskCount}) →`, `Inspect All Findings (${openRiskCount}) →`)}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Kullanıcı Profili + Çıkış */}
            <div className="flex items-center gap-3 border-l border-[#E2E8F0] pl-3">
              <div className="hidden min-w-0 text-left md:block">
                <div className="max-w-[160px] truncate text-xs font-semibold text-[#1C2434]" title={user?.full_name}>
                  {/* Parantez içi unvanlar rol satırına bırakılır; ad satırı kısa kalır. */}
                  {(user?.full_name ?? t("OT Kullanıcısı", "OT User")).replace(/\s*\(.*\)\s*$/, "")}
                </div>
                <div className="text-[11px] text-[#64748B]">
                  {activeOrg ? ROLE_LABEL[activeOrg.role] : ROLE_LABEL.analyst}
                </div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1C2434] font-mono text-xs font-bold text-white">
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
                className="rounded-[4px] border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#64748B] hover:border-red-200 hover:bg-red-50 hover:text-red-700"
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
    </div>
  );
}
