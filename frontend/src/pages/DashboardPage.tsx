import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Badge,
  Button,
  Card,
  CriticalityBadge,
  Empty,
  ErrorBox,
  PageHeader,
  ProtocolBadge,
  StatCard,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api, apiDownload } from "../services/api";
import type {
  Asset,
  AuditLog,
  CommunicationGraph,
  Page,
  RiskFinding,
  RiskPosture,
  Sensor,
  Site,
  Zone,
} from "../types/api";

const CHART_PALETTE = ["#0D9488", "#1C2434", "#0284C7", "#D97706", "#64748B", "#E11D48"];

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

  const postureQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "posture"],
    queryFn: () => api<RiskPosture>("/risks/posture"),
    enabled: !!activeOrg,
  });

  const graphQuery = useQuery({
    queryKey: ["communications-graph", activeOrg?.id, ""],
    queryFn: () => api<CommunicationGraph>("/communications/graph"),
    enabled: !!activeOrg,
  });

  const auditQuery = useQuery({
    queryKey: ["audit-logs", activeOrg?.id, 8],
    queryFn: () => api<Page<AuditLog>>("/audit-logs?limit=8"),
    enabled: !!activeOrg && canAdmin,
  });

  const assets = assetsQuery.data?.items ?? [];
  const totalAssets = assetsQuery.data?.total ?? assets.length;
  const risks = risksQuery.data?.items ?? [];
  const totalOpenRisks = risksQuery.data?.total ?? risks.length;
  const edges = graphQuery.data?.edges ?? [];
  const sensors = sensorsQuery.data ?? [];
  const sites = sitesQuery.data ?? [];
  const zones = zonesQuery.data ?? [];

  const verifiedCount = assets.filter((a) => a.is_verified).length;
  const unverifiedCount = assets.length - verifiedCount;
  const highCritRisks = risks.filter((r) => r.severity === "critical" || r.severity === "high").length;
  const connectedSensors = sensors.filter((s) => s.is_connected).length;
  const crossZoneCount = edges.filter((e) => e.cross_zone).length;
  const approvedFlowsCount = edges.filter((e) => e.is_baseline_approved).length;

  // Purdue / Cihaz Sınıfı kırılımları
  const plcCount = assets.filter(
    (a) => a.asset_type === "plc" || (a.asset_type === "unknown_device" && (a.observed_protocols ?? []).includes("modbus")),
  ).length;
  const hmiScadaCount = assets.filter((a) =>
    ["hmi", "scada_server", "industrial_pc", "engineering_workstation"].includes(a.asset_type),
  ).length;
  const infraCount = assets.filter((a) =>
    ["server", "network_device", "computer"].includes(a.asset_type),
  ).length;

  // Üretici dağılımı (gerçek veritabanı verisinden)
  const vendorCounts = new Map<string, number>();
  for (const a of assets) {
    const label = a.vendor
      ? a.vendor
      : a.vendor_status_label !== "Üretici bilgisi doğrulanmadı"
        ? a.vendor_status_label
        : "Üretici Doğrulanmadı (Pasif Gözlem)";
    vendorCounts.set(label, (vendorCounts.get(label) ?? 0) + 1);
  }
  const vendorRanking = Array.from(vendorCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxVendorCount = Math.max(1, vendorRanking[0]?.[1] ?? 1);

  // Gözlemlenen protokol dağılımı (Donut grafiği için)
  const protoCounts = new Map<string, number>();
  for (const e of edges) {
    const p = (e.protocol || "unknown").toUpperCase();
    protoCounts.set(p, (protoCounts.get(p) ?? 0) + e.connection_count);
  }
  for (const a of assets) {
    for (const p of a.observed_protocols ?? []) {
      const up = p.toUpperCase();
      if (!protoCounts.has(up)) protoCounts.set(up, 1);
    }
  }
  const protoList = Array.from(protoCounts.entries()).sort((a, b) => b[1] - a[1]);
  const totalProtoConns = Math.max(
    1,
    protoList.reduce((acc, [, v]) => acc + v, 0),
  );

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const posture = postureQuery.data;
  const postureTone =
    !posture || posture.health_score >= 75
      ? "teal"
      : posture.health_score >= 45
        ? "amber"
        : "red";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview Dashboard"
        subtitle={`${activeOrg?.name ?? ""} · Gerçek zamanlı OT varlık görünürlüğü, pasif protokol telemetrisi ve açıklanabilir risk özeti`}
        breadcrumb="Overview"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void apiDownload("/reports/inventory?format=csv", "factoryguard-envanter.csv")}
            >
              ↓ Envanter CSV
            </Button>
            <Link to="/sensors">
              <Button variant="primary">PCAP / Zeek Analiz Et</Button>
            </Link>
          </>
        }
      />

      {(sitesQuery.error || zonesQuery.error) && <ErrorBox error={sitesQuery.error ?? zonesQuery.error} />}

      {/* 1. Satır: TailAdmin 4 Sütunlu KPI StatCard Izgarası */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          to="/assets"
          label="Keşfedilen Toplam Cihaz"
          value={assetsQuery.isLoading ? "…" : totalAssets}
          badge={`${verifiedCount} Doğrulandı`}
          badgeTone={unverifiedCount > 0 ? "amber" : "teal"}
          subtext={`${unverifiedCount} doğrulanmamış`}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="6" rx="1.5" />
              <rect x="2" y="14" width="20" height="6" rx="1.5" />
              <circle cx="6" cy="7" r="1" fill="currentColor" />
              <circle cx="6" cy="17" r="1" fill="currentColor" />
            </svg>
          }
        />

        <StatCard
          to="/risks"
          label="OT Güvenlik Duruş Endeksi"
          value={
            postureQuery.isLoading
              ? "…"
              : `Not ${posture?.grade ?? "A"} · ${posture?.health_score ?? 100}/100`
          }
          badge={posture?.status_label?.split("·")[0]?.trim() ?? "Duruş Notu"}
          badgeTone={postureTone}
          subtext={`Envanter: %${Math.round((posture?.verified_asset_ratio ?? 0) * 100)}`}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />

        <StatCard
          to="/risks"
          label="Açık Risk Bulguları"
          value={risksQuery.isLoading ? "…" : totalOpenRisks}
          badge={highCritRisks > 0 ? `${highCritRisks} Yüksek / Kritik` : "Kritik Bulgu Yok"}
          badgeTone={highCritRisks > 0 ? "red" : "teal"}
          subtext="6 açıklanabilir kural aktif"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />

        <StatCard
          to="/network"
          label="Gözlemlenen Ağ İletişim Akışı"
          value={graphQuery.isLoading ? "…" : edges.length}
          badge={`${connectedSensors}/${sensors.length} Sensör Aktif`}
          badgeTone={crossZoneCount > 0 ? "amber" : "teal"}
          subtext={`${approvedFlowsCount} baseline onaylı`}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        />
      </div>

      {/* 2. Satır: TailAdmin 12 Sütunlu Analitik Grid (8 Sütun Envanter/Üretici + 4 Sütun Protokol Donut) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Sol 8 Sütun: Endüstriyel Varlık Katmanları ve Üretici Dağılımı */}
        <Card
          className="lg:col-span-8"
          title="Endüstriyel Varlık Dağılımı ve Donanım Üreticileri"
          subtitle="ISA-95 / Purdue fonksiyonel katmanlarına ve pasif MAC OUI / doğrulanmış üretici kayıtlarına göre envanter yapısı"
          actions={
            <Link to="/assets" className="text-xs font-semibold text-[#0D9488] hover:underline">
              Envanteri Aç →
            </Link>
          }
        >
          {/* 4 Purdue / Cihaz Sınıfı Alt Kartı */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[4px] border border-teal-200/80 bg-teal-50/40 p-3.5">
              <div className="font-mono text-[10px] font-semibold text-[#0F766E] uppercase">
                PURDUE L1 · CONTROL
              </div>
              <div className="mt-1.5 text-2xl font-bold text-[#1C2434]">{plcCount}</div>
              <div className="mt-0.5 text-xs text-[#64748B]">PLC & Saha Kontrolcü</div>
            </div>

            <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
              <div className="font-mono text-[10px] font-semibold text-[#64748B] uppercase">
                PURDUE L2 · SUPERVISORY
              </div>
              <div className="mt-1.5 text-2xl font-bold text-[#1C2434]">{hmiScadaCount}</div>
              <div className="mt-0.5 text-xs text-[#64748B]">HMI, SCADA & Mühendislik</div>
            </div>

            <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
              <div className="font-mono text-[10px] font-semibold text-[#64748B] uppercase">
                PURDUE L3 · OPERATIONS
              </div>
              <div className="mt-1.5 text-2xl font-bold text-[#1C2434]">{infraCount}</div>
              <div className="mt-0.5 text-xs text-[#64748B]">Sunucu, Ağ & İstemci</div>
            </div>

            <div className="rounded-[4px] border border-amber-200/80 bg-amber-50/40 p-3.5">
              <div className="font-mono text-[10px] font-semibold text-amber-800 uppercase">
                UNVERIFIED ASSETS
              </div>
              <div className="mt-1.5 text-2xl font-bold text-amber-900">{unverifiedCount}</div>
              <div className="mt-0.5 text-xs text-amber-800">Doğrulama Bekleyen</div>
            </div>
          </div>

          {/* Üretici (Vendor) Yatay Çubuk Grafiği */}
          <div className="mt-5 border-t border-[#E2E8F0] pt-4">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-[#1C2434]">Donanım Üreticisi Dağılımı (Vendors)</span>
              <span className="text-[#64748B]">{vendorRanking.length} farklı üretici / durum</span>
            </div>
            {vendorRanking.length === 0 ? (
              <Empty>Henüz cihaz kaydı bulunmuyor.</Empty>
            ) : (
              <div className="space-y-2.5">
                {vendorRanking.slice(0, 6).map(([vendorName, count]) => {
                  const pct = Math.max(6, Math.round((count / maxVendorCount) * 100));
                  const isUnverified = vendorName.includes("Doğrulanmadı");
                  return (
                    <div key={vendorName}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#1C2434]">{vendorName}</span>
                        <span className="font-mono font-semibold text-[#1C2434]">{count} cihaz</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-[#F1F5F9]">
                        <div
                          className={`h-2 rounded-full ${isUnverified ? "bg-amber-500" : "bg-[#0D9488]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Sağ 4 Sütun: Gözlemlenen Endüstriyel Protokoller (TailAdmin Donut Chart Card) */}
        <Card
          className="lg:col-span-4"
          title="Gözlemlenen Ağ Protokolleri"
          subtitle="Pasif trafik ve DPI ile doğrulanan protokoller"
          actions={<Badge variant="teal">{protoList.length} Protokol</Badge>}
        >
          {protoList.length === 0 ? (
            <Empty>Henüz protokol trafiği gözlenmedi.</Empty>
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative my-2 flex h-40 w-40 items-center justify-center">
                <svg viewBox="0 0 140 140" className="h-40 w-40 -rotate-90">
                  <circle cx="70" cy="70" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="16" />
                  {protoList.slice(0, 6).map(([proto, count], idx) => {
                    const frac = count / totalProtoConns;
                    const dash = frac * circumference;
                    const offset = cumulativeOffset;
                    cumulativeOffset += dash;
                    return (
                      <circle
                        key={proto}
                        cx="70"
                        cy="70"
                        r={radius}
                        fill="none"
                        stroke={CHART_PALETTE[idx % CHART_PALETTE.length]}
                        strokeWidth="16"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={-offset}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-bold text-[#1C2434]">{edges.length}</span>
                  <span className="text-[10px] font-semibold tracking-wider text-[#64748B] uppercase">
                    AKTİF AKIŞ
                  </span>
                </div>
              </div>

              <div className="mt-3 w-full divide-y divide-[#E2E8F0] text-xs">
                {protoList.slice(0, 6).map(([proto, count], idx) => {
                  const pct = Math.round((count / totalProtoConns) * 100);
                  return (
                    <div key={proto} className="flex items-center justify-between py-2">
                      <span className="flex items-center gap-2 font-mono font-semibold text-[#1C2434]">
                        <span
                          className="h-2.5 w-2.5 rounded-xs"
                          style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }}
                        />
                        {proto}
                      </span>
                      <span className="font-mono text-[#64748B]">
                        {count} bağlantı (<strong className="text-[#1C2434]">{pct}%</strong>)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 3. Satır: Öncelikli Risk Bulguları (7 Sütun) + Tesisler/Bölgeler ve Denetim Kayıtları (5 Sütun) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card
          className="lg:col-span-7"
          noPadding
          title="Öncelikli Açık Risk Bulguları"
          subtitle="100 puanlık açıklanabilir kural motoru tarafından en yüksek öncelikle işaretlenen bulgular"
          actions={
            <Link to="/risks" className="text-xs font-semibold text-[#0D9488] hover:underline">
              Tüm Bulgular ({totalOpenRisks}) →
            </Link>
          }
        >
          {risksQuery.isLoading ? (
            <Empty>Yükleniyor…</Empty>
          ) : risks.length === 0 ? (
            <Empty>Açık risk bulgusu bulunmuyor.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold text-[#64748B] uppercase">
                  <tr>
                    <th className="px-5 py-3">Bulgular & Kural</th>
                    <th className="px-4 py-3">Etkilenen Cihaz</th>
                    <th className="px-4 py-3">Puan / Seviye</th>
                    <th className="px-5 py-3 text-right">İncele</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {risks.slice(0, 6).map((r) => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-[#1C2434]">{r.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-[#64748B]">
                          <span>{r.evidence.rule_id ?? r.rule_key}</span>
                          <span>·</span>
                          <span>Güven: %{Math.round(r.confidence * 100)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <Link
                          to={`/assets/${r.asset_id}`}
                          className="font-semibold text-[#0D9488] hover:underline"
                        >
                          {r.asset_ip ?? r.asset_name ?? "—"}
                        </Link>
                        {r.asset_name && <div className="font-sans text-[11px] text-[#64748B]">{r.asset_name}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#1C2434] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                            {r.score}/100
                          </span>
                          <CriticalityBadge value={r.severity} />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link to="/risks">
                          <Button variant="secondary" size="sm">
                            Detay
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-5">
          <Card
            title="Fabrikalar ve Ağ Bölgeleri (Sites & Zones)"
            subtitle="Kayıtlı üretim tesisleri ve segmentasyon bölgeleri"
            actions={
              <Link to="/settings" className="text-xs font-semibold text-[#0D9488] hover:underline">
                Yönet →
              </Link>
            }
          >
            {sitesQuery.isLoading ? (
              <Empty>Yükleniyor…</Empty>
            ) : sites.length === 0 ? (
              <Empty>Henüz fabrika kaydı yok.</Empty>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {sites.map((site) => {
                  const siteZones = zones.filter((z) => z.site_id === site.id);
                  return (
                    <div key={site.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#1C2434]">{site.name}</div>
                          <div className="text-[11px] text-[#64748B]">
                            {site.industry || "Endüstriyel Üretim"} · {site.timezone}
                          </div>
                        </div>
                        <Badge variant="mono">{siteZones.length} Bölge</Badge>
                      </div>
                      {siteZones.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {siteZones.map((z) => (
                            <span
                              key={z.id}
                              className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[11px] text-[#1C2434]"
                            >
                              <span>{z.name}</span>
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

          <Card
            title="Son Denetim Kayıtları (Audit Trail)"
            subtitle="Sistemde gerçekleştirilen kritik yapılandırma ve analiz işlemleri"
          >
            {!canAdmin ? (
              <Empty>Denetim kayıtlarını görüntülemek için yönetici yetkisi gerekir.</Empty>
            ) : auditQuery.isLoading ? (
              <Empty>Yükleniyor…</Empty>
            ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
              <Empty>Henüz denetim kaydı yok.</Empty>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {auditQuery.data!.items.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-2 text-xs first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <ProtocolBadge protocol={log.action} />
                      {log.target_type && (
                        <span className="text-[11px] text-[#64748B]">({log.target_type})</span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-[#64748B]">{formatDate(log.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
