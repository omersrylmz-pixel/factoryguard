import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { ROLE_LABEL } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { Page, RiskFinding, Site } from "../types/api";

interface TopNavItem {
  to: string;
  label: string;
  icon: "overview" | "sensors" | "alerts" | "assets" | "map" | "vulns" | "settings";
  badge?: number;
}

function TopIcon({ name }: { name: TopNavItem["icon"] }) {
  switch (name) {
    case "sensors":
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="7" cy="12" r="1.2" fill="currentColor" />
          <circle cx="11" cy="12" r="1.2" fill="currentColor" />
          <line x1="15" y1="12" x2="18" y2="12" />
        </svg>
      );
    case "alerts":
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12.5" />
          <circle cx="12" cy="16" r="0.8" fill="currentColor" />
        </svg>
      );
    case "assets":
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <line x1="8" y1="20" x2="16" y2="20" />
          <line x1="12" y1="16" x2="12" y2="20" />
        </svg>
      );
    case "map":
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <circle cx="12" cy="20" r="1" fill="currentColor" />
        </svg>
      );
    case "overview":
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "vulns":
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "settings":
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
  }
}

export default function AppLayout() {
  const { user, organizations, activeOrg, setActiveOrg, logout } = useAuth();
  const navigate = useNavigate();
  const [globalSearch, setGlobalSearch] = useState("");
  const [showSidebar, setShowSidebar] = useState(false);

  const sitesQuery = useQuery({
    queryKey: ["sites", activeOrg?.id],
    queryFn: () => api<Site[]>("/sites"),
    enabled: !!activeOrg,
  });

  const openRisksQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "open"],
    queryFn: () => api<Page<RiskFinding>>("/risks?status=open&limit=200"),
    enabled: !!activeOrg,
  });

  const openRiskCount = openRisksQuery.data?.total ?? 0;
  const primarySite = sitesQuery.data?.[0];

  const TOP_NAV: TopNavItem[] = [
    { to: "/sensors", label: "Sensors", icon: "sensors" },
    { to: "/risks", label: "Alerts", icon: "alerts", badge: openRiskCount },
    { to: "/assets", label: "Assets", icon: "assets" },
    { to: "/network", label: "Wireless / Map", icon: "map" },
    { to: "/", label: "Overview", icon: "overview" },
    { to: "/reports", label: "Vulnerabilities & Reports", icon: "vulns" },
    { to: "/settings", label: "IQ / Settings", icon: "settings" },
  ];

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const q = globalSearch.trim();
    navigate(q ? `/assets?q=${encodeURIComponent(q)}` : "/assets");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F1F4F8] text-slate-900">
      {/* 1. Nozomi Vantage Üst İnce Lisans ve Bölge Şeridi (#1A2128 + Trapezoid VANTAGE sekmesi) */}
      <div className="flex h-6 items-center justify-between bg-[#1A2128] pr-5 text-[10px] text-slate-300">
        <div
          className="flex h-full items-center bg-[#12516E] pr-8 pl-5 font-bold tracking-wider text-white uppercase"
          style={{ clipPath: "polygon(0 0, 86% 0, 100% 100%, 0 100%)" }}
        >
          VANTAGE
        </div>
        <div className="flex items-center gap-6">
          <span>
            <span className="font-semibold text-slate-400">LICENSEE</span>{" "}
            <strong className="font-semibold text-white">
              Nozomi Networks SecRes · {activeOrg?.name ?? "FactoryGuard"}
            </strong>
          </span>
          <span>
            <span className="font-semibold text-slate-400">DATA LOCATION</span>{" "}
            <strong className="font-semibold text-white">Europe</strong>
          </span>
        </div>
        <div className="hidden w-24 text-right font-mono text-[9px] text-slate-400 sm:block">PASSIVE OT</div>
      </div>

      {/* 2. Nozomi Networks Vantage Ana Koyu Petrol-Teal Üst Navigasyon Çubuğu (#0B4F6C) */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-[#0B4F6C] px-5 py-2 text-white shadow-xs">
        {/* Sol: Logo + Hamburger + Yatay Sekmeler */}
        <div className="flex flex-wrap items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 pr-1">
            <svg className="h-7 w-7 text-white" viewBox="0 0 32 32" fill="none">
              <polygon
                points="16,3 28,10 28,22 16,29 4,22 4,10"
                stroke="currentColor"
                strokeWidth="2.2"
                fill="none"
              />
              <polyline points="8,14 16,9 24,14" stroke="currentColor" strokeWidth="2" />
              <polyline points="8,19 16,14 24,19" stroke="currentColor" strokeWidth="2" />
            </svg>
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-widest text-white">NOZOMI · FG</div>
              <div className="text-[8.5px] font-medium tracking-[0.26em] text-cyan-100 uppercase">NETWORKS</div>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setShowSidebar((v) => !v)}
            className="rounded p-1.5 text-cyan-100 hover:bg-white/10"
            title="Menü"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Yatay Navigasyon Öğeleri (Nozomi Image: Aktif sekme açık gri/buz mavisi kutu #DCE6EA) */}
          <nav className="flex flex-wrap items-center gap-1.5">
            {TOP_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-xs transition ${
                    isActive
                      ? "bg-[#DCE6EA] font-semibold text-[#0B4F6C] shadow-2xs"
                      : "font-normal text-cyan-50/90 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <TopIcon name={item.icon} />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 py-0.2 font-mono text-[10px] font-bold text-slate-950">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Sağ: Arama, Bildirim Zili, Ayarlar, Kullanıcı Avatarı (PP) ve Tesis Seçici (Nozomiville) */}
        <div className="flex items-center gap-3 text-xs">
          <form onSubmit={handleSearchSubmit} className="hidden lg:block">
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search IP, PLC, CVE..."
              className="w-44 rounded border border-cyan-300/30 bg-[#06283D]/70 px-2.5 py-1 text-xs text-white placeholder:text-cyan-200/60 focus:border-cyan-300 focus:outline-none"
            />
          </form>

          <Link
            to="/risks"
            className="relative rounded p-1.5 text-cyan-100 hover:bg-white/10"
            title={`${openRiskCount} Açık Risk Bulgusu`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {openRiskCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400" />
            )}
          </Link>

          <Link to="/settings" className="rounded p-1.5 text-cyan-100 hover:bg-white/10" title="Ayarlar">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>

          {/* Yuvarlak Kullanıcı Avatarı (Nozomi PP tarzı) */}
          <button
            type="button"
            onClick={() => void logout()}
            title={`${user?.full_name ?? "Admin"} (${activeOrg ? ROLE_LABEL[activeOrg.role] : ""}) — Çıkış için tıklayın`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-200/80 bg-[#0D5C84] font-mono text-[11px] font-bold text-white hover:bg-cyan-700"
          >
            {(user?.full_name ?? "PP")
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </button>

          <span className="h-5 w-px bg-cyan-300/30" />

          {/* Tesis / Organizasyon Seçici (Nozomiville ▾ tarzı) */}
          {organizations.length > 1 ? (
            <select
              aria-label="Organizasyon"
              className="bg-transparent text-xs font-semibold text-white focus:outline-none"
              value={activeOrg?.id ?? ""}
              onChange={(e) => setActiveOrg(e.target.value)}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id} className="text-slate-900">
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-semibold text-white">
              {primarySite?.name ?? activeOrg?.name ?? "Gebze Tesis"} ▾
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* İsteğe Bağlı Açılır Sol Menü (Hamburger ☰ ile açılır) */}
        {showSidebar && (
          <aside className="flex w-56 shrink-0 flex-col bg-[#0B1528] p-3 text-slate-300">
            <div className="mb-2 px-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              NAVIGATION
            </div>
            <div className="space-y-1">
              {TOP_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium ${
                      isActive ? "bg-[#162440] text-white" : "text-slate-400 hover:bg-[#132038] hover:text-white"
                    }`
                  }
                >
                  <TopIcon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </aside>
        )}

        {/* Ana İçerik Tuvali */}
        <main className="min-w-0 flex-1 px-6 py-4">
          {activeOrg ? (
            <Outlet />
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Herhangi bir organizasyona üye değilsiniz. Yöneticinizden davet isteyin.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
