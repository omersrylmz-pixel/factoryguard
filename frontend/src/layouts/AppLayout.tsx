import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ROLE_LABEL } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
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
  const navigate = useNavigate();
  const location = useLocation();
  const [globalSearch, setGlobalSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  const activeSensorCount = (sensorsQuery.data ?? []).filter((s) => s.is_connected).length;
  const totalSensorCount = (sensorsQuery.data ?? []).length;
  const primarySite = sitesQuery.data?.[0];

  const MENU_GROUPS: { title: string; items: SidebarItem[] }[] = [
    {
      title: "VISIBILITY & INVENTORY",
      items: [
        { to: "/", label: "Overview Dashboard", icon: "dashboard" },
        { to: "/assets", label: "Device Inventory", icon: "inventory" },
        { to: "/network", label: "Network Topology", icon: "topology" },
      ],
    },
    {
      title: "DETECTION & MONITORING",
      items: [
        {
          to: "/risks",
          label: "Events & Risk Findings",
          icon: "events",
          badge: openRiskCount,
          badgeTone: openRiskCount > 0 ? "amber" : "teal",
        },
        {
          to: "/sensors",
          label: "Sensors & PCAP Analysis",
          icon: "sensors",
          badge: totalSensorCount,
          badgeTone: "teal",
        },
      ],
    },
    {
      title: "REPORTING & GOVERNANCE",
      items: [
        { to: "/reports", label: "Reports & SIEM Export", icon: "reports" },
        { to: "/settings", label: "Settings & Zones", icon: "settings" },
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
      {/* TailAdmin Koyu Lacivert Sol Kenar Çubuğu (#1C2434) */}
      <aside
        className={`${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-[#1C2434] text-[#DEE4EE] transition-transform duration-200 lg:static lg:translate-x-0`}
      >
        {/* Marka Başlığı */}
        <div className="flex items-center justify-between border-b border-[#2E3A47] px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-[#0D9488] text-white shadow-sm">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-white">FactoryGuard</div>
              <div className="text-[11px] font-medium text-[#8A99AF]">OT Asset & Risk Console</div>
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
                <h3 className="mb-2.5 px-3 text-[11px] font-semibold tracking-wider text-[#8A99AF] uppercase">
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
                            return `group relative flex items-center justify-between rounded-[4px] px-3.5 py-2.5 text-xs font-medium transition-colors ${
                              active
                                ? "bg-[#333A48] text-white"
                                : "text-[#DEE4EE] hover:bg-[#333A48]/70 hover:text-white"
                            }`;
                          }}
                        >
                          {({ isActive }) => {
                            const active = isActive || isAssetDetail;
                            return (
                              <>
                                {active && (
                                  <span className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r bg-[#0D9488]" />
                                )}
                                <span className="flex items-center gap-3">
                                  <span className={active ? "text-[#14B8A6]" : "text-[#8A99AF] group-hover:text-white"}>
                                    <SidebarIcon name={item.icon} />
                                  </span>
                                  <span>{item.label}</span>
                                </span>
                                {item.badge !== undefined && item.badge > 0 && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                      item.badgeTone === "amber"
                                        ? "bg-amber-500/20 text-amber-300"
                                        : "bg-teal-500/20 text-teal-300"
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
        <div className="border-t border-[#2E3A47] p-4">
          <div className="rounded-[4px] border border-[#333A48] bg-[#24303F] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-white">Passive Observation Only</span>
              <span className="inline-flex items-center gap-1 rounded bg-teal-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-teal-300">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                SAFE
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#8A99AF]">
              Sıfır aktif tarama · PLC ve saha ekipmanlarına paket gönderilmez.
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-[#333A48] pt-2 font-mono text-[10px] text-[#DEE4EE]">
              <span>Sensörler: {activeSensorCount}/{totalSensorCount}</span>
              <span>{primarySite?.name ?? "Ana Tesis"}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Sağ İçerik Sütunu: TailAdmin Üst Beyaz Header + Ana İçerik Tuvali */}
      <div className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {/* TailAdmin Üst Beyaz Başlık Çubuğu */}
        <header className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-3 shadow-[0px_2px_4px_rgba(0,0,0,0.03)]">
          {/* Sol: Mobil Menü + Küresel Arama Çubuğu */}
          <div className="flex flex-1 items-center gap-4">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-[4px] border border-[#E2E8F0] p-1.5 text-[#1C2434] lg:hidden"
              title="Menüyü Aç"
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
                  placeholder="Cihaz adı, IP, MAC, üretici veya protokol ara..."
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
                <span className="font-semibold text-[#1C2434]">
                  {activeOrg?.name ?? "Organizasyon Yok"}
                </span>
              )}
              {primarySite && (
                <span className="border-l border-[#E2E8F0] pl-2 text-[#64748B]">{primarySite.name}</span>
              )}
            </div>

            {/* Bildirim Zili (TailAdmin tarzı dairesel ikon) */}
            <Link
              to="/risks"
              title={`${openRiskCount} Açık Risk Bulgusu`}
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] transition hover:border-[#0D9488] hover:text-[#0D9488]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {openRiskCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-bold text-white">
                  {openRiskCount}
                </span>
              )}
            </Link>

            {/* Kullanıcı Profili + Çıkış */}
            <div className="flex items-center gap-3 border-l border-[#E2E8F0] pl-3">
              <div className="hidden text-right sm:block">
                <div className="text-xs font-semibold text-[#1C2434]">{user?.full_name ?? "OT Kullanıcı"}</div>
                <div className="text-[11px] text-[#64748B]">
                  {activeOrg ? ROLE_LABEL[activeOrg.role] : "Analist"}
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
                Çıkış
              </button>
            </div>
          </div>
        </header>

        {/* Ana İçerik Alanı */}
        <main className="mx-auto w-full max-w-screen-2xl flex-1 p-5 md:p-6">
          {activeOrg ? (
            <Outlet />
          ) : (
            <div className="rounded-[4px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Herhangi bir organizasyona üye değilsiniz. Yöneticinizden davet isteyin.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
