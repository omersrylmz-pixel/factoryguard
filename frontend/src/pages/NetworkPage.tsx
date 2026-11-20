import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ASSET_TYPE_LABEL,
  Badge,
  Button,
  Card,
  CriticalityBadge,
  Empty,
  ErrorBox,
  Input,
  PageHeader,
  ProtocolBadge,
  Select,
  StatCard,
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

  const approvedCount = edges.filter((e) => e.is_baseline_approved).length;
  const crossZoneCount = edges.filter((e) => e.cross_zone).length;

  // Merkez Hub + Çevre Halkalar Yerleşimi
  const width = 940;
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
    const hub = sortedNodes[0];
    coords.set(hub.id, { x: cx, y: cy });
    const rest = sortedNodes.slice(1);
    const innerRing = rest.slice(0, 6);
    const outerRing = rest.slice(6);

    innerRing.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(innerRing.length, 1) - Math.PI / 3;
      const rx = outerRing.length > 0 ? 160 : 225;
      const ry = outerRing.length > 0 ? 120 : 165;
      coords.set(n.id, {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      });
    });

    outerRing.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(outerRing.length, 1) - Math.PI / 6;
      coords.set(n.id, {
        x: cx + 335 * Math.cos(angle),
        y: cy + 185 * Math.sin(angle),
      });
    });
  } else {
    sortedNodes.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(sortedNodes.length, 1) - Math.PI / 2;
      coords.set(n.id, {
        x: cx + 295 * Math.cos(angle),
        y: cy + 170 * Math.sin(angle),
      });
    });
  }

  function nodeHexStroke(n: GraphNode): string {
    if (n.criticality === "critical" || n.criticality === "high") return "#E11D48"; // Kırmızı
    if (n.is_verified) return "#0D9488"; // TailAdmin Teal
    return "#D97706"; // Kehribar (Doğrulanmamış)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Network Topology"
        title="Ağ Topolojisi & İletişim Haritası"
        subtitle="Pasif SPAN/PCAP trafiğinden çıkarılan endüstriyel iletişim grafiği ve fabrika baseline onay yönetimi"
        actions={
          <>
            {canEditAssets && edges.length > 0 && (
              <Button
                variant="outline"
                disabled={approveAllMut.isPending}
                onClick={() => approveAllMut.mutate()}
              >
                {approveAllMut.isPending ? "Kaydediliyor…" : "Tümünü Baseline Olarak Onayla"}
              </Button>
            )}
            <Button variant="primary" onClick={() => void graphQuery.refetch()}>
              Topolojiyi Yenile
            </Button>
          </>
        }
      />

      {/* 4 TailAdmin StatCard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Aktif Topoloji Düğümü"
          value={nodes.length}
          hint={`Toplam ${allNodes.length} kayıtlı varlık içinde`}
          tone="teal"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="12" cy="18" r="3" />
              <path d="M8.5 7.5L10.5 15.5M15.5 7.5L13.5 15.5M9 6h6" />
            </svg>
          }
        />
        <StatCard
          label="Gözlemlenen İletişim Akışı"
          value={edges.length}
          hint={`${protocols.length} farklı endüstriyel/IT protokolü`}
          tone="navy"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />
        <StatCard
          label="Onaylı Baseline Akışları"
          value={approvedCount}
          hint={
            edges.length > 0
              ? `%${Math.round((approvedCount / edges.length) * 100)} baseline uyumluluğu`
              : "Henüz akış yok"
          }
          tone="emerald"
          badge={
            edges.length - approvedCount > 0
              ? { text: `${edges.length - approvedCount} İncelemede`, tone: "amber" }
              : { text: "Tam Onaylı", tone: "emerald" }
          }
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 12l2 2 4-4" />
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />
        <StatCard
          label="Bölgeler Arası (Cross-Zone)"
          value={crossZoneCount}
          hint="Farklı güvenlik bölgeleri arası geçiş"
          tone={crossZoneCount > 0 ? "amber" : "teal"}
          badge={
            crossZoneCount > 0
              ? { text: "Segregasyon İncele", tone: "amber" }
              : { text: "İzole", tone: "teal" }
          }
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
      </div>

      {baselineNotice && (
        <div className="flex items-center justify-between rounded-[4px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <span>{baselineNotice}</span>
          <button
            type="button"
            onClick={() => setBaselineNotice(null)}
            className="text-emerald-700 hover:underline"
          >
            Kapat
          </button>
        </div>
      )}

      <ErrorBox error={graphQuery.error || approveAllMut.error || approveSingleMut.error} />

      {/* Topoloji Kartı + Filtre Araç Çubuğu */}
      <Card
        title="Etkileşimli OT Ağ Topolojisi"
        subtitle="Düğümlere tıklayarak cihaz detay konsoluna gidebilir, sağ alt kontrol kulesinden yerleşim ve yakınlaştırmayı değiştirebilirsiniz"
        noPadding
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="IP, cihaz veya protokol ara..."
              />
            </div>
            <div className="w-44">
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Tüm Fabrikalar</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select value={protocolFilter} onChange={(e) => setProtocolFilter(e.target.value)}>
                <option value="">Tüm Protokoller</option>
                {protocols.map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        }
      >
        <div className="relative bg-[#F8FAFC]">
          {graphQuery.isLoading ? (
            <div className="p-6">
              <Empty>Topoloji haritası yükleniyor…</Empty>
            </div>
          ) : edges.length === 0 ? (
            <div className="p-6">
              <Empty>Seçili filtrelere uygun gözlemlenen iletişim ilişkisi bulunmuyor.</Empty>
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="mx-auto h-[470px] w-full select-none"
              >
                <defs>
                  <pattern id="tailadmin-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                    <path
                      d="M 22 0 L 0 0 0 22"
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
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#1C2434" />
                  </marker>
                </defs>

                <rect width={width} height={height} fill="url(#tailadmin-grid)" />

                <g transform={`translate(${cx},${cy}) scale(${zoom}) translate(${-cx},${-cy})`}>
                  {/* İletişim Kenarları */}
                  {edges.map((e) => {
                    const s = coords.get(e.source_asset_id);
                    const t = coords.get(e.target_asset_id);
                    if (!s || !t) return null;
                    const mx = (s.x + t.x) / 2;
                    const my = (s.y + t.y) / 2;
                    const strokeColor = e.is_baseline_approved
                      ? "#0D9488"
                      : e.cross_zone
                        ? "#E11D48"
                        : "#1C2434";
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
                          strokeWidth={Math.min(1.3 + Math.log2(e.connection_count + 1) * 0.7, 3.2)}
                          markerEnd="url(#ot-arrow)"
                        />
                        {showEdgeLabels && (
                          <g>
                            <rect
                              x={mx - 36}
                              y={my - 8}
                              width={72}
                              height={16}
                              rx={3}
                              fill="#FFFFFF"
                              stroke="#CBD5E1"
                              strokeWidth="0.9"
                            />
                            <text
                              x={mx}
                              y={my + 3}
                              textAnchor="middle"
                              className="fill-[#1C2434] font-mono text-[9px] font-semibold"
                            >
                              {e.protocol.toUpperCase()}
                              {e.target_port ? `:${e.target_port}` : ""}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Altıgen Cihaz Düğümleri */}
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
                        <polygon
                          points={OUTER_HEX}
                          fill="#FFFFFF"
                          stroke={borderCol}
                          strokeWidth="2.4"
                        />
                        <polygon
                          points={INNER_HEX}
                          fill="#FFFFFF"
                          stroke={borderCol}
                          strokeWidth="0.8"
                          strokeOpacity="0.45"
                        />
                        <g stroke="#1C2434" strokeWidth="1.4" fill="none">
                          <rect x="-8" y="-9" width="16" height="5" rx="1" />
                          <rect x="-8" y="-2" width="16" height="5" rx="1" />
                          <rect x="-8" y="5" width="16" height="5" rx="1" />
                          <circle cx="-5" cy="-6.5" r="0.8" fill="#0D9488" />
                          <circle cx="-5" cy="0.5" r="0.8" fill="#0D9488" />
                          <circle cx="-5" cy="7.5" r="0.8" fill="#0D9488" />
                        </g>

                        {/* Alt Koyu Lacivert (#1C2434) IP Adresi Rozeti */}
                        <rect
                          x={-44}
                          y={28}
                          width={88}
                          height={15}
                          rx={2}
                          fill="#1C2434"
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

              {/* Sağ Alt Yüzen Harita Kontrol Kulesi */}
              <div className="absolute right-4 bottom-4 flex flex-col gap-1.5">
                <div className="flex flex-col overflow-hidden rounded-[4px] border border-[#E2E8F0] bg-white shadow-xs">
                  <button
                    type="button"
                    title="Protokol Etiketlerini Göster/Gizle"
                    onClick={() => setShowEdgeLabels((v) => !v)}
                    className={`border-b border-[#E2E8F0] px-2.5 py-1.5 text-xs font-medium ${
                      showEdgeLabels ? "bg-teal-50 text-[#0D9488]" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Etiket
                  </button>
                  <button
                    type="button"
                    title="Yerleşim Değiştir (Merkez Hub / Halka)"
                    onClick={() => setLayoutMode((m) => (m === "hub" ? "ring" : "hub"))}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {layoutMode === "hub" ? "Halka" : "Hub"}
                  </button>
                </div>

                <div className="flex flex-col overflow-hidden rounded-[4px] border border-[#E2E8F0] bg-white shadow-xs">
                  <button
                    type="button"
                    title="Yakınlaştır (+)"
                    onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
                    className="border-b border-[#E2E8F0] p-1.5 text-xs font-bold text-[#1C2434] hover:bg-slate-50"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    title="Uzaklaştır (-)"
                    onClick={() => setZoom((z) => Math.max(0.65, +(z - 0.15).toFixed(2)))}
                    className="border-b border-[#E2E8F0] p-1.5 text-xs font-bold text-[#1C2434] hover:bg-slate-50"
                  >
                    －
                  </button>
                  <button
                    type="button"
                    title="Sıfırla"
                    onClick={() => setZoom(1)}
                    className="p-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    1:1
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Alt Lejant Çubuğu */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E2E8F0] bg-white px-6 py-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-5">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs border-2 border-[#0D9488] bg-white" /> Doğrulanmış Düğüm
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs border-2 border-amber-500 bg-white" /> Doğrulanmamış Düğüm
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs border-2 border-rose-600 bg-white" /> Yüksek/Kritik Düğüm
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 bg-[#0D9488]" /> Onaylı Baseline Akışı
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-b border-dashed border-rose-600" /> Cross-Zone / Port İpucu
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Yakınlaştırma: %{Math.round(zoom * 100)} · Yerleşim: {layoutMode === "hub" ? "Merkez Hub" : "Çevre Halka"}
            </span>
          </div>
        </div>
      </Card>

      {/* İletişim Akışları Tablosu (Conversations) */}
      <Card
        title={`Gözlemlenen İletişim Akışları (${edges.length})`}
        subtitle="Kaynak ve hedef OT/IT cihazları arasındaki protokol, port, güven düzeyi ve baseline onay durumu"
        noPadding
      >
        {edges.length === 0 ? (
          <div className="p-6">
            <Empty>Kayıt yok.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Kaynak Varlık</th>
                  <th className="px-4 py-3">Hedef Varlık</th>
                  <th className="px-4 py-3">Protokol / Port</th>
                  <th className="px-4 py-3">Güven & Bölge</th>
                  <th className="px-4 py-3">Baseline Durumu</th>
                  <th className="px-4 py-3">Paket/Akış</th>
                  <th className="px-4 py-3">Son Görülme</th>
                  {canEditAssets && <th className="px-5 py-3 text-right">İşlem</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {edges.map((e) => {
                  const dstNode = nodes.find((n) => n.id === e.target_asset_id);
                  return (
                    <tr key={e.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3">
                        <Link
                          to={`/assets/${e.source_asset_id}`}
                          className="font-semibold text-[#1C2434] hover:text-[#0D9488]"
                        >
                          {e.source_label}
                        </Link>
                        <div className="font-mono text-[11px] text-slate-500">
                          {e.source_ip ?? "—"} · {ASSET_TYPE_LABEL[e.source_type] ?? e.source_type}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/assets/${e.target_asset_id}`}
                            className="font-semibold text-[#1C2434] hover:text-[#0D9488]"
                          >
                            {e.target_label}
                          </Link>
                          {dstNode && <CriticalityBadge value={dstNode.criticality} />}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{e.target_ip ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <ProtocolBadge protocol={e.protocol} />
                          {e.target_port !== null && (
                            <span className="font-mono text-xs text-slate-600">:{e.target_port}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={e.protocol_confidence === "observed" ? "teal" : "slate"}>
                            {e.protocol_confidence === "observed"
                              ? "DPI Doğrulandı"
                              : e.protocol_confidence === "port_hint"
                                ? "Port İpucu"
                                : "Taşıma"}
                          </Badge>
                          {e.cross_zone && <Badge tone="red">Cross-Zone</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {e.is_baseline_approved ? (
                          <Badge tone="emerald" dot>
                            Baseline Onaylı
                          </Badge>
                        ) : (
                          <Badge tone="amber" dot>
                            İnceleme Bekliyor
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-[#1C2434]">{e.connection_count}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{formatDate(e.last_seen_at)}</td>
                      {canEditAssets && (
                        <td className="px-5 py-3 text-right">
                          {!e.is_baseline_approved ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={approveSingleMut.isPending}
                              onClick={() => approveSingleMut.mutate(e.id)}
                            >
                              Onayla
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Onaylandı</span>
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
