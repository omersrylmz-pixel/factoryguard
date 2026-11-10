import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useAuth } from "./hooks/useAuth";
import AppLayout from "./layouts/AppLayout";
import AssetDetailPage from "./pages/AssetDetailPage";
import AssetsPage from "./pages/AssetsPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import NetworkPage from "./pages/NetworkPage";
import RisksPage from "./pages/RisksPage";
import SensorsPage from "./pages/SensorsPage";
import SettingsPage from "./pages/SettingsPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Oturum doğrulanıyor…
      </div>
    );
  }
  if (status === "anonymous") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="assets/:id" element={<AssetDetailPage />} />
          <Route path="network" element={<NetworkPage />} />
          <Route path="risks" element={<RisksPage />} />
          <Route path="sensors" element={<SensorsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
