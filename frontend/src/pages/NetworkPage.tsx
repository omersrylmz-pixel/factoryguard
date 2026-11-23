import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
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
type FirewallVendor = "fortigate" | "paloalto" | "cisco" | "nftables";

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

function buildFirewallRules(edges: CommunicationEdge[], vendor: FirewallVendor): string {
  const approved = edges.filter((e) => e.is_baseline_approved);
  const targetEdges = approved.length > 0 ? approved : edges;

  if (targetEdges.length === 0) {
    return "# No communication flows available to generate conduit policy.";
  }

  if (vendor === "fortigate") {
    const lines = [
      "# FactoryGuard Lite — IEC 62443 Conduit Policy (FortiOS / FortiGate Rugged)",
      "config firewall policy",
    ];
    targetEdges.forEach((e, idx) => {
      const proto = e.protocol.replace(/\?+$/, "").toUpperCase();
      const port = e.target_port ?? 502;
      lines.push(
        `    edit ${100 + idx}`,
        `        set name "OT_CONDUIT_${proto}_${port}_${idx + 1}"`,
        `        set srcintf "ot-zone-src"`,
        `        set dstintf "ot-zone-dst"`,
        `        set srcaddr "${e.source_ip ?? e.source_label}"`,
        `        set dstaddr "${e.target_ip ?? e.target_label}"`,
        `        set action accept`,
        `        set schedule "always"`,
        `        set service "${proto}_TCP_${port}"`,
        `        set logtraffic all`,
        `        set comments "Baseline flow: ${e.source_label} -> ${e.target_label} (${proto}:${port})"`,
        `    next`,
      );
    });
    lines.push(
      "    edit 999",
      '        set name "OT_DEFAULT_DENY_UNAPPROVED"',
      '        set srcintf "any"',
      '        set dstintf "any"',
      '        set srcaddr "all"',
      '        set dstaddr "all"',
      "        set action deny",
      "        set logtraffic all",
      "    next",
      "end",
    );
    return lines.join("\n");
  }

  if (vendor === "paloalto") {
    const lines = [
      "# FactoryGuard Lite — IEC 62443 Conduit Policy (Palo Alto Networks PAN-OS)",
    ];
    targetEdges.forEach((e, idx) => {
      const proto = e.protocol.replace(/\?+$/, "").toLowerCase();
      const port = e.target_port ?? 502;
      const ruleName = `OT-CONDUIT-${idx + 1}-${proto.toUpperCase()}`;
      lines.push(
        `set rulebase security rules ${ruleName} from OT-L2-SUPERVISORY to OT-L1-CONTROL`,
        `set rulebase security rules ${ruleName} source ${e.source_ip ?? "any"} destination ${e.target_ip ?? "any"}`,
        `set rulebase security rules ${ruleName} application ${proto} service service-tcp-${port} action allow log-end yes`,
      );
    });
    lines.push(
      "set rulebase security rules OT-CONDUIT-DEFAULT-DENY from any to any source any destination any application any service any action deny log-end yes",
    );
    return lines.join("\n");
  }

  if (vendor === "cisco") {
    const lines = [
      "! FactoryGuard Lite — IEC 62443 Conduit ACL (Cisco Industrial Ethernet / IOS-XE)",
      "ip access-list extended OT_PURDUE_CONDUIT_ACL",
    ];
    targetEdges.forEach((e) => {
      const proto = e.protocol.replace(/\?+$/, "").toUpperCase();
      const port = e.target_port ?? 502;
      const src = e.source_ip ? `host ${e.source_ip}` : "any";
      const dst = e.target_ip ? `host ${e.target_ip}` : "any";
      lines.push(
        ` remark Allow ${proto} from ${e.source_label} to ${e.target_label}`,
        ` permit tcp ${src} ${dst} eq ${port}`,
      );
    });
    lines.push(" remark Block all unapproved cross-zone OT traffic", " deny ip any any log");
    return lines.join("\n");
  }

  // nftables
  const lines = [
    "# FactoryGuard Lite — IEC 62443 Conduit Ruleset (Linux nftables)",
    "table inet factoryguard_ot_conduit {",
    "  chain forward {",
    "    type filter hook forward priority 0; policy drop;",
    "    ct state established,related accept",
  ];
  targetEdges.forEach((e) => {
    const proto = e.protocol.replace(/\?+$/, "").toUpperCase();
    const port = e.target_port ?? 502;
    const src = e.source_ip ?? "0.0.0.0/0";
    const dst = e.target_ip ?? "0.0.0.0/0";
    lines.push(
      `    ip saddr ${src} ip daddr ${dst} tcp dport ${port} accept comment "${proto}: ${e.source_label} -> ${e.target_label}"`,
    );
  });
  lines.push(
    '    log prefix "[FG-OT-CONDUIT-DROP] " flags all counter drop',
    "  }",
    "}",
  );
  return lines.join("\n");
}

export default function NetworkPage() {
  const { activeOrg, canEditAssets } = useAuth();
  const { t, theme } = useLang();
  const isDark = theme === "dark";
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [siteId, setSiteId] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("purdue");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [baselineNotice, setBaselineNotice] = useState<string | null>(null);

  // Otomatik Güvenlik Duvarı (Conduit) Kural Üretici durumu
  const [fwOpen, setFwOpen] = useState(false);
  const [fwVendor, setFwVendor] = useState<FirewallVendor>("fortigate");
  const [fwCopied, setFwCopied] = useState(false);

  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

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

  // Genişletilmiş yüksek çözünürlüklü topoloji tuvali (düğümlerin sıkışmaması için)
  const width = 1180;
  const height = 610;
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
    titleColor: string;
    subColor: string;
  }[] = [
    {
      tier: "L3",
      yCenter: 105,
      yTop: 22,
      height: 165,
      code: "PURDUE L3 / IT",
      title: t("Operasyon & Kurumsal Ağ", "Operations & Enterprise IT"),
      subtitle: t("Sunucu, Ağ Cihazı, İstemci", "Servers, Switches, Workstations"),
      bg: isDark ? "#0F172A" : "#F8FAFC",
      stroke: isDark ? "#334155" : "#CBD5E1",
      badgeBg: isDark ? "#334155" : "#475569",
      titleColor: isDark ? "#F1F5F9" : "#0F172A",
      subColor: isDark ? "#94A3B8" : "#64748B",
    },
    {
      tier: "L2",
      yCenter: 300,
      yTop: 206,
      height: 185,
      code: "PURDUE L2",
      title: t("Süpervizör, SCADA & HMI", "Supervisory, SCADA & HMI"),
      subtitle: t("SCADA Sunucusu, HMI, Mühendislik", "SCADA Servers, HMIs, Engineering"),
      bg: isDark ? "#0B192C" : "#EFF6FF",
      stroke: isDark ? "#1D4ED8" : "#93C5FD",
      badgeBg: "#2563EB",
      titleColor: isDark ? "#E0F2FE" : "#0F172A",
      subColor: isDark ? "#7DD3FC" : "#475569",
    },
    {
      tier: "L1",
      yCenter: 498,
      yTop: 410,
      height: 180,
      code: "PURDUE L1 / L0",
      title: t("PLC & Saha Kontrol Katmanı", "PLC & Field Control Layer"),
      subtitle: t("PLC, RTU, Saha Ekipmanı", "PLCs, RTUs, Field Controllers"),
      bg: isDark ? "#151324" : "#FFFBEB",
      stroke: isDark ? "#B45309" : "#FCD34D",
      badgeBg: "#D97706",
      titleColor: isDark ? "#FEF3C7" : "#0F172A",
      subColor: isDark ? "#FCD34D" : "#78350F",
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
      const xStart = 250;
      const xEnd = width - 75;
      const span = xEnd - xStart;
      list.forEach((n, idx) => {
        const x = count === 1 ? (xStart + xEnd) / 2 : xStart + (span * idx) / (count - 1);
        const staggerY = count >= 5 ? (idx % 2 === 0 ? -24 : 24) : 0;
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
      const rx = outerRing.length > 0 ? 210 : 290;
      const ry = outerRing.length > 0 ? 140 : 195;
      coords.set(n.id, {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
        tier: inferPurdueTier(n),
      });
    });

    outerRing.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(outerRing.length, 1) - Math.PI / 6;
      coords.set(n.id, {
        x: cx + 430 * Math.cos(angle),
        y: cy + 225 * Math.sin(angle),
        tier: inferPurdueTier(n),
      });
    });
  } else {
    sortedNodes.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(sortedNodes.length, 1) - Math.PI / 2;
      coords.set(n.id, {
        x: cx + 390 * Math.cos(angle),
        y: cy + 210 * Math.sin(angle),
        tier: inferPurdueTier(n),
      });
    });
  }

  // Çakışmasız (Anti-Collision) Kenar ve Etiket Yerleşimi
  const placedLabels: { x: number; y: number }[] = [];
  for (const [, c] of coords) {
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

    const curveOffset = sameRow ? (idx % 2 === 0 ? -48 : 48) : (idx % 3 - 1) * 22;
    const ctrlX = (s.x + tCoord.x) / 2 + (!sameRow ? curveOffset : 0);
    const ctrlY = (s.y + tCoord.y) / 2 + (sameRow ? curveOffset : 0);

    let lx = 0.25 * s.x + 0.5 * ctrlX + 0.25 * tCoord.x;
    let ly = 0.25 * s.y + 0.5 * ctrlY + 0.25 * tCoord.y;

    const candidates = [
      { x: lx, y: ly },
      { x: lx, y: ly - 24 },
      { x: lx, y: ly + 24 },
      { x: lx - 44, y: ly - 18 },
      { x: lx + 44, y: ly + 18 },
      { x: lx, y: ly - 44 },
      { x: lx, y: ly + 44 },
    ];
    for (const cand of candidates) {
      const collides = placedLabels.some(
        (p) => Math.abs(p.x - cand.x) < 78 && Math.abs(p.y - cand.y) < 22,
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
    if (n.criticality === "critical" || n.criticality === "high") return "#F43F5E";
    if (n.is_verified) return "#38BDF8";
    return "#F59E0B";
  }

  // Fare tekerleği ile yakınlaştırma ve fareyle tutup sürükleme (Pan & Zoom)
  function handleWheel(e: ReactWheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    setZoom((z) => Math.min(2.4, Math.max(0.55, +(z + delta).toFixed(2))));
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    // Yalnızca sol tık ile tuval sürükleme
    if (e.button !== 0) return;
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
    setIsDragging(true);
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const st = dragStateRef.current;
    if (!st.active) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      st.moved = true;
    }
    setPan({
      x: st.originX + dx,
      y: st.originY + dy,
    });
  }

  function handlePointerUp() {
    dragStateRef.current.active = false;
    setIsDragging(false);
  }

  function resetViewport() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedNodeEdges = selectedNode
    ? edges.filter(
        (e) => e.source_asset_id === selectedNode.id || e.target_asset_id === selectedNode.id,
      )
    : [];

  const generatedFirewallConfig = buildFirewallRules(edges, fwVendor);

  function handleCopyFirewallRules() {
    void navigator.clipboard?.writeText(generatedFirewallConfig);
    setFwCopied(true);
    setTimeout(() => setFwCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={t("Ağ Topolojisi", "Network Topology")}
        title={t("Ağ Topolojisi & Purdue Katman Haritası", "Network Topology & Purdue Layer Map")}
        subtitle={t(
          "ISA-95 / Purdue katmanlarına göre interaktif iletişim grafiği, baseline onayı ve Conduit güvenlik duvarı kural üretici",
          "Interactive communication graph structured by ISA-95 / Purdue layers, baseline approval and Conduit firewall rule generator",
        )}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setFwOpen((prev) => !prev)}
            >
              <svg className="h-3.5 w-3.5 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>
                {fwOpen
                  ? t("Conduit Kurallarını Gizle", "Hide Conduit Policy")
                  : t("Conduit Güvenlik Duvarı Kuralı Üret", "Generate Conduit Firewall Rules")}
              </span>
            </Button>
            {canEditAssets && edges.length > 0 && (
              <Button
                variant="outline"
                disabled={approveAllMut.isPending}
                onClick={() => approveAllMut.mutate()}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>
                  {approveAllMut.isPending
                    ? t("Kaydediliyor…", "Saving…")
                    : t("Tümünü Baseline Onayla", "Approve All as Baseline")}
                </span>
              </Button>
            )}
            <Button variant="primary" onClick={() => void graphQuery.refetch()}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>{t("Topolojiyi Yenile", "Refresh Topology")}</span>
            </Button>
          </>
        }
      />

      {/* 4 KPI StatCard */}
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
        <div className="flex items-center justify-between rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          <span>✓ {baselineNotice}</span>
          <button
            type="button"
            onClick={() => setBaselineNotice(null)}
            className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
          >
            {t("Kapat", "Dismiss")}
          </button>
        </div>
      )}

      {/* IEC 62443 Otomatik Güvenlik Duvarı & Conduit Kural Üretici Paneli */}
      {fwOpen && (
        <Card
          title={t(
            "IEC 62443 Otomatik Güvenlik Duvarı & Conduit Kural Üretici",
            "IEC 62443 Automated Firewall & Conduit Policy Generator",
          )}
          subtitle={t(
            "Onaylı baseline iletişim akışlarından endüstriyel güvenlik duvarları için sıfır-güven (zero-trust) izin listesi üretir",
            "Generates zero-trust allowlist rules for industrial firewalls from approved baseline communication flows",
          )}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: "fortigate", label: "FortiGate / FortiOS" },
                  { id: "paloalto", label: "Palo Alto PAN-OS" },
                  { id: "cisco", label: "Cisco Industrial ACL" },
                  { id: "nftables", label: "Linux nftables" },
                ] as const
              ).map((v) => (
                <Button
                  key={v.id}
                  size="sm"
                  variant={fwVendor === v.id ? "primary" : "secondary"}
                  onClick={() => setFwVendor(v.id)}
                >
                  {v.label}
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={handleCopyFirewallRules}>
                {fwCopied ? t("✓ Kopyalandı", "✓ Copied") : t("Kuralları Kopyala", "Copy Rules")}
              </Button>
            </div>
          }
        >
          <pre className="max-h-64 overflow-auto rounded-[6px] border border-[#1E293B] bg-[#070B14] p-4 font-mono text-xs leading-relaxed text-sky-300 select-all">
            {generatedFirewallConfig}
          </pre>
        </Card>
      )}

      <ErrorBox error={graphQuery.error || approveAllMut.error || approveSingleMut.error} />

      {/* Topoloji Kartı + Yerleşim Modu & Filtre Araç Çubuğu */}
      <Card
        title={t("ISA-95 / Purdue Katmanlı OT Ağ Topolojisi", "ISA-95 / Purdue Layered OT Network Topology")}
        subtitle={t(
          "Tuvali fareyle tutup sürükleyerek gezinin, tekerlekle yakınlaştırın; bir düğüme tıklayarak bağlı akışlarını inceleyin",
          "Click and drag to pan the canvas, scroll wheel to zoom; click any node to inspect its connected flows",
        )}
        noPadding
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Yerleşim Modu Seçici */}
            <div className="flex h-9 items-center rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] p-0.5 text-xs dark:border-[#2A364F] dark:bg-[#161F30]">
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
                  onClick={() => {
                    setLayoutMode(m.id);
                    resetViewport();
                  }}
                  className={`h-full cursor-pointer rounded-[4px] px-2.5 text-xs font-semibold transition ${
                    layoutMode === m.id
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "text-[#64748B] hover:text-[#1C2434] dark:text-[#94A3B8] dark:hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="w-44">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("IP, cihaz, protokol...", "IP, device, protocol...")}
              />
            </div>
            <div className="w-44">
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">{t("Tüm Fabrikalar", "All Sites")}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
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
        <div
          onWheel={handleWheel}
          className="relative overflow-hidden bg-[#F1F5F9] dark:bg-[#080C16]"
        >
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
            <div className="relative">
              {/* Üst Yüzen Harita Kontrol Çubuğu (Sağ alttaki düğümleri kapatmaması için sağ üstte) */}
              <div className="pointer-events-auto absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-[6px] border border-[#CBD5E1] bg-white/95 p-1 shadow-md backdrop-blur-xs dark:border-[#2A364F] dark:bg-[#0F172A]/95">
                <span className="hidden px-2 font-mono text-[10px] text-[#64748B] sm:inline dark:text-[#94A3B8]">
                  {t("🖱️ Sürükle: Gezin · Tekerlek: Zoom", "🖱️ Drag: Pan · Wheel: Zoom")}
                </span>
                <button
                  type="button"
                  onClick={() => setShowEdgeLabels((v) => !v)}
                  className={`cursor-pointer rounded-[4px] px-2.5 py-1 text-xs font-semibold transition ${
                    showEdgeLabels
                      ? "bg-[#2563EB]/15 text-[#2563EB] dark:bg-sky-500/20 dark:text-sky-300"
                      : "text-[#64748B] hover:bg-slate-100 dark:text-[#94A3B8] dark:hover:bg-[#1E293B]"
                  }`}
                >
                  {t("Etiketler", "Labels")}
                </button>
                <div className="h-4 w-[1px] bg-[#E2E8F0] dark:bg-[#1E293B]" />
                <button
                  type="button"
                  title={t("Yakınlaştır (+)", "Zoom In (+)")}
                  onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.15).toFixed(2)))}
                  className="cursor-pointer rounded-[4px] px-2 py-1 font-mono text-xs font-bold text-[#1C2434] hover:bg-slate-100 dark:text-white dark:hover:bg-[#1E293B]"
                >
                  ＋
                </button>
                <span className="min-w-[42px] text-center font-mono text-[11px] font-semibold text-[#1C2434] dark:text-sky-300">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  title={t("Uzaklaştır (-)", "Zoom Out (-)")}
                  onClick={() => setZoom((z) => Math.max(0.55, +(z - 0.15).toFixed(2)))}
                  className="cursor-pointer rounded-[4px] px-2 py-1 font-mono text-xs font-bold text-[#1C2434] hover:bg-slate-100 dark:text-white dark:hover:bg-[#1E293B]"
                >
                  －
                </button>
                <button
                  type="button"
                  title={t("Görünümü Sıfırla (1:1)", "Reset View (1:1)")}
                  onClick={resetViewport}
                  className="cursor-pointer rounded-[4px] border border-[#CBD5E1] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#64748B] hover:text-[#1C2434] dark:border-[#2A364F] dark:text-[#94A3B8] dark:hover:text-white"
                >
                  1:1
                </button>
                {selectedNodeId && (
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(null)}
                    className="cursor-pointer rounded-[4px] bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-600 dark:text-rose-300"
                  >
                    {t("Seçimi Kaldır", "Clear")}
                  </button>
                )}
              </div>

              <svg
                viewBox={`0 0 ${width} ${height}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className={`mx-auto h-[575px] w-full select-none ${
                  isDragging ? "cursor-grabbing" : "cursor-grab"
                }`}
              >
                <defs>
                  <pattern id="ot-command-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path
                      d="M 24 0 L 0 0 0 24"
                      fill="none"
                      stroke={isDark ? "#151F32" : "#E2E8F0"}
                      strokeWidth="0.8"
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
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={isDark ? "#64748B" : "#334155"} />
                  </marker>
                </defs>

                <rect width={width} height={height} fill="url(#ot-command-grid)" />

                <g
                  transform={`translate(${cx + pan.x},${cy + pan.y}) scale(${zoom}) translate(${-cx},${-cy})`}
                >
                  {/* Purdue Yatay Şeritleri (Swimlanes) */}
                  {layoutMode === "purdue" &&
                    purdueBands.map((band) => (
                      <g key={band.tier}>
                        <rect
                          x={16}
                          y={band.yTop}
                          width={width - 32}
                          height={band.height}
                          rx={8}
                          fill={band.bg}
                          fillOpacity={isDark ? "0.86" : "0.82"}
                          stroke={band.stroke}
                          strokeWidth="1.3"
                          strokeDasharray="6,4"
                        />
                        {/* Sol Şerit Başlığı */}
                        <rect
                          x={28}
                          y={band.yTop + 14}
                          width={162}
                          height={22}
                          rx={4}
                          fill={band.badgeBg}
                        />
                        <text
                          x={38}
                          y={band.yTop + 29}
                          fill="#FFFFFF"
                          className="font-mono text-[10px] font-bold"
                        >
                          {band.code}
                        </text>
                        <text
                          x={28}
                          y={band.yTop + 54}
                          fill={band.titleColor}
                          className="text-[11.5px] font-bold"
                        >
                          {band.title}
                        </text>
                        <text
                          x={28}
                          y={band.yTop + 71}
                          fill={band.subColor}
                          className="text-[10px]"
                        >
                          {band.subtitle}
                        </text>
                      </g>
                    ))}

                  {/* İletişim Kenarları */}
                  {edges.map((e, edgeIdx) => {
                    const geom = computeEdgeGeometry(e, edgeIdx);
                    if (!geom) return null;
                    const isHighlighted =
                      !selectedNodeId ||
                      e.source_asset_id === selectedNodeId ||
                      e.target_asset_id === selectedNodeId;
                    const strokeColor = e.is_baseline_approved
                      ? "#0EA5E9"
                      : e.cross_zone
                        ? "#F43F5E"
                        : isDark
                          ? "#64748B"
                          : "#334155";
                    const cleanProto = e.protocol.replace(/\?+$/, "").toUpperCase();
                    return (
                      <g
                        key={e.id}
                        opacity={isHighlighted ? 1 : 0.2}
                        className="transition-opacity"
                      >
                        <path
                          d={geom.pathD}
                          fill="none"
                          stroke={strokeColor}
                          strokeDasharray={
                            e.protocol_confidence === "port_hint" || (e.cross_zone && !e.is_baseline_approved)
                              ? "5,3.5"
                              : undefined
                          }
                          strokeWidth={Math.min(1.5 + Math.log2(e.connection_count + 1) * 0.65, 3.2)}
                          markerEnd="url(#ot-arrow)"
                        />
                        {isHighlighted && (
                          <circle
                            r="3.2"
                            fill={e.cross_zone && !e.is_baseline_approved ? "#F43F5E" : "#38BDF8"}
                          >
                            <animateMotion
                              dur={`${2.2 + (edgeIdx % 4) * 0.45}s`}
                              repeatCount="indefinite"
                              path={geom.pathD}
                            />
                          </circle>
                        )}
                        {showEdgeLabels && isHighlighted && (
                          <g>
                            <rect
                              x={geom.lx - 40}
                              y={geom.ly - 8.5}
                              width={80}
                              height={17}
                              rx={4}
                              fill={isDark ? "#0F172A" : "#FFFFFF"}
                              stroke={strokeColor}
                              strokeWidth="1"
                            />
                            <text
                              x={geom.lx}
                              y={geom.ly + 3}
                              textAnchor="middle"
                              fill={isDark ? "#E2E8F0" : "#0F172A"}
                              className="font-mono text-[8.8px] font-bold"
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
                        ? n.label.length > 20
                          ? `${n.label.slice(0, 18)}…`
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

                    const hexFill = isDark ? "#0F172A" : "#FFFFFF";
                    const chassisFill = isDark ? "#1E293B" : "#F8FAFC";
                    const chassisStroke = isDark ? "#94A3B8" : "#1C2434";

                    return (
                      <g
                        key={n.id}
                        transform={`translate(${c.x},${c.y})`}
                        opacity={isConnectedToSelected ? 1 : 0.3}
                        onClick={() => {
                          if (dragStateRef.current.moved) return;
                          setSelectedNodeId((prev) => (prev === n.id ? null : n.id));
                        }}
                        onDoubleClick={() => navigate(`/assets/${n.id}`)}
                        className="cursor-pointer transition-opacity hover:opacity-100"
                      >
                        <title>{`${n.label} (${ipText}) — ${t("Seçmek için tıkla, detaya gitmek için çift tıkla", "Click to inspect, double-click for details")}`}</title>
                        {(isSelected || n.criticality === "critical") && (
                          <circle
                            r="26"
                            fill="none"
                            stroke={isSelected ? "#38BDF8" : "#F43F5E"}
                            strokeWidth="1.6"
                            opacity="0.6"
                          >
                            <animate
                              attributeName="r"
                              values="23;33;23"
                              dur="2.4s"
                              repeatCount="indefinite"
                            />
                            <animate
                              attributeName="opacity"
                              values="0.7;0.1;0.7"
                              dur="2.4s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}
                        {isSelected && (
                          <circle
                            r="29"
                            fill="none"
                            stroke="#38BDF8"
                            strokeWidth="2"
                            strokeDasharray="3,2"
                          />
                        )}
                        <polygon
                          points={OUTER_HEX}
                          fill={hexFill}
                          stroke={borderCol}
                          strokeWidth={isSelected ? "3" : "2.4"}
                        />
                        <polygon
                          points={INNER_HEX}
                          fill={hexFill}
                          stroke={borderCol}
                          strokeWidth="0.8"
                          strokeOpacity="0.45"
                        />
                        {/* Cihaz Türüne Özel Donanım Çizimi */}
                        {n.asset_type === "plc" ? (
                          <g stroke={chassisStroke} strokeWidth="1.2" fill="none">
                            <rect x="-9" y="-9" width="11" height="18" rx="1" fill={chassisFill} />
                            <rect x="2" y="-9" width="7" height="18" rx="1" fill={chassisFill} />
                            <rect x="-7" y="-4" width="7" height="5" rx="0.5" fill="#0284C7" fillOpacity="0.25" stroke="#38BDF8" strokeWidth="0.9" />
                            <circle cx="-6" cy="-6.8" r="0.9" fill="#10B981" stroke="none" />
                            <circle cx="-3" cy="-6.8" r="0.9" fill={borderCol} stroke="none" />
                            <circle cx="5.5" cy="-5" r="0.8" fill="#10B981" stroke="none" />
                            <circle cx="5.5" cy="-1" r="0.8" fill="#10B981" stroke="none" />
                            <circle cx="5.5" cy="3" r="0.8" fill="#F59E0B" stroke="none" />
                          </g>
                        ) : n.asset_type === "hmi" ? (
                          <g stroke={chassisStroke} strokeWidth="1.2" fill="none">
                            <rect x="-10" y="-8" width="20" height="15" rx="1.5" fill={chassisFill} />
                            <rect x="-8" y="-6" width="14" height="11" rx="0.8" fill="#0284C7" fillOpacity="0.2" stroke="#38BDF8" strokeWidth="0.9" />
                            <polyline points="-6,2 -3,-2 0,1 3,-4 5,-2" stroke="#38BDF8" strokeWidth="1.2" />
                            <circle cx="8" cy="-4" r="0.8" fill="#10B981" stroke="none" />
                            <circle cx="8" cy="0" r="0.8" fill="#38BDF8" stroke="none" />
                          </g>
                        ) : n.asset_type === "scada_server" || n.asset_type === "server" ? (
                          <g stroke={chassisStroke} strokeWidth="1.2" fill="none">
                            <rect x="-10" y="-8" width="20" height="7" rx="1" fill={chassisFill} />
                            <rect x="-10" y="1" width="20" height="7" rx="1" fill={chassisFill} />
                            <line x1="-6" y1="-6" x2="-6" y2="-3" stroke="#38BDF8" strokeWidth="1.2" />
                            <line x1="-3" y1="-6" x2="-3" y2="-3" stroke="#38BDF8" strokeWidth="1.2" />
                            <line x1="-6" y1="3" x2="-6" y2="6" stroke="#38BDF8" strokeWidth="1.2" />
                            <line x1="-3" y1="3" x2="-3" y2="6" stroke="#38BDF8" strokeWidth="1.2" />
                            <circle cx="6" cy="-4.5" r="1" fill="#10B981" stroke="none" />
                            <circle cx="6" cy="4.5" r="1" fill="#10B981" stroke="none" />
                          </g>
                        ) : n.asset_type === "network_device" ? (
                          <g stroke={chassisStroke} strokeWidth="1.2" fill="none">
                            <rect x="-10" y="-5" width="20" height="10" rx="1.2" fill={chassisFill} />
                            {[-7, -3, 1, 5].map((px) => (
                              <rect key={px} x={px} y="-2" width="2.5" height="4" fill="#38BDF8" stroke="none" />
                            ))}
                          </g>
                        ) : (
                          <g stroke={chassisStroke} strokeWidth="1.2" fill="none">
                            <rect x="-9" y="-8" width="18" height="12" rx="1.2" fill={chassisFill} />
                            <line x1="-6" y1="-4" x2="5" y2="-4" stroke="#38BDF8" strokeWidth="1.1" />
                            <line x1="-6" y1="-1" x2="2" y2="-1" stroke="#60A5FA" strokeWidth="1.1" />
                            <line x1="0" y1="4" x2="0" y2="8" />
                            <line x1="-5" y1="8" x2="5" y2="8" />
                          </g>
                        )}

                        {/* Alt IP Adresi Rozeti */}
                        <rect
                          x={-45}
                          y={25}
                          width={90}
                          height={15}
                          rx={3}
                          fill={isSelected ? "#2563EB" : "#0F172A"}
                          stroke={isSelected ? "#60A5FA" : "#334155"}
                          strokeWidth="0.8"
                        />
                        <text
                          y={35.5}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          className="font-mono text-[9.2px] font-bold"
                        >
                          {ipText}
                        </text>
                        {shortLabel && (
                          <text
                            y={48}
                            textAnchor="middle"
                            fill={isDark ? "#CBD5E1" : "#1E293B"}
                            className="text-[9.2px] font-semibold"
                          >
                            {shortLabel}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          )}

          {/* Seçili Düğüm Hızlı İnceleme Çekmecesi */}
          {selectedNode && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-sky-500/30 bg-sky-500/10 px-6 py-3.5 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="teal" dot>
                  {t("Seçili Düğüm", "Selected Node")}
                </Badge>
                <span className="font-bold text-[#1C2434]">{selectedNode.label}</span>
                <span className="font-mono font-semibold text-sky-600 dark:text-sky-400">
                  {selectedNode.ip_address ?? "—"}
                </span>
                <Badge tone="navy">
                  {ASSET_TYPE_LABEL[selectedNode.asset_type]} · Purdue {inferPurdueTier(selectedNode)}
                </Badge>
                <CriticalityBadge value={selectedNode.criticality} />
                <span className="text-[#64748B]">
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
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E2E8F0] bg-white px-6 py-3 text-xs text-[#64748B] dark:border-[#1E293B] dark:bg-[#111827]">
            <div className="flex flex-wrap items-center gap-5">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs border-2 border-sky-400 bg-transparent" />{" "}
                {t("Doğrulanmış Düğüm", "Verified Node")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs border-2 border-amber-500 bg-transparent" />{" "}
                {t("Doğrulanmamış Düğüm", "Unverified Node")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs border-2 border-rose-500 bg-transparent" />{" "}
                {t("Yüksek/Kritik Düğüm", "High/Critical Node")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 bg-sky-500" />{" "}
                {t("Onaylı Baseline Akışı", "Approved Baseline Flow")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-b border-dashed border-rose-500" />{" "}
                {t("Bölgeler Arası / Port Tahmini", "Cross-Zone / Port Hint")}
              </span>
            </div>
            <span className="font-mono text-[11px] text-[#64748B]">
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
                          className="font-semibold text-[#1C2434] hover:text-sky-500"
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
                            className="font-semibold text-[#1C2434] hover:text-sky-500"
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
