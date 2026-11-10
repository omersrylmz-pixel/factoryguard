import { NavLink, Outlet } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { ROLE_LABEL } from "../components/ui";

interface NavItem {
  to: string;
  label: string;
  stage?: string; // henüz uygulanmamış sayfalar için hangi aşamada geleceği
}

const NAV: NavItem[] = [
  { to: "/", label: "Genel Bakış" },
  { to: "/assets", label: "Cihaz Envanteri", stage: "Aşama 3" },
  { to: "/network", label: "Ağ Görünümü", stage: "Aşama 4" },
  { to: "/risks", label: "Risk Merkezi", stage: "Aşama 4" },
  { to: "/sensors", label: "Sensörler", stage: "Aşama 2" },
  { to: "/reports", label: "Raporlar", stage: "Aşama 5" },
  { to: "/settings", label: "Ayarlar" },
];

export default function AppLayout() {
  const { user, organizations, activeOrg, setActiveOrg, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-slate-300">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="text-base font-semibold text-white">FactoryGuard</div>
          <div className="text-xs text-slate-400">Lite · OT Varlık Görünürlüğü</div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) =>
            item.stage ? (
              <div
                key={item.to}
                className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-slate-500"
                title={`Bu sayfa ${item.stage}'te geliştirilecek`}
              >
                {item.label}
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">{item.stage}</span>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm ${isActive ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 hover:text-white"}`
                }
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="border-t border-slate-800 p-3 text-xs text-slate-500">Yalnızca pasif gözlem</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            {organizations.length > 1 ? (
              <select
                aria-label="Organizasyon"
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
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
              <span className="text-sm font-medium text-slate-800">{activeOrg?.name ?? "Organizasyon yok"}</span>
            )}
            {activeOrg && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{ROLE_LABEL[activeOrg.role]}</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">{user?.full_name}</span>
            <button className="text-slate-500 hover:text-slate-900" onClick={() => void logout()}>
              Çıkış
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
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
