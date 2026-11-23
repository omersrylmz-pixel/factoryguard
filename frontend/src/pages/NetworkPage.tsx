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
import { useLang } from "../i18n";
import { api } from "../services/api";
import type {
  BaselineApproveResult,
  CommunicationEdge,
  CommunicationGraph,
  GraphNode,
  Site,
} from "../types/api";

function hexPoints(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(r * Math.cos(angle)).toFixed(1)},${(r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const OUTER_HEX = hexPoints(22);
const INNER_HEX = hexPoints(18);

type LayoutMode = "purdue" | "hub" | "ring";
type PurdueTier = "L3" | "L2" | "L1";

function inferPurdueTier(node: GraphNode): PurdueTier {
  if (["server", "network_device", "computer"].includes(node.asset_type)) {
    return "L3";
  }
  if (
    ["scada_server", "hmi", "engineering_workstation", "industrial_pc"].includes(
      node.asset_type,
    )
  ) {
    return "L2";
  }
  return "L1";
}

export default function NetworkPage() {
  const { activeOrg, canEditAssets } = useAuth();
  const { t } = useLang();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [siteId, setSiteId] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [zoom, setZoom] = useState(1);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("purdue");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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
      setBaselineNotice(
        t(
          "İletişim akışı onaylı fabrika baseline listesine eklendi.",
          "Communication flow added to the approved plant baseline.",
        ),
      );
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
        t(
          `${res.approved_flows} iletişim akışı onaylı fabrika baseline'ı olarak kaydedildi.`,
          `${res.approved_flows} communication flows saved as approved plant baseline.`,
        ),
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

  // Tuval boyutları
  const width = 980;
  const height = 560;
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

  // Yerleşim hesaplama (Purdue Şeritleri / Merkez Hub / Çevre Halka)
  const coords = new Map<string, { x: number; y: number; tier: PurdueTier }>();

  const purdueBands: {
    tier: PurdueTier;
    yCenter: number;
    yTop: number;
    height: number;
    code: string;
    title: string;
    subtitle: string;
    bg: string;
    stroke: string;
    badgeBg: string;
  }[] = [
    {
      tier: "L3",
      yCenter: 100,
      yTop: 22,
      height: 155,
      code: "PURDUE L3 / IT",
      title: t("Operasyon & Kurumsal Ağ", "Operations & Enterprise IT"),
      subtitle: t("Sunucu, Ağ Cihazı, İstemci", "Servers, Switches, Workstations"),
      bg: "#F8FAFC",
      stroke: "#CBD5E1",
      badgeBg: "#475569",
    },
    {
      tier: "L2",
      yCenter: 280,
      yTop: 196,
      height: 165,
      code: "PURDUE L2",
      title: t("Süpervizör, SCADA & HMI", "Supervisory, SCADA & HMI"),
      subtitle: t("SCADA Sunucusu, HMI, Mühendislik", "SCADA Servers, HMIs, Engineering"),
      bg: "#F0FDFA",
      stroke: "#99F6E4",
      badgeBg: "#0F766E",
    },
    {
      tier: "L1",
      yCenter: 460,
      yTop: 380,
      height: 160,
      code: "PURDUE L1 / L0",
      title: t("PLC & Saha Kontrol Katmanı", "PLC & Field Control Layer"),
      subtitle: t("PLC, RTU, Saha Ekipmanı", "PLCs, RTUs, Field Controllers"),
      bg: "#FFFBEB",
      stroke: "#FDE68A",
      badgeBg: "#B45309",
    },
  ];

  if (layoutMode === "purdue") {
    const byTier: Record<PurdueTier, GraphNode[]> = { L3: [], L2: [], L1: [] };
    for (const n of nodes) {
      byTier[inferPurdueTier(n)].push(n);
    }
    for (const band of purdueBands) {
      const list = byTier[band.tier].sort((a, b) =>
        (a.ip_address ?? a.label).localeCompare(b.ip_address ?? b.label),
      );
      const count = list.length;
      if (count === 0) continue;
      const xStart = 235;
      const xEnd = width - 75;
      const span = xEnd - xStart;
      list.forEach((n, idx) => {
        const x = count === 1 ? (xStart + xEnd) / 2 : xStart + (span * idx) / (count - 1);
        // Çok sayıda düğüm varsa dikeyde hafif şaşırtmalı yerleştirerek etiket çakışmasını önle
        const staggerY = count >= 5 ? (idx % 2 === 0 ? -16 : 16) : 0;
        coords.set(n.id, { x, y: band.yCenter + staggerY, tier: band.tier });
      });
    }
  } else if (layoutMode === "hub" && sortedNodes.length > 2) {
    const hub = sortedNodes[0];
    coords.set(hub.id, { x: cx, y: cy, tier: inferPurdueTier(hub) });
    const rest = sortedNodes.slice(1);
    const innerRing = rest.slice(0, 6);
    const outerRing = rest.slice(6);

    innerRing.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(innerRing.length, 1) - Math.PI / 3;
      const rx = outerRing.length > 0 ? 175 : 240;
      const ry = outerRing.length > 0 ? 125 : 175;
      coords.set(n.id, {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
        tier: inferPurdueTier(n),
      });
    });

    outerRing.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(outerRing.length, 1) - Math.PI / 6;
      coords.set(n.id, {
        x: cx + 355 * Math.cos(angle),
        y: cy + 195 * Math.sin(angle),
        tier: inferPurdueTier(n),
      });
    });
  } else {
    sortedNodes.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(sortedNodes.length, 1) - Math.PI / 2;
      coords.set(n.id, {
        x: cx + 315 * Math.cos(angle),
        y: cy + 185 * Math.sin(angle),
        tier: inferPurdueTier(n),
      });
    });
  }

  // Çakışmasız (Anti-Collision) Kenar ve Etiket Yerleşimi
  const placedLabels: { x: number; y: number }[] = [];
  for (const [, c] of coords) {
    // Düğüm merkezlerini ve alt etiketlerini koruma alanı olarak kaydet
    placedLabels.push({ x: c.x, y: c.y });
    placedLabels.push({ x: c.x, y: c.y + 38 });
  }

  function computeEdgeGeometry(e: CommunicationEdge, idx: number) {
    const s = coords.get(e.source_asset_id);
    const tCoord = coords.get(e.target_asset_id);
    if (!s || !tCoord) return null;

    const sameRow = Math.abs(s.y - tCoord.y) < 36;
    const dx = tCoord.x - s.x;
    const dy = tCoord.y - s.y;

    // Aynı yatay şeritteki uzak iki düğüm arasındaki çizginin aradaki düğümleri kesmemesi için kavis
    const curveOffset = sameRow ? (idx % 2 === 0 ? -44 : 44) : (idx % 3 - 1) * 18;
    const ctrlX = (s.x + tCoord.x) / 2 + (!sameRow ? curveOffset : 0);
    const ctrlY = (s.y + tCoord.y) / 2 + (sameRow ? curveOffset : 0);

    // Kavis üzerindeki orta nokta (t = 0.5 için Quadratic Bezier: 0.25*P0 + 0.5*P1 + 0.25*P2)
    let lx = 0.25 * s.x + 0.5 * ctrlX + 0.25 * tCoord.x;
    let ly = 0.25 * s.y + 0.5 * ctrlY + 0.25 * tCoord.y;

    // Çakışma kontrolü: mevcut düğüm veya etiketlere çok yakınsa dikey/yatay kaydır
    const candidates = [
      { x: lx, y: ly },
      { x: lx, y: ly - 22 },
      { x: lx, y: ly + 22 },
      { x: lx - 38, y: ly - 16 },
      { x: lx + 38, y: ly + 16 },
      { x: lx, y: ly - 40 },
      { x: lx, y: ly + 40 },
    ];
    for (const cand of candidates) {
      const collides = placedLabels.some(
        (p) => Math.abs(p.x - cand.x) < 74 && Math.abs(p.y - cand.y) < 20,
      );
      if (!collides) {
        lx = cand.x;
        ly = cand.y;
        break;
      }
    }
    placedLabels.push({ x: lx, y: ly });

    const pathD =
      Math.abs(dx) > 10 || Math.abs(dy) > 10
        ? `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${tCoord.x.toFixed(1)} ${tCoord.y.toFixed(1)}`
        : `M ${s.x} ${s.y} L ${tCoord.x} ${tCoord.y}`;

    return { s, tCoord, pathD, lx, ly };
  }

  function nodeHexStroke(n: GraphNode): string {
    if (n.criticality === "critical" || n.criticality === "high") return "#E11D48";
    if (n.is_verified) return "#0D9488";
    return "#D97706";
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedNodeEdges = selectedNode
    ? edges.filter(
        (e) => e.source_asset_id === selectedNode.id || e.target_asset_id === selectedNode.id,
      )
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={t("Ağ Topolojisi", "Network Topology")}
        title={t("Ağ Topolojisi & Purdue Katman Haritası", "Network Topology & Purdue Layer Map")}
        subtitle={t(
          "ISA-95 / Purdue katmanlarına göre endüstriyel iletişim grafiği ve fabrika baseline yönetimi",
          "Industrial communication graph structured by ISA-95 / Purdue layers and plant baseline management",
        )}
        actions={
          <>
            {canEditAssets && edges.length > 0 && (
              <Button
                variant="outline"
                disabled={approveAllMut.isPending}
                onClick={() => approveAllMut.mutate()}
              >
                {approveAllMut.isPending
                  ? t("Kaydediliyor…", "Saving…")
                  : t("Tümünü Baseline Onayla", "Approve All as Baseline")}
              </Button>
            )}
            <Button variant="primary" onClick={() => void graphQuery.refetch()}>
              {t("Topolojiyi Yenile", "Refresh Topology")}
            </Button>
          </>
        }
      />

      {/* 4 TailAdmin StatCard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("Aktif Topoloji Düğümü", "Active Topology Nodes")}
          value={nodes.length}
          hint={t(`Toplam ${allNodes.length} kayıtlı varlık`, `Out of ${allNodes.length} registered assets`)}
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
          label={t("Gözlemlenen İletişim Akışı", "Observed Network Flows")}
          value={edges.length}
          hint={t(`${protocols.length} farklı protokol`, `${protocols.length} distinct protocols`)}
          tone="navy"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />
        <StatCard
          label={t("Onaylı Baseline Akışları", "Approved Baseline Flows")}
          value={approvedCount}
          hint={
            edges.length > 0
              ? t(
                  `%${Math.round((approvedCount / edges.length) * 100)} baseline uyumu`,
                  `${Math.round((approvedCount / edges.length) * 100)}% baseline compliance`,
                )
              : t("Henüz akış yok", "No flows yet")
          }
          tone="emerald"
          badge={
            edges.length - approvedCount > 0
              ? {
                  text: t(`${edges.length - approvedCount} İncelemede`, `${edges.length - approvedCount} Pending`),
                  tone: "amber",
                }
              : { text: t("Tam Onaylı", "All Approved"), tone: "emerald" }
          }
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 12l2 2 4-4" />
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />
        <StatCard
          label={t("Bölgeler Arası Geçiş", "Cross-Zone Flows")}
          value={crossZoneCount}
          hint={t("Farklı güvenlik bölgeleri arası", "Across different security zones")}
          tone={crossZoneCount > 0 ? "amber" : "teal"}
          badge={
            crossZoneCount > 0
              ? { text: t("Segmentasyon İncele", "Review Segmentation"), tone: "amber" }
              : { text: t("İzole", "Isolated"), tone: "teal" }
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
            {t("Kapat", "Dismiss")}
          </button>
        </div>
      )}

      <ErrorBox error={graphQuery.error || approveAllMut.error || approveSingleMut.error} />

      {/* Topoloji Kartı + Yerleşim Modu & Filtre Araç Çubuğu */}
      <Card
        title={t("ISA-95 / Purdue Katmanlı OT Ağ Topolojisi", "ISA-95 / Purdue Layered OT Network Topology")}
        subtitle={t(
          "Bir düğüme tıklayarak bağlı akışlarını vurgulayın ve sağ/alt inceleme çekmecesini açın",
          "Click any node to highlight its connected flows and open the node inspection drawer",
        )}
        noPadding
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Yerleşim Modu Seçici */}
            <div className="flex h-9 items-center rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-0.5 text-xs">
              {(
                [
                  { id: "purdue", label: t("Purdue Katmanları", "Purdue Layers") },
                  { id: "hub", label: t("Merkez Hub", "Center Hub") },
                  { id: "ring", label: t("Halka", "Ring") },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setLayoutMode(m.id)}
                  className={`h-full rounded-[3px] px-2.5 text-xs font-semibold transition ${
                    layoutMode === m.id
                      ? "bg-[#1C2434] text-white"
                      : "text-[#64748B] hover:text-[#1C2434]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="w-48">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("IP, cihaz, protokol...", "IP, device, protocol...")}
              />
            </div>
            <div className="w-40">
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">{t("Tüm Fabrikalar", "All Sites")}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-36">
              <Select value={protocolFilter} onChange={(e) => setProtocolFilter(e.target.value)}>
                <option value="">{t("Tüm Protokoller", "All Protocols")}</option>
                {protocols.map((p) => (
                  <option key={p} value={p}>
                    {p.replace(/\?+$/, "").toUpperCase()}
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
              <Empty>{t("Topoloji haritası yükleniyor…", "Loading topology map…")}</Empty>
            </div>
          ) : edges.length === 0 ? (
            <div className="p-6">
              <Empty>
                {t(
                  "Seçili filtrelere uygun gözlemlenen iletişim ilişkisi bulunmuyor.",
                  "No observed communication flows match the selected filters.",
                )}
              </Empty>
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="mx-auto h-[530px] w-full select-none"
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
                    refX="28"
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
                  {/* Purdue Yatay Şeritleri (Swimlanes) */}
                  {layoutMode === "purdue" &&
                    purdueBands.map((band) => (
                      <g key={band.tier}>
                        <rect
                          x={16}
                          y={band.yTop}
                          width={width - 32}
                          height={band.height}
                          rx={6}
                          fill={band.bg}
                          fillOpacity="0.75"
                          stroke={band.stroke}
                          strokeWidth="1.2"
                          strokeDasharray="5,4"
                        />
                        {/* Sol Şerit Başlığı */}
                        <rect
                          x={28}
                          y={band.yTop + 14}
                          width={158}
                          height={20}
                          rx={3}
                          fill={band.badgeBg}
                        />
                        <text
                          x={36}
                          y={band.yTop + 28}
                          className="fill-white font-mono text-[10px] font-bold"
                        >
                          {band.code}
                        </text>
                        <text
                          x={28}
                          y={band.yTop + 50}
                          className="fill-[#1C2434] text-[11px] font-bold"
                        >
                          {band.title}
                        </text>
                        <text
                          x={28}
                          y={band.yTop + 66}
                          className="fill-[#64748B] text-[9.5px]"
                        >
                          {band.subtitle}
                        </text>
                      </g>
                    ))}

                  {/* İletişim Kenarları (Kavisli & Çakışmasız Etiketli) */}
                  {edges.map((e, edgeIdx) => {
                    const geom = computeEdgeGeometry(e, edgeIdx);
                    if (!geom) return null;
                    const isHighlighted =
                      !selectedNodeId ||
                      e.source_asset_id === selectedNodeId ||
                      e.target_asset_id === selectedNodeId;
                    const strokeColor = e.is_baseline_approved
                      ? "#0D9488"
                      : e.cross_zone
                        ? "#E11D48"
                        : "#1C2434";
                    const cleanProto = e.protocol.replace(/\?+$/, "").toUpperCase();
                    return (
                      <g
                        key={e.id}
                        opacity={isHighlighted ? 1 : 0.22}
                        className="transition-opacity"
                      >
                        <path
                          d={geom.pathD}
                          fill="none"
                          stroke={strokeColor}
                          strokeDasharray={
                            e.protocol_confidence === "port_hint" || (e.cross_zone && !e.is_baseline_approved)
                              ? "4,3"
                              : undefined
                          }
                          strokeWidth={Math.min(1.4 + Math.log2(e.connection_count + 1) * 0.65, 3.2)}
                          markerEnd="url(#ot-arrow)"
                        />
                        {showEdgeLabels && isHighlighted && (
                          <g>
                            <rect
                              x={geom.lx - 37}
                              y={geom.ly - 8}
                              width={74}
                              height={16}
                              rx={3}
                              fill="#FFFFFF"
                              stroke={strokeColor}
                              strokeWidth="0.9"
                            />
                            <text
                              x={geom.lx}
                              y={geom.ly + 3}
                              textAnchor="middle"
                              className="fill-[#1C2434] font-mono text-[8.8px] font-semibold"
                            >
                              {cleanProto}
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
                    const shortLabel =
                      n.label !== ipText
                        ? n.label.length > 22
                          ? `${n.label.slice(0, 20)}…`
                          : n.label
                        : null;
                    const isSelected = selectedNodeId === n.id;
                    const isConnectedToSelected =
                      !selectedNodeId ||
                      isSelected ||
                      edges.some(
                        (e) =>
                          (e.source_asset_id === selectedNodeId && e.target_asset_id === n.id) ||
                          (e.target_asset_id === selectedNodeId && e.source_asset_id === n.id),
                      );

                    return (
                      <g
                        key={n.id}
                        transform={`translate(${c.x},${c.y})`}
                        opacity={isConnectedToSelected ? 1 : 0.35}
                        onClick={() =>
                          setSelectedNodeId((prev) => (prev === n.id ? null : n.id))
                        }
                        onDoubleClick={() => navigate(`/assets/${n.id}`)}
                        className="cursor-pointer transition-opacity hover:opacity-95"
                      >
                        <title>{`${n.label} (${ipText}) — ${t("Seçmek için tıkla, detaya gitmek için çift tıkla", "Click to inspect, double-click for details")}`}</title>
                        {isSelected && (
                          <circle
                            r="29"
                            fill="none"
                            stroke="#0D9488"
                            strokeWidth="2"
                            strokeDasharray="3,2"
                          />
                        )}
                        <polygon
                          points={OUTER_HEX}
                          fill="#FFFFFF"
                          stroke={borderCol}
                          strokeWidth={isSelected ? "3" : "2.4"}
                        />
                        <polygon
                          points={INNER_HEX}
                          fill="#FFFFFF"
                          stroke={borderCol}
                          strokeWidth="0.8"
                          strokeOpacity="0.45"
                        />
                        {/* Cihaz Türüne Özel Donanım Çizimi (PLC / HMI / SCADA / Switch / İstasyon) */}
                        {n.asset_type === "plc" ? (
                          <g stroke="#1C2434" strokeWidth="1.2" fill="none">
                            {/* DIN-Rail PLC Modülü + LCD + LED */}
                            <rect x="-9" y="-9" width="11" height="18" rx="1" fill="#F8FAFC" />
                            <rect x="2" y="-9" width="7" height="18" rx="1" fill="#F1F5F9" />
                            <rect x="-7" y="-4" width="7" height="5" rx="0.5" fill="#CCFBF1" stroke="#0D9488" strokeWidth="0.9" />
                            <circle cx="-6" cy="-6.8" r="0.9" fill="#10B981" stroke="none" />
                            <circle cx="-3" cy="-6.8" r="0.9" fill={borderCol} stroke="none" />
                            <circle cx="5.5" cy="-5" r="0.8" fill="#10B981" stroke="none" />
                            <circle cx="5.5" cy="-1" r="0.8" fill="#10B981" stroke="none" />
                            <circle cx="5.5" cy="3" r="0.8" fill="#F59E0B" stroke="none" />
                          </g>
                        ) : n.asset_type === "hmi" ? (
                          <g stroke="#1C2434" strokeWidth="1.2" fill="none">
                            {/* Dokunmatik HMI Paneli + Proses Dalga Grafiği */}
                            <rect x="-10" y="-8" width="20" height="15" rx="1.5" fill="#F8FAFC" />
                            <rect x="-8" y="-6" width="14" height="11" rx="0.8" fill="#F0FDFA" stroke="#0D9488" strokeWidth="0.9" />
                            <polyline points="-6,2 -3,-2 0,1 3,-4 5,-2" stroke="#0D9488" strokeWidth="1.2" />
                            <circle cx="8" cy="-4" r="0.8" fill="#10B981" stroke="none" />
                            <circle cx="8" cy="0" r="0.8" fill="#0284C7" stroke="none" />
                          </g>
                        ) : n.asset_type === "scada_server" || n.asset_type === "server" ? (
                          <g stroke="#1C2434" strokeWidth="1.2" fill="none">
                            {/* 2U Rackmount SCADA Sunucusu */}
                            <rect x="-10" y="-8" width="20" height="7" rx="1" fill="#F8FAFC" />
                            <rect x="-10" y="1" width="20" height="7" rx="1" fill="#F8FAFC" />
                            <line x1="-6" y1="-6" x2="-6" y2="-3" stroke="#0D9488" strokeWidth="1.2" />
                            <line x1="-3" y1="-6" x2="-3" y2="-3" stroke="#0D9488" strokeWidth="1.2" />
                            <line x1="-6" y1="3" x2="-6" y2="6" stroke="#0D9488" strokeWidth="1.2" />
                            <line x1="-3" y1="3" x2="-3" y2="6" stroke="#0D9488" strokeWidth="1.2" />
                            <circle cx="6" cy="-4.5" r="1" fill="#10B981" stroke="none" />
                            <circle cx="6" cy="4.5" r="1" fill="#10B981" stroke="none" />
                          </g>
                        ) : n.asset_type === "network_device" ? (
                          <g stroke="#1C2434" strokeWidth="1.2" fill="none">
                            {/* Endüstriyel Switch */}
                            <rect x="-10" y="-5" width="20" height="10" rx="1.2" fill="#F8FAFC" />
                            {[-7, -3, 1, 5].map((px) => (
                              <rect key={px} x={px} y="-2" width="2.5" height="4" fill="#0D9488" stroke="none" />
                            ))}
                          </g>
                        ) : (
                          <g stroke="#1C2434" strokeWidth="1.2" fill="none">
                            {/* Mühendislik İstasyonu / Saha Ünitesi */}
                            <rect x="-9" y="-8" width="18" height="12" rx="1.2" fill="#F8FAFC" />
                            <line x1="-6" y1="-4" x2="5" y2="-4" stroke="#0D9488" strokeWidth="1.1" />
                            <line x1="-6" y1="-1" x2="2" y2="-1" stroke="#0284C7" strokeWidth="1.1" />
                            <line x1="0" y1="4" x2="0" y2="8" />
                            <line x1="-5" y1="8" x2="5" y2="8" />
                          </g>
                        )}

                        {/* Alt Koyu Lacivert (#1C2434) IP Adresi Rozeti */}
                        <rect
                          x={-44}
                          y={25}
                          width={88}
                          height={15}
                          rx={2}
                          fill={isSelected ? "#0D9488" : "#1C2434"}
                        />
                        <text
                          y={35.5}
                          textAnchor="middle"
                          className="fill-white font-mono text-[9.2px] font-bold"
                        >
                          {ipText}
                        </text>
                        {shortLabel && (
                          <text
                            y={48}
                            textAnchor="middle"
                            className="fill-[#1C2434] text-[9px] font-semibold"
                          >
                            {shortLabel}
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
                    title={t("Protokol Etiketlerini Göster/Gizle", "Toggle Protocol Labels")}
                    onClick={() => setShowEdgeLabels((v) => !v)}
                    className={`border-b border-[#E2E8F0] px-2.5 py-1.5 text-xs font-medium ${
                      showEdgeLabels ? "bg-teal-50 text-[#0D9488]" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t("Etiket", "Labels")}
                  </button>
                  {selectedNodeId && (
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(null)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      {t("Seçimi Kaldır", "Clear")}
                    </button>
                  )}
                </div>

                <div className="flex flex-col overflow-hidden rounded-[4px] border border-[#E2E8F0] bg-white shadow-xs">
                  <button
                    type="button"
                    title={t("Yakınlaştır (+)", "Zoom In (+)")}
                    onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
                    className="border-b border-[#E2E8F0] p-1.5 text-xs font-bold text-[#1C2434] hover:bg-slate-50"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    title={t("Uzaklaştır (-)", "Zoom Out (-)")}
                    onClick={() => setZoom((z) => Math.max(0.65, +(z - 0.15).toFixed(2)))}
                    className="border-b border-[#E2E8F0] p-1.5 text-xs font-bold text-[#1C2434] hover:bg-slate-50"
                  >
                    －
                  </button>
                  <button
                    type="button"
                    title={t("Sıfırla", "Reset Zoom")}
                    onClick={() => setZoom(1)}
                    className="p-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    1:1
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Seçili Düğüm Hızlı İnceleme Çekmecesi */}
          {selectedNode && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-teal-200 bg-teal-50/70 px-6 py-3.5 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="teal" dot>
                  {t("Seçili Düğüm", "Selected Node")}
                </Badge>
                <span className="font-bold text-[#1C2434]">{selectedNode.label}</span>
                <span className="font-mono font-semibold text-[#0F766E]">
                  {selectedNode.ip_address ?? "—"}
                </span>
                <Badge tone="navy">
                  {ASSET_TYPE_LABEL[selectedNode.asset_type]} · Purdue {inferPurdueTier(selectedNode)}
                </Badge>
                <CriticalityBadge value={selectedNode.criticality} />
                <span className="text-slate-600">
                  {t(
                    `${selectedNodeEdges.length} bağlı iletişim akışı`,
                    `${selectedNodeEdges.length} connected flows`,
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectedNodeId(null)}
                >
                  {t("Tüm Ağ", "Show All")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate(`/assets/${selectedNode.id}`)}
                >
                  {t("Cihaz Detay Konsolunu Aç →", "Open Device Console →")}
                </Button>
              </div>
            </div>
          )}

          {/* Alt Lejant Çubuğu */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E2E8F0] bg-white px-6 py-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-5">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs border-2 border-[#0D9488] bg-white" />{" "}
                {t("Doğrulanmış Düğüm", "Verified Node")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs border-2 border-amber-500 bg-white" />{" "}
                {t("Doğrulanmamış Düğüm", "Unverified Node")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs border-2 border-rose-600 bg-white" />{" "}
                {t("Yüksek/Kritik Düğüm", "High/Critical Node")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 bg-[#0D9488]" />{" "}
                {t("Onaylı Baseline Akışı", "Approved Baseline Flow")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-b border-dashed border-rose-600" />{" "}
                {t("Bölgeler Arası / Port Tahmini", "Cross-Zone / Port Hint")}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              {t("Yakınlaştırma", "Zoom")}: %{Math.round(zoom * 100)} · {t("Yerleşim", "Layout")}:{" "}
              {layoutMode === "purdue"
                ? t("Purdue Katmanları (L3 → L1)", "Purdue Layers (L3 → L1)")
                : layoutMode === "hub"
                  ? t("Merkez Hub", "Center Hub")
                  : t("Çevre Halka", "Outer Ring")}
            </span>
          </div>
        </div>
      </Card>

      {/* İletişim Akışları Tablosu */}
      <Card
        title={t(
          `Gözlemlenen İletişim Akışları (${
            selectedNode ? selectedNodeEdges.length : edges.length
          })`,
          `Observed Communication Flows (${
            selectedNode ? selectedNodeEdges.length : edges.length
          })`,
        )}
        subtitle={
          selectedNode
            ? t(
                `Yalnızca "${selectedNode.label}" cihazına bağlı iletişim akışları gösteriliyor`,
                `Showing communication flows connected to "${selectedNode.label}"`,
              )
            : t(
                "Kaynak ve hedef cihazlar arasındaki protokol, port, güven düzeyi ve baseline onay durumu",
                "Protocol, port, confidence level and baseline approval status between source and target devices",
              )
        }
        noPadding
      >
        {(selectedNode ? selectedNodeEdges : edges).length === 0 ? (
          <div className="p-6">
            <Empty>{t("Kayıt yok.", "No records.")}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">{t("Kaynak Varlık", "Source Asset")}</th>
                  <th className="px-4 py-3">{t("Hedef Varlık", "Target Asset")}</th>
                  <th className="px-4 py-3">{t("Protokol / Port", "Protocol / Port")}</th>
                  <th className="px-4 py-3">{t("Güven & Bölge", "Confidence & Zone")}</th>
                  <th className="px-4 py-3">{t("Baseline Durumu", "Baseline Status")}</th>
                  <th className="px-4 py-3">{t("Bağlantı", "Connections")}</th>
                  <th className="px-4 py-3">{t("Son Görülme", "Last Seen")}</th>
                  {canEditAssets && <th className="px-5 py-3 text-right">{t("İşlem", "Action")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {(selectedNode ? selectedNodeEdges : edges).map((e) => {
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
                        <div className="flex flex-wrap items-center gap-2">
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <ProtocolBadge protocol={e.protocol} confidence={e.protocol_confidence} />
                          {e.target_port !== null && (
                            <span className="font-mono text-xs text-slate-600">:{e.target_port}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={e.protocol_confidence === "observed" ? "teal" : "slate"}>
                            {e.protocol_confidence === "observed"
                              ? t("DPI Doğrulandı", "DPI Verified")
                              : e.protocol_confidence === "port_hint"
                                ? t("Port Tahmini", "Port Hint")
                                : t("Taşıma", "Transport")}
                          </Badge>
                          {e.cross_zone && <Badge tone="red">{t("Bölgeler Arası", "Cross-Zone")}</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {e.is_baseline_approved ? (
                          <Badge tone="emerald" dot>
                            {t("Baseline Onaylı", "Baseline Approved")}
                          </Badge>
                        ) : (
                          <Badge tone="amber" dot>
                            {t("İnceleme Bekliyor", "Pending Review")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-[#1C2434]">{e.connection_count}</td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap text-slate-500">
                        {formatDate(e.last_seen_at)}
                      </td>
                      {canEditAssets && (
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {!e.is_baseline_approved ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={approveSingleMut.isPending}
                              onClick={() => approveSingleMut.mutate(e.id)}
                            >
                              {t("Onayla", "Approve")}
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400">{t("Onaylandı", "Approved")}</span>
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
