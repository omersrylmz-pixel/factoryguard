import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { ASSET_TYPE_LABEL, Card, CriticalityBadge, Empty, ErrorBox, Field, PageHeader, Select, formatDate } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { CommunicationGraph, Site } from "../types/api";

export default function NetworkPage() {
  const { activeOrg } = useAuth();
  const [siteId, setSiteId] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("");

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

  const sites = sitesQuery.data ?? [];
  const allNodes = graphQuery.data?.nodes ?? [];
  const allEdges = graphQuery.data?.edges ?? [];

  const protocols = Array.from(new Set(allEdges.map((e) => e.protocol))).sort();
  const edges = protocolFilter ? allEdges.filter((e) => e.protocol === protocolFilter) : allEdges;
  const activeNodeIds = new Set(edges.flatMap((e) => [e.source_asset_id, e.target_asset_id]));
  const nodes = protocolFilter ? allNodes.filter((n) => activeNodeIds.has(n.id)) : allNodes;

  // Dairesel SVG yerleşimi (yalnızca gerçek gözlemlenen düğümler ve kenarlar)
  const width = 760;
  const height = 380;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.36;

  const coords = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, idx) => {
    const angle = (2 * Math.PI * idx) / Math.max(nodes.length, 1) - Math.PI / 2;
    coords.set(n.id, {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ağ İletişim Görünümü"
        subtitle="Yalnızca pasif olarak gözlemlenen gerçek cihazlar arası iletişim ilişkileri (tahmini bağlantı gösterilmez)"
      />

      <Card title="Filtreler">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Fabrika (Site)">
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Tüm Fabrikalar</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Protokol">
            <Select value={protocolFilter} onChange={(e) => setProtocolFilter(e.target.value)}>
              <option value="">Tüm Protokoller</option>
              {protocols.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <ErrorBox error={graphQuery.error} />

      <Card title={`Topoloji Görünümü (${nodes.length} Cihaz, ${edges.length} İletişim Akışı)`}>
        {graphQuery.isLoading ? (
          <Empty>Yükleniyor…</Empty>
        ) : edges.length === 0 ? (
          <Empty>Gözlemlenen iletişim ilişkisi bulunmuyor.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto h-96 w-full max-w-4xl rounded bg-slate-50">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="26" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
                </marker>
              </defs>
              {edges.map((e) => {
                const s = coords.get(e.source_asset_id);
                const t = coords.get(e.target_asset_id);
                if (!s || !t) return null;
                const mx = (s.x + t.x) / 2;
                const my = (s.y + t.y) / 2;
                return (
                  <g key={e.id}>
                    <line
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke="#64748b"
                      strokeWidth={Math.min(1.5 + Math.log2(e.connection_count + 1), 4)}
                      markerEnd="url(#arrow)"
                    />
                    <rect x={mx - 36} y={my - 9} width={72} height={18} rx={4} fill="#ffffff" stroke="#cbd5e1" />
                    <text x={mx} y={my + 3} textAnchor="middle" className="fill-slate-700 font-mono text-[10px]">
                      {e.protocol.toUpperCase()}
                      {e.target_port ? `:${e.target_port}` : ""}
                    </text>
                  </g>
                );
              })}
              {nodes.map((n) => {
                const c = coords.get(n.id);
                if (!c) return null;
                return (
                  <g key={n.id} transform={`translate(${c.x},${c.y})`}>
                    <circle
                      r={20}
                      fill={n.is_verified ? "#1d4ed8" : "#f59e0b"}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                    <text y={34} textAnchor="middle" className="fill-slate-900 text-[11px] font-semibold">
                      {n.label}
                    </text>
                    <text y={46} textAnchor="middle" className="fill-slate-500 text-[10px]">
                      {ASSET_TYPE_LABEL[n.asset_type] ?? n.asset_type}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="mt-2 flex items-center justify-center gap-6 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-blue-700" /> Doğrulanmış Cihaz
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-amber-500" /> Doğrulanmamış Cihaz
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card title={`Gözlemlenen İletişim Akışları (${edges.length})`}>
        {edges.length === 0 ? (
          <Empty>Kayıt yok.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Kaynak Cihaz</th>
                  <th className="py-2 pr-4">Hedef Cihaz</th>
                  <th className="py-2 pr-4">Protokol / Hedef Port</th>
                  <th className="py-2 pr-4">Bağlantı Sayısı</th>
                  <th className="py-2 pr-4">İlk Görülme</th>
                  <th className="py-2 text-right">Son Görülme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {edges.map((e) => {
                  const dstNode = nodes.find((n) => n.id === e.target_asset_id);
                  return (
                    <tr key={e.id}>
                      <td className="py-2.5 pr-4">
                        <Link to={`/assets/${e.source_asset_id}`} className="font-medium text-blue-700 hover:underline">
                          {e.source_label}
                        </Link>
                        <div className="font-mono text-xs text-slate-500">{e.source_ip ?? "—"}</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/assets/${e.target_asset_id}`}
                            className="font-medium text-blue-700 hover:underline"
                          >
                            {e.target_label}
                          </Link>
                          {dstNode && <CriticalityBadge value={dstNode.criticality} />}
                        </div>
                        <div className="font-mono text-xs text-slate-500">{e.target_ip ?? "—"}</div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-800">
                          {e.protocol.toUpperCase()}
                        </span>
                        {e.target_port !== null && <span className="ml-1.5 text-slate-600">:{e.target_port}</span>}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{e.connection_count}</td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500">{formatDate(e.first_seen_at)}</td>
                      <td className="py-2.5 text-right text-xs text-slate-500">{formatDate(e.last_seen_at)}</td>
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
