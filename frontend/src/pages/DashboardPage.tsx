import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Card, CriticalityBadge, Empty, ErrorBox, formatDate } from "../components/ui";
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

const DONUT_COLORS = ["#EA580C", "#0284C7", "#16A34A", "#D97706", "#7C3AED", "#475569"];

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
    queryKey: ["audit-logs", activeOrg?.id, 10],
    queryFn: () => api<Page<AuditLog>>("/audit-logs?limit=10"),
    enabled: !!activeOrg && canAdmin,
  });

  const assets = assetsQuery.data?.items ?? [];
  const totalAssets = assetsQuery.data?.total ?? assets.length;
  const risks = risksQuery.data?.items ?? [];
  const edges = graphQuery.data?.edges ?? [];
  const sensors = sensorsQuery.data ?? [];
  const sites = sitesQuery.data ?? [];
  const zones = zonesQuery.data ?? [];

  // MON5 tipi envanter kırılımları
  const plcCount = assets.filter(
    (a) => a.asset_type === "plc" || (a.asset_type === "unknown_device" && (a.observed_protocols ?? []).includes("modbus")),
  ).length;
  const hmiScadaCount = assets.filter((a) =>
    ["hmi", "scada_server", "industrial_pc", "engineering_workstation"].includes(a.asset_type),
  ).length;
  const switchSensorCount =
    assets.filter((a) => a.asset_type === "network_device").length + sensors.length;
  const itEndpointCount = Math.max(0, totalAssets - plcCount - hmiScadaCount);

  const verifiedCount = assets.filter((a) => a.is_verified).length;
  const unverifiedCount = assets.filter((a) => !a.is_verified).length;
  const assetsAtRiskIds = new Set(risks.map((r) => r.asset_id));
  const atRiskDeviceCount = assetsAtRiskIds.size;

  // En yüksek puanlı öncelikli bulgu (Attention required kartı için)
  const topFinding = [...risks].sort((a, b) => b.score - a.score)[0] ?? null;

  // VENDORS yatay çubuk grafiği (MON5 tarzı)
  const vendorCounts = new Map<string, number>();
  for (const a of assets) {
    const label = a.vendor
      ? a.vendor
      : a.vendor_status_label !== "Üretici bilgisi doğrulanmadı"
        ? a.vendor_status_label
        : "Unverified / Unknown Vendor";
    vendorCounts.set(label, (vendorCounts.get(label) ?? 0) + 1);
  }
  const vendorRanking = Array.from(vendorCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxVendorCount = Math.max(1, vendorRanking[0]?.[1] ?? 1);

  // OT PROTOCOLS halka (donut) grafiği (MON5 tarzı)
  const protoCounts = new Map<string, number>();
  for (const e of edges) {
    const p = (e.protocol || "unknown").toUpperCase();
    protoCounts.set(p, (protoCounts.get(p) ?? 0) + e.connection_count);
  }
  for (const a of assets) {
    for (const p of a.observed_protocols ?? []) {
      const up = p.toUpperCase();
      if (!protoCounts.has(up)) {
        protoCounts.set(up, 1);
      }
    }
  }
  const protoList = Array.from(protoCounts.entries()).sort((a, b) => b[1] - a[1]);
  const totalProtoConns = Math.max(
    1,
    protoList.reduce((acc, [, v]) => acc + v, 0),
  );

  // Allegro Packets tarzı Top Communicating IPs
  const ipFlowStats = new Map<
    string,
    { id: string; ip: string; name: string; flows: number; connections: number; protocols: Set<string> }
  >();
  for (const e of edges) {
    for (const [aid, ip, label] of [
      [e.source_asset_id, e.source_ip ?? "—", e.source_label],
      [e.target_asset_id, e.target_ip ?? "—", e.target_label],
    ] as const) {
      const cur = ipFlowStats.get(aid) ?? {
        id: aid,
        ip,
        name: label,
        flows: 0,
        connections: 0,
        protocols: new Set<string>(),
      };
      cur.flows += 1;
      cur.connections += e.connection_count;
      cur.protocols.add(e.protocol.toUpperCase());
      ipFlowStats.set(aid, cur);
    }
  }
  const topCommunicatingAssets = Array.from(ipFlowStats.values())
    .sort((a, b) => b.connections - a.connections)
    .slice(0, 6);

  // SVG Donut dilim hesaplama
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="space-y-6">
      {/* MON5 Üst Başlık ve Hızlı Aksiyonlar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Assets & OT Security Overview</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {totalAssets} assets discovered · {verifiedCount} verified active · {atRiskDeviceCount} at risk ·{" "}
            {edges.length} observed flows
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
            <span className="rounded-md bg-slate-900 px-3 py-1 font-semibold text-white">Summary</span>
            <Link to="/assets" className="rounded-md px-3 py-1 font-medium text-slate-600 hover:text-slate-900">
              Detail
            </Link>
          </div>
          <button
            onClick={() => void apiDownload("/reports/inventory?format=csv", "factoryguard-inventory.csv")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
          >
            <span>↓ Export CSV</span>
          </button>
        </div>
      </div>

      {(sitesQuery.error || zonesQuery.error) && <ErrorBox error={sitesQuery.error ?? zonesQuery.error} />}

      {/* MON5 Üst Satır: INVENTORY (2/3) + STATUS · LAST 24H (1/3) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* INVENTORY KARTI (MON5 Görsel 1) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:col-span-8">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">INVENTORY</span>
            <Link to="/assets" className="text-xs font-semibold text-[#EA580C] hover:underline">
              Tüm Envanter →
            </Link>
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-4xl font-extrabold tracking-tight text-slate-900">
              {assetsQuery.isLoading ? "…" : totalAssets}
            </span>
            <span className="text-xs font-medium text-slate-400">total assets</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* TYPE_PC / Endpoint */}
            <Link
              to="/assets"
              className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 transition hover:border-slate-300"
            >
              <div className="flex items-center gap-2 text-[10px] font-mono font-semibold uppercase text-slate-400">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-600 shadow-2xs">
                  💻
                </span>
                <span>TYPE_ENDPOINT</span>
              </div>
              <div className="mt-3 text-2xl font-extrabold text-slate-900">{itEndpointCount}</div>
              <div className="mt-0.5 text-xs text-slate-500">IT / Genel Uç Nokta</div>
            </Link>

            {/* TYPE_PROBE / Sensor */}
            <Link
              to="/sensors"
              className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 transition hover:border-slate-300"
            >
              <div className="flex items-center gap-2 text-[10px] font-mono font-semibold uppercase text-slate-400">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-600 shadow-2xs">
                  📡
                </span>
                <span>TYPE_PROBE</span>
              </div>
              <div className="mt-3 text-2xl font-extrabold text-slate-900">{switchSensorCount}</div>
              <div className="mt-0.5 text-xs text-slate-500">Sensör & Ağ Cihazı</div>
            </Link>

            {/* TYPE_PLC (MON5 Turuncu Vurgulu Kart!) */}
            <Link
              to="/assets"
              className="rounded-xl border-2 border-[#EA580C]/70 bg-orange-50/50 p-3.5 transition hover:bg-orange-50"
            >
              <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase text-[#EA580C]">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-100 text-[#EA580C]">
                  ⚙️
                </span>
                <span>TYPE_PLC</span>
              </div>
              <div className="mt-3 text-2xl font-extrabold text-slate-900">{plcCount}</div>
              <div className="mt-0.5 text-xs font-medium text-[#EA580C]">PLC / OT Kontrolcü</div>
            </Link>

            {/* TYPE_HMI_SCADA */}
            <Link
              to="/assets"
              className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 transition hover:border-slate-300"
            >
              <div className="flex items-center gap-2 text-[10px] font-mono font-semibold uppercase text-slate-400">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-600 shadow-2xs">
                  🖥️
                </span>
                <span>TYPE_SCADA</span>
              </div>
              <div className="mt-3 text-2xl font-extrabold text-slate-900">{hmiScadaCount}</div>
              <div className="mt-0.5 text-xs text-slate-500">HMI & SCADA</div>
            </Link>
          </div>
        </div>

        {/* STATUS · LAST 24H + ATTENTION REQUIRED KARTI (MON5 Görsel 1) */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:col-span-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                STATUS · POSTURE ({postureQuery.data?.grade ?? "A"} · {postureQuery.data?.health_score ?? 100}/100)
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-emerald-50/90 p-3 text-center">
                <div className="text-2xl font-extrabold text-emerald-700">{verifiedCount}</div>
                <div className="mt-0.5 text-[11px] font-medium text-emerald-800">Verified</div>
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-center">
                <div className="text-2xl font-extrabold text-slate-800">{unverifiedCount}</div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-600">Unverified</div>
              </div>
              <div className="rounded-xl bg-rose-50 p-3 text-center">
                <div className="text-2xl font-extrabold text-rose-700">{atRiskDeviceCount}</div>
                <div className="mt-0.5 text-[11px] font-medium text-rose-800">@ Risk</div>
              </div>
            </div>
          </div>

          {/* Attention required kutusu */}
          {topFinding ? (
            <div className="mt-4 rounded-xl border border-rose-200/80 bg-rose-50/60 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                <span>⚠ Attention required</span>
              </div>
              <div className="mt-1 font-mono text-xs font-bold text-slate-900">
                {topFinding.asset_name ?? topFinding.asset_ip ?? "OT Device"} · {topFinding.asset_ip}
              </div>
              <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-600">
                {topFinding.rule_key} · Skor: {topFinding.score}/100 ({topFinding.severity.toUpperCase()})
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <Link
                  to={`/assets/${topFinding.asset_id}`}
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50"
                >
                  Inspect Asset
                </Link>
                <Link to="/risks" className="text-xs font-semibold text-rose-700 hover:underline">
                  Tüm Bulgular ({risks.length}) →
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 text-xs text-emerald-800">
              Açık kritik risk bulgusu yok. Pasif ağ izleme normal devam ediyor.
            </div>
          )}
        </div>
      </div>

      {/* MON5 Orta Satır: VENDORS Yatay Bar Grafiği + OT PROTOCOLS Donut Grafiği */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* VENDORS Kartı */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:col-span-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">VENDORS</span>
            <span className="text-xs text-slate-400">{vendorRanking.length} distinct</span>
          </div>

          {vendorRanking.length === 0 ? (
            <Empty>Henüz cihaz kaydı yok.</Empty>
          ) : (
            <div className="mt-4 space-y-3">
              {vendorRanking.slice(0, 7).map(([vendorName, count]) => {
                const pct = Math.max(8, Math.round((count / maxVendorCount) * 100));
                return (
                  <div key={vendorName}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{vendorName}</span>
                      <span className="font-mono font-bold text-slate-700">{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-[#EA580C]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* OT PROTOCOLS Donut Kartı */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:col-span-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">OT PROTOCOLS</span>
            <span className="text-xs text-slate-400">Industrial comms observed</span>
          </div>

          {protoList.length === 0 ? (
            <Empty>Henüz protokol trafiği gözlenmedi.</Empty>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
              {/* SVG Multi-Segment Donut Chart */}
              <div className="relative flex h-40 w-40 shrink-0 items-center justify-center">
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
                        stroke={DONUT_COLORS[idx % DONUT_COLORS.length]}
                        strokeWidth="16"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={-offset}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-extrabold text-slate-900">{protoList.length}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PROTOCOLS</span>
                </div>
              </div>

              {/* Sağ Yüzde Lejantı */}
              <div className="flex-1 space-y-2.5 w-full">
                {protoList.slice(0, 6).map(([proto, count], idx) => {
                  const pct = Math.round((count / totalProtoConns) * 100);
                  return (
                    <div key={proto} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-mono font-semibold text-slate-800">
                        <span
                          className="h-2.5 w-2.5 rounded-xs"
                          style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                        />
                        {proto}
                      </span>
                      <span className="font-mono font-bold text-slate-700">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Allegro Packets Tarzı: Top Communicating IPs + Fabrikalar & Denetim Kayıtları */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Card
            title="Top Communicating IPs (En Yoğun Haberleşen OT/IT Cihazlar)"
            actions={
              <Link to="/network" className="text-xs font-semibold text-blue-700 hover:underline">
                Assets Map →
              </Link>
            }
          >
            {topCommunicatingAssets.length === 0 ? (
              <Empty>Henüz iletişim akışı gözlenmedi.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">IP (Device Name)</th>
                      <th className="py-2 pr-3">Observed Protocols</th>
                      <th className="py-2 pr-3">Active Flows</th>
                      <th className="py-2 pr-3">Connections</th>
                      <th className="py-2 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topCommunicatingAssets.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-3">
                          <Link
                            to={`/assets/${item.id}`}
                            className="font-mono font-semibold text-blue-700 hover:underline"
                          >
                            {item.ip}
                          </Link>
                          <div className="text-[11px] text-slate-500">({item.name})</div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.from(item.protocols).map((p) => (
                              <span
                                key={p}
                                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-slate-700">{item.flows} flows</td>
                        <td className="py-2.5 pr-3 font-mono font-bold text-slate-900">{item.connections}</td>
                        <td className="py-2.5 text-right">
                          <Link
                            to={`/assets/${item.id}`}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <Card
            title="Fabrikalar ve Üretim Bölgeleri (Zones)"
            actions={
              <Link to="/settings" className="text-xs font-medium text-blue-700 hover:underline">
                Yönet →
              </Link>
            }
          >
            {sitesQuery.isLoading ? (
              <Empty>Yükleniyor…</Empty>
            ) : sites.length === 0 ? (
              <Empty>Henüz fabrika kaydı yok.</Empty>
            ) : (
              <div className="divide-y divide-slate-200">
                {sites.map((site) => {
                  const siteZones = zones.filter((z) => z.site_id === site.id);
                  return (
                    <div key={site.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">{site.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {site.industry || "Endüstriyel Tesis"} · {site.timezone}
                          </div>
                        </div>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {siteZones.length} bölge
                        </span>
                      </div>
                      {siteZones.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {siteZones.map((z) => (
                            <span
                              key={z.id}
                              className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
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
              <Empty>Yönetici yetkisi gerekir.</Empty>
            ) : auditQuery.isLoading ? (
              <Empty>Yükleniyor…</Empty>
            ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
              <Empty>Henüz kayıt yok.</Empty>
            ) : (
              <div className="divide-y divide-slate-100">
                {auditQuery.data!.items.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="font-mono font-medium text-slate-800">{log.action}</span>
                    <span className="text-[11px] text-slate-500">{formatDate(log.created_at)}</span>
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
