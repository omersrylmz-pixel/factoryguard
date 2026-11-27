import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { DeviceHardwareThumb, vendorAccentColor } from "../components/deviceVisuals";
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
  SlideOverDrawer,
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

/* ============================================================================
 * React Flow Özel Purdue Katmanı Arka Plan Kutusu (Sub-Flow Swimlane Node)
 * ============================================================================ */
interface PurdueLaneData extends Record<string, unknown> {
  code: string;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  borderCol: string;
  bgCol: string;
  badgeBg: string;
  countLabel: string;
}

function PurdueLaneNode({ data }: NodeProps<Node<PurdueLaneData>>) {
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        borderColor: data.borderCol,
        backgroundColor: data.bgCol,
      }}
      className="pointer-events-none relative rounded-[10px] border border-dashed px-4 py-3 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            style={{ backgroundColor: data.badgeBg }}
            className="rounded-[4px] px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-white uppercase shadow-xs"
          >
            {data.code}
          </span>
          <span className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
            {data.title}
          </span>
          <span className="hidden text-[11px] text-[#64748B] sm:inline dark:text-[#94A3B8]">
            · {data.subtitle}
          </span>
        </div>
        <span className="rounded-[4px] border border-[#CBD5E1] bg-white/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#64748B] dark:border-[#1E293B] dark:bg-[#0F172A]/80 dark:text-sky-300">
          {data.countLabel}
        </span>
      </div>
    </div>
  );
}

/* ============================================================================
 * React Flow Özel Endüstriyel Cihaz Düğüm Kartı (PLC / HMI / SCADA Node Card)
 * - Canlı durum LED'i, 3B donanım şasi ikonu, üretici etiketi, protokol rozetleri
 * - Blast Radius (Etki Alanı) odaklanma modunda komşu olmayanları %20 opaklığa düşürür
 * ============================================================================ */
interface IndustrialDeviceNodeData extends Record<string, unknown> {
  node: GraphNode;
  tier: PurdueTier;
  protocols: string[];
  flowCount: number;
  crossZoneCount: number;
  isSelected: boolean;
  isBlastNeighbor: boolean;
  dimmed: boolean;
}

function IndustrialDeviceNode({ data }: NodeProps<Node<IndustrialDeviceNodeData>>) {
  const { node, tier, protocols, flowCount, crossZoneCount, isSelected, isBlastNeighbor, dimmed } =
    data;
  const vStyle = vendorAccentColor(node.vendor ?? node.classification_label);

  const statusColor =
    node.criticality === "critical" || node.criticality === "high"
      ? "#EF4444"
      : node.is_verified
        ? "#10B981"
        : "#F59E0B";

  const borderClass = isSelected
    ? "border-[#38BDF8] ring-2 ring-[#38BDF8]/40 shadow-[0_0_24px_rgba(56,189,248,0.35)]"
    : isBlastNeighbor
      ? "border-amber-400/80 shadow-[0_0_16px_rgba(245,158,11,0.22)]"
      : node.criticality === "critical" || node.criticality === "high"
        ? "border-rose-500/60"
        : node.is_verified
          ? "border-emerald-500/45"
          : "border-amber-500/50";

  return (
    <div
      style={{ opacity: dimmed ? 0.18 : 1 }}
      className={`group relative w-[206px] cursor-pointer rounded-[8px] border bg-white p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 dark:bg-[#0F172A] ${borderClass}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-none !bg-sky-400"
      />

      {/* Üst Anlamsal Durum Şeridi */}
      <div
        className="mb-2 h-1 w-full rounded-full"
        style={{ backgroundColor: statusColor }}
      />

      {/* Üst Satır: Üretici Rozeti + Purdue Katmanı + Canlı Durum LED'i */}
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <span
            style={{ backgroundColor: vStyle.bg, color: vStyle.text }}
            className="rounded-[3px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-wider"
          >
            {vStyle.brand.slice(0, 12)}
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-[#64748B] dark:bg-[#1E293B] dark:text-sky-300">
            {tier}
          </span>
        </div>

        <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold">
          <span
            className="h-2 w-2 rounded-full shadow-[0_0_6px_currentColor]"
            style={{ backgroundColor: statusColor, color: statusColor }}
          />
          <span className="text-[#64748B] dark:text-[#94A3B8]">{flowCount}f</span>
        </span>
      </div>

      {/* Orta Satır: 3B Donanım Şasisi + IP ve Cihaz Adı */}
      <div className="flex items-center gap-2.5">
        <DeviceHardwareThumb
          assetType={node.asset_type}
          vendor={node.vendor}
          isVerified={node.is_verified}
          criticality={node.criticality}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs font-bold text-[#0F172A] tabular-nums dark:text-white">
            {node.ip_address || node.label}
          </div>
          <div
            className="truncate text-[10.5px] font-semibold text-[#64748B] dark:text-[#CBD5E1]"
            title={node.label}
          >
            {node.label !== node.ip_address ? node.label : ASSET_TYPE_LABEL[node.asset_type]}
          </div>
        </div>
      </div>

      {/* Alt Satır: Protokol Rozetleri ve Çapraz Bölge Uyarısı */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t border-[#E2E8F0] pt-1.5 dark:border-[#1E293B]">
        <div className="flex flex-wrap gap-1">
          {protocols.slice(0, 2).map((p) => (
            <span
              key={p}
              className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.2 font-mono text-[8.5px] font-bold text-sky-700 dark:text-sky-300"
            >
              {p}
            </span>
          ))}
        </div>
        {crossZoneCount > 0 && (
          <span className="rounded border border-rose-500/40 bg-rose-500/15 px-1.5 py-0.2 font-mono text-[8.5px] font-bold text-rose-600 dark:text-rose-300">
            ! {crossZoneCount} X-ZONE
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-none !bg-sky-400"
      />
    </div>
  );
}

const NODE_TYPES = {
  purdueLane: PurdueLaneNode,
  industrialDevice: IndustrialDeviceNode,
};

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
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("purdue");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [baselineNotice, setBaselineNotice] = useState<string | null>(null);

  // Otomatik Güvenlik Duvarı (Conduit) Kural Üretici durumu
  const [fwOpen, setFwOpen] = useState(false);
  const [fwVendor, setFwVendor] = useState<FirewallVendor>("fortigate");
  const [fwCopied, setFwCopied] = useState(false);

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

  // Blast Radius (Etki Alanı) komşuluk kümesi
  const blastNeighborIds = useMemo(() => {
    const s = new Set<string>();
    if (!selectedNodeId) return s;
    s.add(selectedNodeId);
    for (const e of edges) {
      if (e.source_asset_id === selectedNodeId) s.add(e.target_asset_id);
      if (e.target_asset_id === selectedNodeId) s.add(e.source_asset_id);
    }
    return s;
  }, [selectedNodeId, edges]);

  // React Flow Düğümleri ve Animasyonlu Kenarları
  const { rfNodes, rfEdges } = useMemo(() => {
    const degreeMap = new Map<string, number>();
    const nodeProtos = new Map<string, Set<string>>();
    const nodeCrossZone = new Map<string, number>();

    for (const e of edges) {
      degreeMap.set(e.source_asset_id, (degreeMap.get(e.source_asset_id) ?? 0) + 1);
      degreeMap.set(e.target_asset_id, (degreeMap.get(e.target_asset_id) ?? 0) + 1);
      const cleanP = e.protocol.replace(/\?+$/, "").toUpperCase();
      for (const id of [e.source_asset_id, e.target_asset_id]) {
        const set = nodeProtos.get(id) ?? new Set<string>();
        set.add(cleanP);
        nodeProtos.set(id, set);
        if (e.cross_zone) {
          nodeCrossZone.set(id, (nodeCrossZone.get(id) ?? 0) + 1);
        }
      }
    }

    const byTier: Record<PurdueTier, GraphNode[]> = { L3: [], L2: [], L1: [] };
    for (const n of nodes) {
      byTier[inferPurdueTier(n)].push(n);
    }

    const maxInTier = Math.max(4, byTier.L3.length, byTier.L2.length, byTier.L1.length);
    const colsPerRow = Math.min(5, Math.max(4, Math.ceil(maxInTier / 2)));
    const laneWidth = Math.max(1160, colsPerRow * 245 + 90);

    const outNodes: Node[] = [];

    if (layoutMode === "purdue") {
      const lanes: {
        tier: PurdueTier;
        code: string;
        title: string;
        subtitle: string;
        yTop: number;
        height: number;
        borderCol: string;
        bgCol: string;
        badgeBg: string;
      }[] = [
        {
          tier: "L3",
          code: "PURDUE L3 / IT",
          title: t("Operasyon & Kurumsal Ağ", "Operations & Enterprise IT"),
          subtitle: t("Historian, Sunucu, Endüstriyel Switch & İş İstasyonu", "Historian, Servers, Switches & Workstations"),
          yTop: 16,
          height: byTier.L3.length > colsPerRow ? 290 : 185,
          borderCol: isDark ? "#334155" : "#CBD5E1",
          bgCol: isDark ? "rgba(15, 23, 42, 0.72)" : "rgba(248, 250, 252, 0.9)",
          badgeBg: "#475569",
        },
        {
          tier: "L2",
          code: "PURDUE L2 · SCADA / HMI",
          title: t("Süpervizör Kontrol & Operatör HMI", "Supervisory Control, SCADA & Operator HMI"),
          subtitle: t("SCADA Sunucusu, Dokunmatik HMI Paneli, Mühendislik İstasyonu", "SCADA Servers, Touch HMIs, Engineering Workstations"),
          yTop: 0,
          height: byTier.L2.length > colsPerRow ? 290 : 195,
          borderCol: isDark ? "#1D4ED8" : "#93C5FD",
          bgCol: isDark ? "rgba(11, 25, 44, 0.78)" : "rgba(239, 246, 255, 0.88)",
          badgeBg: "#2563EB",
        },
        {
          tier: "L1",
          code: "PURDUE L1 / L0 · SAHA KONTROL",
          title: t("PLC, RTU & Saha Kontrol Katmanı", "PLC, RTU & Field Control Layer"),
          subtitle: t("Programlanabilir Kontrolcüler (PLC), RTU, I/O ve Aktüatörler", "Programmable Logic Controllers (PLCs), RTUs & Field I/O"),
          yTop: 0,
          height: byTier.L1.length > colsPerRow ? 310 : 200,
          borderCol: isDark ? "#B45309" : "#FCD34D",
          bgCol: isDark ? "rgba(21, 19, 36, 0.82)" : "rgba(255, 251, 235, 0.9)",
          badgeBg: "#D97706",
        },
      ];

      lanes[1].yTop = lanes[0].yTop + lanes[0].height + 24;
      lanes[2].yTop = lanes[1].yTop + lanes[1].height + 24;

      for (const lane of lanes) {
        const tierList = byTier[lane.tier].sort((a, b) =>
          (a.ip_address ?? a.label).localeCompare(b.ip_address ?? b.label),
        );
        outNodes.push({
          id: `lane-${lane.tier}`,
          type: "purdueLane",
          position: { x: 16, y: lane.yTop },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: -1,
          data: {
            code: lane.code,
            title: lane.title,
            subtitle: lane.subtitle,
            width: laneWidth,
            height: lane.height,
            borderCol: lane.borderCol,
            bgCol: lane.bgCol,
            badgeBg: lane.badgeBg,
            countLabel: t(`${tierList.length} Düğüm`, `${tierList.length} Nodes`),
          },
        });

        tierList.forEach((n, idx) => {
          const row = Math.floor(idx / colsPerRow);
          const col = idx % colsPerRow;
          const rowCount = Math.min(colsPerRow, tierList.length - row * colsPerRow);
          const totalRowW = rowCount * 235;
          const startX = 16 + Math.max(36, (laneWidth - totalRowW) / 2);

          const x = startX + col * 238;
          const y = lane.yTop + 52 + row * 124;

          const isSel = selectedNodeId === n.id;
          const isNeighbor = !isSel && blastNeighborIds.has(n.id);
          const dimmed = Boolean(selectedNodeId && !blastNeighborIds.has(n.id));

          outNodes.push({
            id: n.id,
            type: "industrialDevice",
            position: { x, y },
            zIndex: isSel ? 20 : isNeighbor ? 15 : 10,
            data: {
              node: n,
              tier: lane.tier,
              protocols: Array.from(nodeProtos.get(n.id) ?? []),
              flowCount: degreeMap.get(n.id) ?? 0,
              crossZoneCount: nodeCrossZone.get(n.id) ?? 0,
              isSelected: isSel,
              isBlastNeighbor: isNeighbor,
              dimmed,
            },
          });
        });
      }
    } else {
      // Hub veya Halka (Ring) Yerleşimi
      const sorted = [...nodes].sort(
        (a, b) => (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0),
      );
      const centerX = 520;
      const centerY = 300;
      sorted.forEach((n, idx) => {
        let x = centerX;
        let y = centerY;
        if (layoutMode === "hub" && idx === 0) {
          x = centerX;
          y = centerY;
        } else {
          const ringIdx = layoutMode === "hub" ? idx - 1 : idx;
          const totalRing = Math.max(1, layoutMode === "hub" ? sorted.length - 1 : sorted.length);
          const angle = (2 * Math.PI * ringIdx) / totalRing - Math.PI / 2;
          const rx = 430;
          const ry = 235;
          x = centerX + rx * Math.cos(angle);
          y = centerY + ry * Math.sin(angle);
        }
        const isSel = selectedNodeId === n.id;
        const isNeighbor = !isSel && blastNeighborIds.has(n.id);
        const dimmed = Boolean(selectedNodeId && !blastNeighborIds.has(n.id));

        outNodes.push({
          id: n.id,
          type: "industrialDevice",
          position: { x, y },
          zIndex: isSel ? 20 : 10,
          data: {
            node: n,
            tier: inferPurdueTier(n),
            protocols: Array.from(nodeProtos.get(n.id) ?? []),
            flowCount: degreeMap.get(n.id) ?? 0,
            crossZoneCount: nodeCrossZone.get(n.id) ?? 0,
            isSelected: isSel,
            isBlastNeighbor: isNeighbor,
            dimmed,
          },
        });
      });
    }

    const outEdges: Edge[] = edges.map((e) => {
      const inBlast =
        !selectedNodeId ||
        e.source_asset_id === selectedNodeId ||
        e.target_asset_id === selectedNodeId;
      const isUnauthorizedOrCross = e.cross_zone && !e.is_baseline_approved;
      const strokeColor = isUnauthorizedOrCross
        ? "#EF4444"
        : e.is_baseline_approved
          ? "#10B981"
          : "#38BDF8";
      const cleanProto = e.protocol.replace(/\?+$/, "").toUpperCase();
      const labelText = showEdgeLabels
        ? `${cleanProto}${e.target_port ? `:${e.target_port}` : ""}`
        : undefined;

      return {
        id: e.id,
        source: e.source_asset_id,
        target: e.target_asset_id,
        animated: inBlast,
        label: inBlast ? labelText : undefined,
        labelStyle: {
          fill: isDark ? "#F8FAFC" : "#0F172A",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
        },
        labelBgStyle: {
          fill: isDark ? "#0F172A" : "#FFFFFF",
          stroke: strokeColor,
          strokeWidth: 1,
          fillOpacity: 0.94,
        },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 16,
          height: 16,
        },
        style: {
          stroke: strokeColor,
          strokeWidth: inBlast ? 2.2 : 1.2,
          strokeDasharray: isUnauthorizedOrCross ? "6 4" : undefined,
          opacity: inBlast ? 1 : 0.14,
        },
      };
    });

    return { rfNodes: outNodes, rfEdges: outEdges };
  }, [nodes, edges, layoutMode, isDark, selectedNodeId, blastNeighborIds, showEdgeLabels, t]);

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
        title={t("İnteraktif OT Ağ Topolojisi & Blast Radius Analizi", "Interactive OT Network Topology & Blast Radius Analysis")}
        subtitle={t(
          "React Flow tabanlı ISA-95 / Purdue katman haritası, canlı trafik akışları, etki alanı (Blast Radius) odaklanması ve Conduit kural üretici",
          "React Flow powered ISA-95 / Purdue layer map, animated traffic flows, Blast Radius focus mode and Conduit policy generator",
        )}
        actions={
          <>
            <Button variant="secondary" onClick={() => setFwOpen((prev) => !prev)}>
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

      {/* React Flow (@xyflow/react) İnteraktif Topoloji Haritası */}
      <Card
        title={t(
          "ISA-95 / Purdue Katmanlı İnteraktif Topoloji Motoru (React Flow)",
          "ISA-95 / Purdue Layered Interactive Topology Engine (React Flow)",
        )}
        subtitle={t(
          "Bir PLC/SCADA düğümüne tıklayarak Etki Alanı (Blast Radius) odaklanma modunu ve sağdan kayan inceleme çekmecesini açın",
          "Click any PLC/SCADA node card to trigger Blast Radius focus mode and open the slide-over inspection drawer",
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
                  onClick={() => setLayoutMode(m.id)}
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

            <Button
              size="sm"
              variant={showEdgeLabels ? "outline" : "secondary"}
              onClick={() => setShowEdgeLabels((v) => !v)}
            >
              {showEdgeLabels ? t("Etiketler: Açık", "Labels: On") : t("Etiketler: Kapalı", "Labels: Off")}
            </Button>

            <div className="w-44">
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
            <div className="w-38">
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
        {/* Blast Radius (Etki Alanı Odaklanma Modu) Aktif Banner'ı */}
        {selectedNode && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-500/30 bg-sky-500/10 px-6 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone="teal" dot>
                {t("🎯 BLAST RADIUS (ETKİ ALANI) ODAKLANMA MODU", "🎯 BLAST RADIUS FOCUS MODE")}
              </Badge>
              <span className="font-bold text-[#1C2434]">{selectedNode.label}</span>
              <span className="font-mono font-bold text-sky-500 tabular-nums">
                ({selectedNode.ip_address ?? "—"})
              </span>
              <span className="text-[#64748B]">
                ·{" "}
                {t(
                  `${Math.max(0, blastNeighborIds.size - 1)} doğrudan bağlı komşu cihaz · ${selectedNodeEdges.length} aktif akış`,
                  `${Math.max(0, blastNeighborIds.size - 1)} directly connected neighbor nodes · ${selectedNodeEdges.length} active flows`,
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setDrawerOpen(true)}>
                {t("Yan Çekmecede İncele (Sheet)", "Inspect in Slide-Over Sheet")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setSelectedNodeId(null)}>
                {t("Odaklanmayı Kapat (Tüm Ağ)", "Exit Focus (Show All)")}
              </Button>
            </div>
          </div>
        )}

        <div className="relative h-[620px] w-full bg-[#F1F5F9] dark:bg-[#070B14]">
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
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.14 }}
              minZoom={0.35}
              maxZoom={2.2}
              onNodeClick={(_, clickedNode) => {
                if (clickedNode.id.startsWith("lane-")) return;
                setSelectedNodeId((prev) => {
                  const next = prev === clickedNode.id ? null : clickedNode.id;
                  if (next) setDrawerOpen(true);
                  return next;
                });
              }}
              onPaneClick={() => setSelectedNodeId(null)}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.2}
                color={isDark ? "#1E293B" : "#CBD5E1"}
              />
              <Controls position="top-right" showInteractive={false} />
              <MiniMap
                position="bottom-left"
                pannable
                zoomable
                style={{
                  backgroundColor: isDark ? "#0B1120" : "#FFFFFF",
                  border: isDark ? "1px solid #1E293B" : "1px solid #CBD5E1",
                  borderRadius: 6,
                }}
                maskColor={isDark ? "rgba(7, 11, 20, 0.72)" : "rgba(241, 245, 249, 0.72)"}
                nodeColor={(n) => {
                  if (n.id.startsWith("lane-")) return "transparent";
                  const d = n.data as unknown as IndustrialDeviceNodeData | undefined;
                  const g = d?.node;
                  if (!g) return "#38BDF8";
                  if (g.criticality === "critical" || g.criticality === "high") return "#EF4444";
                  return g.is_verified ? "#10B981" : "#F59E0B";
                }}
              />
            </ReactFlow>
          )}
        </div>

        {/* Alt Anlamsal Lejant Çubuğu */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E2E8F0] bg-white px-6 py-3 text-xs text-[#64748B] dark:border-[#1E293B] dark:bg-[#111827]">
          <div className="flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
              {t("Doğrulanmış / Baseline Akışı (#10B981)", "Verified / Baseline Flow (#10B981)")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
              {t("Doğrulanmamış Yeni Varlık (#F59E0B)", "Unverified New Asset (#F59E0B)")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 border-b-2 border-dashed border-[#EF4444]" />
              {t("Kritik / Bölgeler Arası Yetkisiz Trafik (#EF4444)", "Critical / Unauthorized Cross-Zone (#EF4444)")}
            </span>
          </div>
          <span className="font-mono text-[11px] text-[#64748B]">
            {t(
              "İpucu: Düğümleri fareyle sürükleyebilir, tekerlekle yakınlaştırabilir ve tıklayarak Blast Radius modunu açabilirsiniz.",
              "Tip: Drag node cards, scroll to zoom, and click any device to activate Blast Radius focus mode.",
            )}
          </span>
        </div>
      </Card>

      {/* Sağdan Kayarak Açılan Düğüm & Blast Radius İnceleme Çekmecesi (SlideOverDrawer) */}
      <SlideOverDrawer
        open={Boolean(selectedNode && drawerOpen)}
        onClose={() => setDrawerOpen(false)}
        title={selectedNode?.label ?? t("Düğüm Detayı", "Node Detail")}
        subtitle={`${selectedNode ? ASSET_TYPE_LABEL[selectedNode.asset_type] : ""} · Purdue ${
          selectedNode ? inferPurdueTier(selectedNode) : "L1"
        } · ${selectedNode?.ip_address ?? "—"}`}
        badge={
          selectedNode ? <CriticalityBadge value={selectedNode.criticality} /> : undefined
        }
        footer={
          selectedNode && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setDrawerOpen(false);
                  setSelectedNodeId(null);
                }}
              >
                {t("Blast Radius Modundan Çık", "Clear Blast Radius")}
              </Button>
              <Button
                variant="primary"
                onClick={() => navigate(`/assets/${selectedNode.id}`)}
              >
                {t("Tam Cihaz & CAD Konsoluna Git →", "Open Full Device & CAD Console →")}
              </Button>
            </>
          )
        }
      >
        {selectedNode && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-[#1E293B] dark:bg-[#161F30]">
                <div className="font-mono text-[10px] text-[#64748B] uppercase">
                  {t("IP ADRESİ", "IP ADDRESS")}
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-[#1C2434] tabular-nums">
                  {selectedNode.ip_address ?? "—"}
                </div>
              </div>
              <div className="rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-[#1E293B] dark:bg-[#161F30]">
                <div className="font-mono text-[10px] text-[#64748B] uppercase">
                  {t("KOMŞU DÜĞÜM (BLAST)", "BLAST NEIGHBORS")}
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-sky-500 tabular-nums">
                  {Math.max(0, blastNeighborIds.size - 1)} {t("cihaz", "nodes")}
                </div>
              </div>
              <div className="rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-[#1E293B] dark:bg-[#161F30]">
                <div className="font-mono text-[10px] text-[#64748B] uppercase">
                  {t("BAĞLI AKIŞLAR", "CONNECTED FLOWS")}
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-[#1C2434] tabular-nums">
                  {selectedNodeEdges.length}
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white dark:border-[#1E293B] dark:bg-[#111827]">
              <div className="border-b border-[#E2E8F0] px-4 py-2.5 font-semibold text-[#1C2434] dark:border-[#1E293B]">
                {t(
                  "Doğrudan İletişim Akışları (Etki Alanı Bağlantıları)",
                  "Direct Communication Flows (Blast Radius Links)",
                )}
              </div>
              <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
                {selectedNodeEdges.map((e) => {
                  const isOutbound = e.source_asset_id === selectedNode.id;
                  const peerLabel = isOutbound ? e.target_label : e.source_label;
                  const peerIp = isOutbound ? e.target_ip : e.source_ip;
                  const peerId = isOutbound ? e.target_asset_id : e.source_asset_id;
                  return (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-sky-500">
                            {isOutbound ? "→ GİDEN" : "← GELEN"}
                          </span>
                          <Link
                            to={`/assets/${peerId}`}
                            className="font-semibold text-[#1C2434] hover:underline"
                          >
                            {peerLabel}
                          </Link>
                          <span className="font-mono text-[11px] text-[#64748B] tabular-nums">
                            ({peerIp ?? "—"})
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <ProtocolBadge
                            protocol={e.protocol}
                            confidence={e.protocol_confidence}
                          />
                          {e.target_port !== null && (
                            <span className="font-mono text-[11px] text-[#64748B] tabular-nums">
                              :{e.target_port}
                            </span>
                          )}
                          {e.cross_zone && (
                            <Badge tone="red">{t("Bölgeler Arası", "Cross-Zone")}</Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {e.is_baseline_approved ? (
                          <Badge tone="emerald" dot>
                            {t("Baseline Onaylı", "Baseline Approved")}
                          </Badge>
                        ) : canEditAssets ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={approveSingleMut.isPending}
                            onClick={() => approveSingleMut.mutate(e.id)}
                          >
                            {t("✓ Baseline Onayla", "✓ Approve Baseline")}
                          </Button>
                        ) : (
                          <Badge tone="amber">{t("Onaysız", "Unapproved")}</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </SlideOverDrawer>

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
                `Yalnızca "${selectedNode.label}" cihazının etki alanındaki (Blast Radius) iletişim akışları gösteriliyor`,
                `Showing communication flows within the Blast Radius of "${selectedNode.label}"`,
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
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums">
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
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {e.target_ip ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <ProtocolBadge protocol={e.protocol} confidence={e.protocol_confidence} />
                          {e.target_port !== null && (
                            <span className="font-mono text-xs text-slate-600 tabular-nums">
                              :{e.target_port}
                            </span>
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
                      <td className="px-4 py-3 font-mono font-bold text-[#1C2434] tabular-nums">
                        {e.connection_count}
                      </td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap text-slate-500 tabular-nums">
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
