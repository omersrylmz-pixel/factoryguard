import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Card, CriticalityBadge, Empty, ErrorBox, PageHeader, formatDate } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { Asset, AuditLog, Page, RiskFinding, Sensor, Site, Zone } from "../types/api";

export default function DashboardPage() {
  const { activeOrg, canAdmin } = useAuth();

  const sitesQuery = useQuery({
    queryKey: ["sites", activeOrg?.id],
    queryFn: () => api<Site[]>("/sites"),
    enabled: !!activeOrg,
  });

  const zonesQuery = useQuery({
    queryKey: ["zones", activeOrg?.id],
    queryFn: () => api<Zone[]>("/zones"),
    enabled: !!activeOrg,
  });

  const sensorsQuery = useQuery({
    queryKey: ["sensors", activeOrg?.id],
    queryFn: () => api<Sensor[]>("/sensors"),
    enabled: !!activeOrg,
  });

  const assetsQuery = useQuery({
    queryKey: ["assets", activeOrg?.id, "dashboard"],
    queryFn: () => api<Page<Asset>>("/assets?limit=200"),
    enabled: !!activeOrg,
  });

  const risksQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "open"],
    queryFn: () => api<Page<RiskFinding>>("/risks?status=open&limit=200"),
    enabled: !!activeOrg,
  });

  const auditQuery = useQuery({
    queryKey: ["audit-logs", activeOrg?.id, 10],
    queryFn: () => api<Page<AuditLog>>("/audit-logs?limit=10"),
    enabled: !!activeOrg && canAdmin,
  });

  const sites = sitesQuery.data ?? [];
  const zones = zonesQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Genel Bakış"
        subtitle={`${activeOrg?.name ?? ""} · Gerçek zamanlı organizasyon ve tesis özeti`}
      />

      {(sitesQuery.error || zonesQuery.error) && (
        <div className="mb-4">
          <ErrorBox error={sitesQuery.error ?? zonesQuery.error} />
        </div>
      )}

      {/* Aşama 1 gerçek metrikleri + sonraki aşamaların dürüst durum göstergeleri */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Kayıtlı Fabrika (Site)</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {sitesQuery.isLoading ? "…" : sites.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Aktif organizasyondaki tesisler</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Toplam Cihaz / Doğrulanmamış</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {assetsQuery.isLoading
              ? "…"
              : `${assetsQuery.data?.total ?? 0} / ${(assetsQuery.data?.items ?? []).filter((a) => !a.is_verified).length}`}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <Link to="/assets" className="text-blue-700 hover:underline">
              Envanteri görüntüle →
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Aktif Sensör</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {sensorsQuery.isLoading
              ? "…"
              : `${(sensorsQuery.data ?? []).filter((s) => s.is_connected).length} / ${(sensorsQuery.data ?? []).length}`}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <Link to="/sensors" className="text-blue-700 hover:underline">
              Sensör yönetimi →
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Açık Risk / Kritik Risk</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {risksQuery.isLoading
              ? "…"
              : `${risksQuery.data?.total ?? 0} / ${(risksQuery.data?.items ?? []).filter((r) => r.severity === "critical").length}`}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <Link to="/risks" className="text-blue-700 hover:underline">
              Risk merkezine git →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Fabrikalar ve Bölgeler"
          actions={
            <Link to="/settings" className="text-xs font-medium text-blue-700 hover:underline">
              Yönet →
            </Link>
          }
        >
          {sitesQuery.isLoading ? (
            <Empty>Yükleniyor…</Empty>
          ) : sites.length === 0 ? (
            <Empty>
              Henüz fabrika kaydı yok.{" "}
              <Link to="/settings" className="font-medium text-blue-700 hover:underline">
                Ayarlar
              </Link>{" "}
              sayfasından ilk fabrikanızı ekleyin.
            </Empty>
          ) : (
            <div className="divide-y divide-slate-200">
              {sites.map((site) => {
                const siteZones = zones.filter((z) => z.site_id === site.id);
                return (
                  <div key={site.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{site.name}</div>
                        <div className="text-xs text-slate-500">
                          {site.industry || "Sektör belirtilmedi"} · {site.timezone}
                        </div>
                      </div>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {siteZones.length} bölge
                      </span>
                    </div>
                    {siteZones.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {siteZones.map((z) => (
                          <span
                            key={z.id}
                            className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                          >
                            {z.name}
                            <CriticalityBadge value={z.criticality} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Son Denetim Kayıtları (Audit Log)">
          {!canAdmin ? (
            <Empty>Denetim kayıtlarını görüntülemek için yönetici veya sahip yetkisi gerekir.</Empty>
          ) : auditQuery.isLoading ? (
            <Empty>Yükleniyor…</Empty>
          ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
            <Empty>Henüz kayıt yok.</Empty>
          ) : (
            <div className="divide-y divide-slate-200">
              {auditQuery.data!.items.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2 text-xs first:pt-0 last:pb-0">
                  <div>
                    <span className="font-mono font-medium text-slate-800">{log.action}</span>
                    {log.target_type && (
                      <span className="ml-2 text-slate-500">
                        ({log.target_type})
                      </span>
                    )}
                  </div>
                  <span className="text-slate-500">{formatDate(log.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
