import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ASSET_TYPE_LABEL,
  Button,
  Card,
  CriticalityBadge,
  Empty,
  ErrorBox,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { BaselineApproveResult, CommunicationGraph, GraphNode, Site } from "../types/api";

function hexPoints(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(r * Math.cos(angle)).toFixed(1)},${(r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const OUTER_HEX = hexPoints(24);
const INNER_HEX = hexPoints(20);

export default function NetworkPage() {
  const { activeOrg, canEditAssets } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [siteId, setSiteId] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [zoom, setZoom] = useState(1);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [layoutMode, setLayoutMode] = useState<"hub" | "ring">("hub");
  const [baselineNotice, setBaselineNotice] = useState<string | null>(null);

  const sitesQuery = useQuery({
    queryKey: ["sites", activeOrg?.id],
    queryFn: () => api<Site[]>("/sites"),
    enabled: !!activeOrg,
  });

  const graphQuery = useQuery({
    queryKey: ["communications-graph", activeOrg?.id, siteId],
    queryFn: () =>
      api<CommunicationGraph>(`/communications/graph${siteId ? `?site_id=${siteId}` : ""}`),
    enabled: !!activeOrg,
  });

  const approveSingleMut = useMutation({
    mutationFn: (commId: string) =>
      api<BaselineApproveResult>(`/communications/${commId}/approve-baseline`, { method: "POST" }),
    onSuccess: async () => {
      setBaselineNotice("İletişim akışı onaylı fabrika baseline listesine eklendi.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["communications-graph", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] }),
      ]);
    },
  });

  const approveAllMut = useMutation({
    mutationFn: () =>
      api<BaselineApproveResult>(
        `/communications/approve-all-baseline${siteId ? `?site_id=${siteId}` : ""}`,
        { method: "POST" },
      ),
    onSuccess: async (res) => {
      setBaselineNotice(
        `${res.approved_flows} iletişim akışı onaylı fabrika baseline'ı (network baseline) olarak kaydedildi.`,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["communications-graph", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] }),
      ]);
    },
  });

  const sites = sitesQuery.data ?? [];
  const allNodes = graphQuery.data?.nodes ?? [];
  const allEdges = graphQuery.data?.edges ?? [];

  const protocols = Array.from(new Set(allEdges.map((e) => e.protocol))).sort();
  const qLow = searchTerm.trim().toLowerCase();

  const edges = allEdges.filter((e) => {
    if (protocolFilter && e.protocol !== protocolFilter) return false;
    if (qLow) {
      const matchSrc =
        (e.source_ip ?? "").toLowerCase().includes(qLow) ||
        e.source_label.toLowerCase().includes(qLow) ||
        e.protocol.toLowerCase().includes(qLow);
      const matchDst =
        (e.target_ip ?? "").toLowerCase().includes(qLow) ||
        e.target_label.toLowerCase().includes(qLow);
      if (!matchSrc && !matchDst) return false;
    }
    return true;
  });

  const activeNodeIds = new Set(edges.flatMap((e) => [e.source_asset_id, e.target_asset_id]));
  const nodes =
    protocolFilter || qLow ? allNodes.filter((n) => activeNodeIds.has(n.id)) : allNodes;

  // Tenable.ot Tarzı Merkez Hub + Çevre Halkalar Yerleşimi
  const width = 920;
  const height = 470;
  const cx = width / 2;
  const cy = height / 2;

  const degreeMap = new Map<string, number>();
  for (const e of edges) {
    degreeMap.set(e.source_asset_id, (degreeMap.get(e.source_asset_id) ?? 0) + 1);
    degreeMap.set(e.target_asset_id, (degreeMap.get(e.target_asset_id) ?? 0) + 1);
  }
  const sortedNodes = [...nodes].sort(
    (a, b) => (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0),
  );

  const coords = new Map<string, { x: number; y: number }>();
  if (layoutMode === "hub" && sortedNodes.length > 2) {
    // En yüksek bağlantılı düğüm merkezde (Tenable.ot Image 3)
    const hub = sortedNodes[0];
    coords.set(hub.id, { x: cx, y: cy });
    const rest = sortedNodes.slice(1);
    const innerRing = rest.slice(0, 6);
    const outerRing = rest.slice(6);

    innerRing.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(innerRing.length, 1) - Math.PI / 3;
      const rx = outerRing.length > 0 ? 155 : 220;
      const ry = outerRing.length > 0 ? 120 : 165;
      coords.set(n.id, {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      });
    });

    outerRing.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(outerRing.length, 1) - Math.PI / 6;
      coords.set(n.id, {
        x: cx + 330 * Math.cos(angle),
        y: cy + 185 * Math.sin(angle),
      });
    });
  } else {
    sortedNodes.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(sortedNodes.length, 1) - Math.PI / 2;
      coords.set(n.id, {
        x: cx + 290 * Math.cos(angle),
        y: cy + 170 * Math.sin(angle),
      });
    });
  }

  function nodeHexStroke(n: GraphNode): string {
    if (n.criticality === "critical" || n.criticality === "high") return "#DC2626"; // Kırmızı
    if (n.is_verified) return "#16A34A"; // Yeşil
    return "#EAB308"; // Sarı/Kehribar
  }

  return (
    <div className="space-y-5">
      {/* Tenable.ot Tarzı Assets Map Araç Çubuğu */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-xl font-normal tracking-tight text-slate-800">Assets Map</h1>
          <div className="relative w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search IP, device, protocol..."
              className="w-full rounded border border-slate-300 bg-white py-1.5 pr-7 pl-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#0073CF] focus:outline-none"
            />
            <span className="pointer-events-none absolute top-1.5 right-2.5 text-xs text-slate-400">🔍</span>
          </div>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
          >
            <option value="">Tüm Fabrikalar (MILL)</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
          >
            <option value="">Tüm Protokoller</option>
            {protocols.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEditAssets && edges.length > 0 && (
            <button
              type="button"
              disabled={approveAllMut.isPending}
              onClick={() => approveAllMut.mutate()}
              className="rounded border border-[#0073CF] bg-white px-3 py-1.5 text-xs font-semibold text-[#0073CF] hover:bg-sky-50 disabled:opacity-50"
            >
              {approveAllMut.isPending ? "Saving…" : "Set as network baseline"}
            </button>
          )}
          <span className="hidden rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-600 xl:inline">
            {nodes.length} Nodes · {edges.length} Conversations
          </span>
          <button
            type="button"
            onClick={() => void graphQuery.refetch()}
            className="rounded bg-[#0073CF] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#005FA8]"
          >
            Refresh
          </button>
        </div>
      </div>

      {baselineNotice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {baselineNotice}
        </div>
      )}

      <ErrorBox error={graphQuery.error || approveAllMut.error || approveSingleMut.error} />

      {/* Tenable.ot Altıgen (Hexagonal) Ağ Topoloji Tuvali */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-[#F4F6F9] shadow-2xs">
        {graphQuery.isLoading ? (
          <Empty>Topoloji haritası yükleniyor…</Empty>
        ) : edges.length === 0 ? (
          <Empty>Gözlemlenen iletişim ilişkisi bulunmuyor.</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="mx-auto h-[470px] w-full select-none"
            >
              <defs>
                {/* İnce teknik ızgara arka planı (Tenable.ot Image 3) */}
                <pattern id="tenable-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path
                    d="M 20 0 L 0 0 0 20"
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth="0.7"
                  />
                </pattern>
                <marker
                  id="ot-arrow"
                  viewBox="0 0 10 10"
                  refX="30"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#1E3A8A" />
                </marker>
              </defs>

              <rect width={width} height={height} fill="url(#tenable-grid)" />

              <g transform={`translate(${cx},${cy}) scale(${zoom}) translate(${-cx},${-cy})`}>
                {/* İletişim Kenarları */}
                {edges.map((e) => {
                  const s = coords.get(e.source_asset_id);
                  const t = coords.get(e.target_asset_id);
                  if (!s || !t) return null;
                  const mx = (s.x + t.x) / 2;
                  const my = (s.y + t.y) / 2;
                  const strokeColor = e.is_baseline_approved
                    ? "#026AA7"
                    : e.cross_zone
                      ? "#DC2626"
                      : "#1E3A8A";
                  return (
                    <g key={e.id}>
                      <line
                        x1={s.x}
                        y1={s.y}
                        x2={t.x}
                        y2={t.y}
                        stroke={strokeColor}
                        strokeDasharray={
                          e.protocol_confidence === "port_hint" || (e.cross_zone && !e.is_baseline_approved)
                            ? "4,3"
                            : undefined
                        }
                        strokeWidth={Math.min(1.2 + Math.log2(e.connection_count + 1) * 0.7, 3.2)}
                        markerEnd="url(#ot-arrow)"
                      />
                      {showEdgeLabels && (
                        <g>
                          <rect
                            x={mx - 34}
                            y={my - 8}
                            width={68}
                            height={15}
                            rx={3}
                            fill="#FFFFFF"
                            stroke="#CBD5E1"
                            strokeWidth="0.8"
                          />
                          <text
                            x={mx}
                            y={my + 2.5}
                            textAnchor="middle"
                            className="fill-slate-700 font-mono text-[9px] font-semibold"
                          >
                            {e.protocol.toUpperCase()}
                            {e.target_port ? `:${e.target_port}` : ""}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Altıgen (Hexagonal) Cihaz Düğümleri ve Koyu Mavi IP Rozetleri (Tenable.ot Image 3) */}
                {nodes.map((n) => {
                  const c = coords.get(n.id);
                  if (!c) return null;
                  const borderCol = nodeHexStroke(n);
                  const ipText = n.ip_address || n.label;
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${c.x},${c.y})`}
                      onClick={() => navigate(`/assets/${n.id}`)}
                      className="cursor-pointer transition-opacity hover:opacity-90"
                    >
                      {/* Dış Altıgen (Sağlık/Risk Rengi) */}
                      <polygon
                        points={OUTER_HEX}
                        fill="#FFFFFF"
                        stroke={borderCol}
                        strokeWidth="2.4"
                      />
                      {/* İç Altıgen */}
                      <polygon
                        points={INNER_HEX}
                        fill="#FFFFFF"
                        stroke={borderCol}
                        strokeWidth="0.8"
                        strokeOpacity="0.5"
                      />
                      {/* Cihaz İkonu (Kontrolcü / Sunucu / HMI) */}
                      <g stroke="#026AA7" strokeWidth="1.4" fill="none">
                        <rect x="-8" y="-9" width="16" height="5" rx="1" />
                        <rect x="-8" y="-2" width="16" height="5" rx="1" />
                        <rect x="-8" y="5" width="16" height="5" rx="1" />
                        <circle cx="-5" cy="-6.5" r="0.8" fill="#026AA7" />
                        <circle cx="-5" cy="0.5" r="0.8" fill="#026AA7" />
                        <circle cx="-5" cy="7.5" r="0.8" fill="#026AA7" />
                      </g>

                      {/* Alt Koyu Mavi IP Adresi Rozeti (#026AA7) */}
                      <rect
                        x={-42}
                        y={28}
                        width={84}
                        height={15}
                        rx={2}
                        fill="#026AA7"
                      />
                      <text
                        y={38.5}
                        textAnchor="middle"
                        className="fill-white font-mono text-[9.5px] font-bold"
                      >
                        {ipText}
                      </text>
                      {n.label !== ipText && (
                        <text
                          y={51}
                          textAnchor="middle"
                          className="fill-slate-600 text-[9px] font-medium"
                        >
                          {n.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Sağ Alt Yüzen Harita Kontrol Kulesi (Tenable.ot Image 3) */}
            <div className="absolute right-4 bottom-4 flex flex-col gap-1.5">
              <div className="flex flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
                <button
                  type="button"
                  title="Etiketleri Göster/Gizle"
                  onClick={() => setShowEdgeLabels((v) => !v)}
                  className="border-b border-slate-200 p-2 text-xs text-slate-600 hover:bg-slate-100"
                >
                  👁
                </button>
                <button
                  type="button"
                  title="Yerleşim Değiştir (Hub / Halka)"
                  onClick={() => setLayoutMode((m) => (m === "hub" ? "ring" : "hub"))}
                  className="p-2 text-xs text-slate-600 hover:bg-slate-100"
                >
                  品
                </button>
              </div>

              <div className="flex flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
                <button
                  type="button"
                  title="Yakınlaştır (+)"
                  onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
                  className="border-b border-slate-200 p-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  ＋
                </button>
                <button
                  type="button"
                  title="Uzaklaştır (-)"
                  onClick={() => setZoom((z) => Math.max(0.65, +(z - 0.15).toFixed(2)))}
                  className="border-b border-slate-200 p-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  －
                </button>
                <button
                  type="button"
                  title="Sıfırla"
                  onClick={() => setZoom(1)}
                  className="p-2 text-xs text-slate-600 hover:bg-slate-100"
                >
                  ⤢
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Alt Lejant Çubuğu */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-2.5 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs border-2 border-emerald-600 bg-white" /> Verified Safe Node
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs border-2 border-amber-500 bg-white" /> Unverified Node
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs border-2 border-red-600 bg-white" /> High/Critical Node
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-[#026AA7]" /> Baseline Flow
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-b border-dashed border-red-600" /> Cross-Zone / Port Hint
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            İpucu: Detay konsolunu açmak için haritadaki herhangi bir altıgen cihaza tıklayın.
          </span>
        </div>
      </div>

      {/* İletişim Akışları Tablosu (Conversations) */}
      <Card title={`Conversations · Gözlemlenen İletişim Akışları (${edges.length})`}>
        {edges.length === 0 ? (
          <Empty>Kayıt yok.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1E2D3B] text-[11px] font-semibold uppercase text-white">
                <tr>
                  <th className="px-3 py-2.5">Source Asset</th>
                  <th className="px-3 py-2.5">Target Asset</th>
                  <th className="px-3 py-2.5">Protocol / Port</th>
                  <th className="px-3 py-2.5">Baseline Status</th>
                  <th className="px-3 py-2.5">Flows</th>
                  <th className="px-3 py-2.5">Last Seen</th>
                  {canEditAssets && <th className="px-3 py-2.5 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {edges.map((e, idx) => {
                  const dstNode = nodes.find((n) => n.id === e.target_asset_id);
                  return (
                    <tr key={e.id} className={idx % 2 === 1 ? "bg-slate-50/80" : "bg-white"}>
                      <td className="px-3 py-2.5">
                        <Link
                          to={`/assets/${e.source_asset_id}`}
                          className="font-semibold text-[#026AA7] hover:underline"
                        >
                          {e.source_label}
                        </Link>
                        <div className="font-mono text-[11px] text-slate-500">
                          {e.source_ip ?? "—"} · {ASSET_TYPE_LABEL[e.source_type] ?? e.source_type}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/assets/${e.target_asset_id}`}
                            className="font-semibold text-[#026AA7] hover:underline"
                          >
                            {e.target_label}
                          </Link>
                          {dstNode && <CriticalityBadge value={dstNode.criticality} />}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{e.target_ip ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                          {e.protocol.toUpperCase()}
                        </span>
                        {e.target_port !== null && <span className="ml-1 text-slate-600">:{e.target_port}</span>}
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 font-sans text-[10px] font-medium ${
                            e.protocol_confidence === "observed"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {e.protocol_confidence === "observed"
                            ? "Doğrulandı"
                            : e.protocol_confidence === "port_hint"
                              ? "Port İpucu"
                              : "Taşıma"}
                        </span>
                        {e.cross_zone && (
                          <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-red-700">
                            Cross-Zone
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {e.is_baseline_approved ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            ✓ Baseline Approved
                          </span>
                        ) : (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            Pending Review
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{e.connection_count}</td>
                      <td className="px-3 py-2.5 text-slate-500">{formatDate(e.last_seen_at)}</td>
                      {canEditAssets && (
                        <td className="px-3 py-2.5 text-right">
                          {!e.is_baseline_approved && (
                            <Button
                              variant="secondary"
                              disabled={approveSingleMut.isPending}
                              onClick={() => approveSingleMut.mutate(e.id)}
                            >
                              Approve Baseline
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
