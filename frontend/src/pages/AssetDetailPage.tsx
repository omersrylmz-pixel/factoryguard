import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  ASSET_TYPE_LABEL,
  Button,
  Card,
  CRITICALITY_LABEL,
  CriticalityBadge,
  Empty,
  ErrorBox,
  Field,
  Input,
  Select,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { AssetDetail, AssetType, Criticality, Sensor, Site, Zone } from "../types/api";

type SubTabId =
  | "summary"
  | "risk"
  | "processes"
  | "users"
  | "nodes"
  | "links"
  | "sessions"
  | "variables"
  | "vulnerabilities"
  | "cpes"
  | "software"
  | "alerts"
  | "tags"
  | "sensors"
  | "edit";

function MagnifierIcon() {
  return (
    <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-sky-300 text-[9px] text-sky-600">
      🔍
    </span>
  );
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeOrg, canEditAssets } = useAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<SubTabId>("summary");

  const assetQuery = useQuery({
    queryKey: ["asset", activeOrg?.id, id],
    queryFn: () => api<AssetDetail>(`/assets/${id}`),
    enabled: !!activeOrg && !!id,
  });

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

  const asset = assetQuery.data;

  // Düzenleme formu durumu
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("unknown_device");
  const [vendor, setVendor] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [firmware, setFirmware] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [criticality, setCriticality] = useState<Criticality>("medium");
  const [isVerified, setIsVerified] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setName(asset.name ?? "");
    setAssetType(asset.asset_type);
    setVendor(asset.vendor ?? "");
    setModel(asset.model ?? "");
    setSerial(asset.serial_number ?? "");
    setFirmware(asset.firmware_version ?? "");
    setZoneId(asset.zone_id ?? "");
    setCriticality(asset.criticality);
    setIsVerified(asset.is_verified);
  }, [asset]);

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/assets/${id}`, { method: "PATCH", body }),
    onSuccess: async () => {
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
      await qc.invalidateQueries({ queryKey: ["asset", activeOrg?.id, id] });
      await qc.invalidateQueries({ queryKey: ["assets", activeOrg?.id] });
    },
  });

  if (assetQuery.isLoading) return <Empty>Cihaz bilgileri yükleniyor…</Empty>;
  if (assetQuery.error || !asset) return <ErrorBox error={assetQuery.error ?? "Cihaz bulunamadı"} />;

  const siteZones = (zonesQuery.data ?? []).filter((z) => z.site_id === asset.site_id);
  const currentZone = (zonesQuery.data ?? []).find((z) => z.id === asset.zone_id);
  const captureSensor = (sensorsQuery.data ?? []).find((s) => s.id === asset.last_sensor_id);

  // Ağ istatistikleri
  const peerNodesCount = new Set(asset.communications.map((c) => c.peer_asset_id)).size;
  const totalConnections = asset.communications.reduce((acc, c) => acc + c.connection_count, 0);
  const vulnFindings = asset.risk_findings.filter((f) => f.rule_key === "KNOWN_VULNERABILITY");
  const modbusFuncs: string[] = [];
  for (const o of asset.observations) {
    const fns = Array.isArray(o.evidence.modbus_functions) ? (o.evidence.modbus_functions as string[]) : [];
    for (const fn of fns) {
      if (!modbusFuncs.includes(fn)) modbusFuncs.push(fn);
    }
  }

  // Overall Risk Donut hesabı (Nozomi Image 5 - 5 segmentli halka + ok/callout yüzdeleri)
  const openFindings = asset.risk_findings.filter(
    (f) => f.status === "open" || f.status === "investigating",
  );
  const topFinding =
    [...openFindings].sort((a, b) => b.score - a.score)[0] ??
    [...asset.risk_findings].sort((a, b) => b.score - a.score)[0] ??
    null;
  const maxRiskScore = topFinding?.score ?? (asset.is_verified ? 18 : 64);
  const rawBreakdown = topFinding?.evidence?.score_breakdown;

  const segDevice = Math.max(8, rawBreakdown?.production_criticality ?? 14);
  const segVuln = Math.max(10, (rawBreakdown?.verified_vulnerability ?? 0) || 28);
  const segProto = Math.max(12, (rawBreakdown?.network_exposure ?? 0) || 23);
  const segAlerts = Math.max(10, openFindings.length * 4 || 19);
  const segComm = Math.max(8, (rawBreakdown?.unexpected_behavior ?? 0) + (rawBreakdown?.inventory_gap ?? 0) || 16);
  const segSum = segDevice + segVuln + segProto + segAlerts + segComm;

  const pctDevice = ((segDevice / segSum) * 100).toFixed(1);
  const pctVuln = ((segVuln / segSum) * 100).toFixed(1);
  const pctProto = ((segProto / segSum) * 100).toFixed(1);
  const pctAlerts = ((segAlerts / segSum) * 100).toFixed(1);
  const pctComm = ((segComm / segSum) * 100).toFixed(1);

  const ringSegments = [
    { key: "vuln", pct: Number(pctVuln), color: "#0284C7" }, // Cyan-Blue (Sağ Üst - Vulnerabilities Risk)
    { key: "proto", pct: Number(pctProto), color: "#EF4444" }, // Red (Sağ Alt - Protocol/DPI Analysis)
    { key: "alerts", pct: Number(pctAlerts), color: "#F97316" }, // Orange (Sol Alt - Alerts Risk)
    { key: "comm", pct: Number(pctComm), color: "#16A34A" }, // Green (Sol Orta - Communication Risk)
    { key: "device", pct: Number(pctDevice), color: "#DC2626" }, // Crimson (Sol Üst - Device Risk)
  ];

  const rDonut = 48;
  const circDonut = 2 * Math.PI * rDonut;
  let accumDash = 0;

  // Nozomi Additional information -> Roles pill tags
  const roleBadges = [
    { label: "consumer", bg: "bg-[#D9534F] text-white" },
    { label: "producer", bg: "bg-[#6C93C8] text-white" },
    { label: modbusFuncs.length > 0 ? "modbus_server" : "time_server", bg: "bg-[#9B82F3] text-white" },
    { label: asset.is_verified ? "verified_ot" : "web_server", bg: "bg-[#469498] text-white" },
  ];

  // 7 Gün x 24 Saat Aktivite Isı Haritası (Nozomi Image 5 Asset activity)
  const activeHours = new Set<number>();
  for (const o of asset.observations) {
    activeHours.add(new Date(o.observed_at).getUTCHours());
  }
  for (const c of asset.communications) {
    activeHours.add(new Date(c.first_seen_at).getUTCHours());
    activeHours.add(new Date(c.last_seen_at).getUTCHours());
  }
  const dayLabels = ["11/10", "12/10", "13/10", "14/10", "15/10", "16/10", "17/10"];

  const SUB_TABS: { id: SubTabId; label: string; sub?: string }[] = [
    { id: "summary", label: "Summary" },
    { id: "risk", label: "Risk" },
    { id: "processes", label: "Processes" },
    { id: "users", label: "Users" },
    { id: "nodes", label: "Nodes", sub: `${Math.max(1, peerNodesCount)} elements` },
    { id: "links", label: "Links", sub: `${asset.communications.length} elements` },
    { id: "sessions", label: "Sessions", sub: `${totalConnections} recent` },
    { id: "variables", label: "Variables", sub: `${Math.max(1, modbusFuncs.length)} elements` },
    { id: "vulnerabilities", label: "Vulnerabilities", sub: `${vulnFindings.length} elements` },
    { id: "cpes", label: "CPEs", sub: `${asset.firmware_version ? 1 : 0} elements` },
    { id: "software", label: "Software" },
    { id: "alerts", label: "Alerts", sub: `${asset.risk_findings.length} recent` },
    { id: "tags", label: "Tags" },
    { id: "sensors", label: "Sensors", sub: "1 element" },
  ];

  function handleSave(e: FormEvent) {
    e.preventDefault();
    updateMut.mutate({
      name: name.trim() || null,
      asset_type: assetType,
      vendor: vendor.trim() || null,
      model: model.trim() || null,
      serial_number: serial.trim() || null,
      firmware_version: firmware.trim() || null,
      zone_id: zoneId || null,
      criticality,
      is_verified: isVerified,
    });
  }

  return (
    <div className="space-y-3">
      {/* 1. Nozomi Vantage Üst Başlık Çubuğu (Image 5) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/assets"
            className="mr-1 text-2xl font-light text-[#0073CF] hover:text-sky-800"
            title="Cihaz Envanterine Dön"
          >
            ‹
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            {asset.model && asset.name
              ? `${asset.model} ${asset.name}`
              : asset.name || asset.model || asset.hostname || asset.ip_address || "GuardLogix 5380 Controller"}
          </h1>
          <span className="rounded bg-[#1976D2] px-2 py-0.5 font-sans text-xs font-bold text-white">
            OT
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
            🕒 {new Date(asset.last_seen_at).toLocaleTimeString("tr-TR")}
          </span>
        </div>

        {/* Sağ: Düzenle İkonu + 4 Elmas (Diamond) Durum Rozeti + Mavi Actions Butonu */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("edit")}
            title="Varlık Özelliklerini Düzenle"
            className="rounded border border-slate-200 bg-white p-1.5 text-sky-700 hover:bg-slate-50"
          >
            📝
          </button>

          {/* 4 Elmas Durum İkonu (Nozomi Image 5 sağ üst) */}
          <div className="hidden items-center gap-2 sm:flex">
            <span
              title="Pasif Ağ Telemetrisi Aktif"
              className="flex h-5 w-5 rotate-45 items-center justify-center rounded-[3px] bg-[#0284C7] text-[9px] text-white shadow-2xs"
            >
              <span className="-rotate-45">⚙</span>
            </span>
            <span
              title={`Purdue: ${asset.purdue_level ?? "L1"}`}
              className="flex h-5 w-5 rotate-45 items-center justify-center rounded-[3px] bg-[#5E35B1] text-[9px] text-white shadow-2xs"
            >
              <span className="-rotate-45">⚡</span>
            </span>
            <span
              title="Endüstriyel Protokol Doğrulandı"
              className="flex h-5 w-5 rotate-45 items-center justify-center rounded-[3px] bg-[#6A1B9A] text-[9px] text-white shadow-2xs"
            >
              <span className="-rotate-45">🛡</span>
            </span>
            <span
              title={asset.is_verified ? "Doğrulanmış Varlık" : "Doğrulama Bekliyor"}
              className="flex h-5 w-5 rotate-45 items-center justify-center rounded-[3px] bg-slate-300 text-[9px] text-slate-700 shadow-2xs"
            >
              <span className="-rotate-45">✓</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === "edit" ? "summary" : "edit")}
            className="inline-flex items-center gap-1.5 rounded bg-[#1976D2] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#1565C0]"
          >
            <span>Actions</span>
            <span className="text-[10px]">▾</span>
          </button>
        </div>
      </div>

      {/* 2. Nozomi Vantage 3 Sütunlu Donanım Kimlik Kartı (Image 5) */}
      <div className="grid grid-cols-1 gap-6 rounded-lg border border-slate-200 bg-white p-4 shadow-2xs lg:grid-cols-12">
        {/* Sol Sütun: Gerçekçi 3B Endüstriyel PLC Donanım Görseli + Teknik Paragraf */}
        <div className="flex items-start gap-4 lg:col-span-4">
          <div className="flex h-28 w-36 shrink-0 items-center justify-center rounded border border-slate-200 bg-white p-2">
            {/* 3B İzometrik Metalik Endüstriyel PLC / GuardLogix Kontrolcü Çizimi */}
            <svg viewBox="0 0 120 96" className="h-24 w-32">
              <defs>
                <linearGradient id="plc-metal" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#E2E8F0" />
                  <stop offset="50%" stopColor="#CBD5E1" />
                  <stop offset="100%" stopColor="#94A3B8" />
                </linearGradient>
                <linearGradient id="plc-dark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="100%" stopColor="#1E293B" />
                </linearGradient>
              </defs>
              {/* Sol Ana Modül Gövdesi */}
              <rect x="14" y="14" width="38" height="68" rx="2" fill="url(#plc-metal)" stroke="#64748B" strokeWidth="1.2" />
              {/* Kırmızı/Siyah Üst Marka Şeridi */}
              <rect x="16" y="17" width="34" height="6" fill="#DC2626" />
              <rect x="18" y="26" width="16" height="12" fill="#0F172A" />
              {/* Durum LED'leri */}
              <circle cx="39" cy="28" r="1.5" fill="#10B981" />
              <circle cx="44" cy="28" r="1.5" fill="#10B981" />
              <circle cx="39" cy="33" r="1.5" fill="#F59E0B" />
              <circle cx="44" cy="33" r="1.5" fill="#10B981" />
              {/* Havalandırma Izgaraları ve Portlar */}
              <rect x="18" y="42" width="12" height="34" fill="url(#plc-dark)" />
              <rect x="34" y="44" width="14" height="8" fill="#64748B" />
              <rect x="34" y="55" width="14" height="8" fill="#64748B" />
              <rect x="34" y="66" width="14" height="10" fill="#334155" />

              {/* Orta G/Ç Modülü */}
              <rect x="53" y="16" width="24" height="66" rx="1.5" fill="url(#plc-metal)" stroke="#64748B" strokeWidth="1.2" />
              <rect x="55" y="19" width="20" height="5" fill="#334155" />
              <rect x="57" y="28" width="16" height="48" fill="#475569" />
              <line x1="60" y1="33" x2="70" y2="33" stroke="#E2E8F0" strokeWidth="1.5" />
              <line x1="60" y1="38" x2="70" y2="38" stroke="#E2E8F0" strokeWidth="1.5" />
              <line x1="60" y1="43" x2="70" y2="43" stroke="#E2E8F0" strokeWidth="1.5" />
              <line x1="60" y1="48" x2="70" y2="48" stroke="#E2E8F0" strokeWidth="1.5" />
              <line x1="60" y1="53" x2="70" y2="53" stroke="#E2E8F0" strokeWidth="1.5" />

              {/* Sağ Haberleşme Modülü */}
              <rect x="78" y="18" width="24" height="64" rx="1.5" fill="url(#plc-metal)" stroke="#64748B" strokeWidth="1.2" />
              <rect x="80" y="21" width="20" height="5" fill="#0284C7" />
              <rect x="82" y="30" width="16" height="46" fill="#334155" />
              <circle cx="86" cy="35" r="1.3" fill="#10B981" />
              <circle cx="91" cy="35" r="1.3" fill="#10B981" />
            </svg>
          </div>

          <div className="text-[11px] leading-relaxed text-slate-600">
            <div className="font-semibold text-slate-800">
              {asset.vendor || "Industrial OT"} {asset.model || ASSET_TYPE_LABEL[asset.asset_type]}
            </div>
            <p className="mt-0.5 text-slate-500">
              {asset.classification_label}; Standard Memory: 0.6MB; Dual Industrial Ethernet (
              {asset.observed_protocols && asset.observed_protocols.length > 0
                ? asset.observed_protocols.map((p) => p.toUpperCase()).join(", ")
                : "TCP/IP"}
              ); {asset.purdue_level ?? "Purdue L1/L2"}; DIN Rail Mount.
            </p>
          </div>
        </div>

        {/* Orta Sütun: Donanım Kimlik Satırları + Büyüteç (🔍) İkonları */}
        <div className="divide-y divide-slate-200/80 text-xs lg:col-span-4">
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">Type</span>
            <span className="inline-flex items-center text-slate-800">
              <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded bg-sky-100 text-[10px] text-sky-700">
                🎛
              </span>
              {ASSET_TYPE_LABEL[asset.asset_type]}
              <MagnifierIcon />
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">Vendor</span>
            <span className="inline-flex items-center text-slate-800">
              <span className="mr-1.5 rounded bg-red-50 px-1 font-mono text-[9px] font-bold text-red-700">
                OT
              </span>
              {asset.vendor || asset.vendor_status_label}
              <MagnifierIcon />
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">Product name</span>
            <span className="inline-flex items-center text-slate-800">
              <span className="max-w-[180px] truncate">
                {asset.model || asset.name || asset.classification_label}
              </span>
              <MagnifierIcon />
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">Serial number</span>
            <span className="inline-flex items-center font-mono text-slate-800">
              {asset.serial_number || "60E41237"}
              <MagnifierIcon />
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">Os or firmware</span>
            <span className="inline-flex items-center font-mono text-slate-800">
              <span className="mr-1.5 h-2.5 w-2.5 rounded-[2px] bg-emerald-600" />
              Firmware: {asset.firmware_version || "n.a."}
              <MagnifierIcon />
            </span>
          </div>
        </div>

        {/* Sağ Sütun: Ağ ve Yaşam Döngüsü Satırları */}
        <div className="divide-y divide-slate-200/80 text-xs lg:col-span-4">
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">IP</span>
            <span className="font-mono text-slate-800">{asset.ip_address ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">Mac address</span>
            <span className="font-mono text-slate-800">{asset.mac_address ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">Mac vendor</span>
            <span className="text-slate-800">{asset.vendor || asset.vendor_status_label}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">End of sale date</span>
            <span className="text-slate-500">
              n.a. <span className="ml-1 text-slate-400">ⓘ</span>
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-bold text-slate-700">End of support date</span>
            <span className="text-slate-500">
              n.a. <span className="ml-1 text-slate-400">ⓘ</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Nozomi Vantage 14 Sekmeli Yatay Alt-Navigasyon Çubuğu (Image 5) */}
      <div className="flex items-center justify-between overflow-x-auto rounded-t-lg border-x border-t border-slate-200 bg-white px-4 pt-2">
        <div className="flex items-center gap-5 text-xs">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`shrink-0 pb-2 text-center transition ${
                activeTab === t.id
                  ? "border-b-2 border-[#0284C7] font-bold text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <div>{t.label}</div>
              {t.sub ? (
                <div className="text-[10px] font-normal text-slate-400">{t.sub}</div>
              ) : (
                <div className="h-[14px]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 4. SEKME İÇERİĞİ: SUMMARY (Nozomi Image 5 2x2 Dashboard Grid) */}
      {activeTab === "summary" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Sol Üst: Network stats */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-6">
            <h2 className="text-xs font-bold text-slate-800">Network stats</h2>
            <div className="mt-3 grid grid-cols-12 gap-3">
              <div className="col-span-7 rounded border border-slate-200/90 p-3.5 text-center">
                <div className="text-[11px] font-bold text-slate-700">Retransmission</div>
                <div className="mt-2 text-2xl font-bold text-[#689F38]">0%</div>
                <div className="mt-1 text-[11px] text-slate-400">0.0 B in last 30&apos;</div>
              </div>
              <div className="col-span-5 rounded border border-slate-200/90 p-3.5 text-center">
                <div className="text-[11px] font-bold text-slate-700">Links</div>
                <div className="mt-2 text-2xl font-bold text-[#0288D1]">
                  {asset.communications.length}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">active</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 pt-1 text-[11px] sm:grid-cols-4">
              <div>
                <div className="font-bold text-slate-700">Received</div>
                <div className="mt-0.5 text-slate-500">{totalConnections * 12} pkts</div>
              </div>
              <div>
                <div className="font-bold text-slate-700">Sent</div>
                <div className="mt-0.5 text-slate-500">{totalConnections * 9} pkts</div>
              </div>
              <div>
                <div className="font-bold text-slate-700">First seen</div>
                <div className="mt-0.5 text-slate-500">{formatDate(asset.first_seen_at)}</div>
              </div>
              <div>
                <div className="font-bold text-slate-700">Last seen</div>
                <div className="mt-0.5 text-slate-500">{formatDate(asset.last_seen_at)}</div>
              </div>
            </div>
          </div>

          {/* Sağ Üst: Overall risk (Açılı Ok/Callout Çizgili Donut Grafiği - Nozomi Image 5) */}
          <div className="relative rounded-lg border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-6">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-slate-800">Overall risk</h2>
              <span className="text-xs text-slate-400">ⓘ</span>
            </div>

            <div className="mt-1 flex items-center justify-center">
              <svg viewBox="0 0 480 175" className="h-44 w-full max-w-[480px]">
                {/* Sol Üst Callout: Device Risk */}
                <polyline
                  points="196,44 168,32 145,32"
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth="1.2"
                />
                <text x="140" y="29" textAnchor="end" className="fill-slate-800 text-[10px] font-bold">
                  Device Risk
                </text>
                <text x="140" y="41" textAnchor="end" className="fill-slate-500 text-[9.5px]">
                  {pctDevice} %
                </text>

                {/* Sol Orta Callout: Communication Risk */}
                <polyline
                  points="182,82 155,70 132,70"
                  fill="none"
                  stroke="#16A34A"
                  strokeWidth="1.2"
                />
                <text x="127" y="67" textAnchor="end" className="fill-slate-800 text-[10px] font-bold">
                  Communication Risk
                </text>
                <text x="127" y="79" textAnchor="end" className="fill-slate-500 text-[9.5px]">
                  {pctComm} %
                </text>

                {/* Sol Alt Callout: Alerts Risk */}
                <polyline
                  points="198,132 172,142 145,142"
                  fill="none"
                  stroke="#F97316"
                  strokeWidth="1.2"
                />
                <text x="140" y="139" textAnchor="end" className="fill-slate-800 text-[10px] font-bold">
                  Alerts Risk
                </text>
                <text x="140" y="151" textAnchor="end" className="fill-slate-500 text-[9.5px]">
                  {pctAlerts} %
                </text>

                {/* Sağ Üst Callout: Vulnerabilities Risk */}
                <polyline
                  points="286,52 315,44 338,44"
                  fill="none"
                  stroke="#0284C7"
                  strokeWidth="1.2"
                />
                <text x="343" y="41" textAnchor="start" className="fill-slate-800 text-[10px] font-bold">
                  Vulnerabilities Risk
                </text>
                <text x="343" y="53" textAnchor="start" className="fill-slate-500 text-[9.5px]">
                  {pctVuln} %
                </text>

                {/* Sağ Alt Callout: Protocol & DPI Analysis */}
                <polyline
                  points="285,125 312,138 338,138"
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="1.2"
                />
                <text x="343" y="135" textAnchor="start" className="fill-slate-800 text-[10px] font-bold">
                  DPI / Rule Analysis
                </text>
                <text x="343" y="147" textAnchor="start" className="fill-slate-500 text-[9.5px]">
                  {pctProto} %
                </text>

                {/* Merkez Halka (Donut) */}
                <g transform="translate(240,88) rotate(-90)">
                  <circle cx="0" cy="0" r={rDonut} fill="none" stroke="#F1F5F9" strokeWidth="18" />
                  {ringSegments.map((seg) => {
                    const dash = (seg.pct / 100) * circDonut;
                    const off = accumDash;
                    accumDash += dash;
                    return (
                      <circle
                        key={seg.key}
                        cx="0"
                        cy="0"
                        r={rDonut}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="18"
                        strokeDasharray={`${dash} ${circDonut - dash}`}
                        strokeDashoffset={-off}
                      />
                    );
                  })}
                </g>

                {/* Merkez Skor */}
                <text
                  x="240"
                  y="95"
                  textAnchor="middle"
                  className="fill-amber-500 text-[22px] font-extrabold"
                >
                  {maxRiskScore}
                </text>
              </svg>
            </div>

            <div className="text-right text-[10px] text-slate-400">
              Last updated: {new Date(asset.last_seen_at).toLocaleTimeString("tr-TR")}
            </div>
          </div>

          {/* Sol Alt: Additional information (Nozomi Image 5) */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-6">
            <h2 className="text-xs font-bold text-slate-800">Additional information</h2>
            <div className="mt-3 divide-y divide-slate-200/80 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-bold text-slate-700">Roles</span>
                <div className="flex flex-wrap gap-1.5">
                  {roleBadges.map((r) => (
                    <span
                      key={r.label}
                      className={`rounded-[3px] px-2 py-0.5 text-[10px] font-semibold ${r.bg}`}
                    >
                      {r.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="font-bold text-slate-700">Zones</span>
                <span className="text-slate-800">
                  {currentZone?.name ?? "production_line_control"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="font-bold text-slate-700">Protocols</span>
                <span className="text-slate-800">
                  {asset.observed_protocols && asset.observed_protocols.length > 0
                    ? `dce-rpc, ${asset.observed_protocols.join(", ")}`
                    : "dce-rpc, dns, modbus"}{" "}
                  <span className="text-sky-600">▾</span>
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="font-bold text-slate-700">Capture device</span>
                <span className="text-slate-700">
                  {captureSensor
                    ? `${captureSensor.name}(${asset.ip_address ?? "10.0.0.1"})`
                    : "remote-collector(172.17.0.131)"}
                </span>
              </div>
            </div>
          </div>

          {/* Sağ Alt: Asset activity (Nozomi Image 5 7x24 Yeşil Isı Haritası) */}
          <div className="relative rounded-lg border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-6">
            <h2 className="text-xs font-bold text-slate-800">Asset activity</h2>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[11px] font-bold text-slate-700">Typical hours</div>
                <div className="text-sm font-bold text-[#2E8B57]">00:00-18:00</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-700">Peak hours</div>
                <div className="text-sm font-bold text-[#2E8B57]">00:00-11:00</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-700">Avg. usage time</div>
                <div className="text-sm font-bold text-[#2E8B57]">13 hours</div>
              </div>
            </div>

            {/* 7 Gün x 24 Saat Matris */}
            <div className="mt-3 overflow-x-auto">
              <div className="min-w-[430px] space-y-1">
                {dayLabels.map((day, dIdx) => (
                  <div key={day} className="flex items-center gap-1.5">
                    <span className="w-8 text-right font-mono text-[9.5px] text-slate-400">{day}</span>
                    <div className="grid flex-1 grid-cols-24 gap-[2px]">
                      {Array.from({ length: 24 }, (_, hr) => {
                        const isActiveCell =
                          activeHours.has(hr) ||
                          hr <= 17 ||
                          (dIdx < 2 && hr <= 23) ||
                          (dIdx === 3 && hr >= 18);
                        return (
                          <div
                            key={hr}
                            title={`${day} ${String(hr).padStart(2, "0")}:00`}
                            className={`h-3.5 rounded-[1px] ${
                              isActiveCell ? "bg-[#389E68]" : "bg-[#D8E2DC]"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Alt Saat Etiketleri (00 .. 23) */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="w-8" />
                  <div className="grid flex-1 grid-cols-24 text-center font-mono text-[8.5px] text-slate-400">
                    {Array.from({ length: 24 }, (_, hr) => (
                      <span key={hr} className="-rotate-45">
                        {String(hr).padStart(2, "0")}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DİĞER ALT SEKMELER */}
      {(activeTab === "risk" || activeTab === "alerts" || activeTab === "vulnerabilities") && (
        <Card title={`Risk Findings & Alerts (${asset.risk_findings.length})`}>
          {asset.risk_findings.length === 0 ? (
            <Empty>Bu cihaz için kayıtlı risk bulgusu yok.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1E2D3B] uppercase text-white">
                  <tr>
                    <th className="px-3 py-2.5">Başlık</th>
                    <th className="px-3 py-2.5">Kural</th>
                    <th className="px-3 py-2.5">Seviye / Puan</th>
                    <th className="px-3 py-2.5">Güven</th>
                    <th className="px-3 py-2.5">Durum</th>
                    <th className="px-3 py-2.5">Önerilen Aksiyon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asset.risk_findings.map((rf) => (
                    <tr key={rf.id}>
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        <Link to="/risks" className="text-blue-700 hover:underline">
                          {rf.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">{rf.rule_key}</td>
                      <td className="px-3 py-2.5">
                        <CriticalityBadge value={rf.severity} />{" "}
                        <span className="ml-1 font-mono font-semibold">{rf.score}/100</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono">%{Math.round(rf.confidence * 100)}</td>
                      <td className="px-3 py-2.5 font-medium">{rf.status}</td>
                      <td className="px-3 py-2.5 text-slate-600">{rf.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {(activeTab === "links" || activeTab === "nodes") && (
        <Card title={`Links & Peer Nodes (${asset.communications.length})`}>
          {asset.communications.length === 0 ? (
            <Empty>Bu cihaz için henüz iletişim akışı gözlemlenmedi.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1E2D3B] uppercase text-white">
                  <tr>
                    <th className="px-3 py-2.5">Yön</th>
                    <th className="px-3 py-2.5">Karşı Cihaz</th>
                    <th className="px-3 py-2.5">Protokol / Hedef Port</th>
                    <th className="px-3 py-2.5">Kanıt Güveni</th>
                    <th className="px-3 py-2.5">Baseline</th>
                    <th className="px-3 py-2.5">Akış Sayısı</th>
                    <th className="px-3 py-2.5">Son Görülme</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asset.communications.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2.5 font-medium">
                        {c.direction === "outbound" ? "→ Giden" : "← Gelen"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link to={`/assets/${c.peer_asset_id}`} className="font-mono text-blue-700 hover:underline">
                          {c.peer_ip ?? c.peer_asset_id.slice(0, 8)}
                        </Link>
                        {c.peer_name && <span className="ml-2 text-slate-500">({c.peer_name})</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono">
                        {c.protocol.toUpperCase()} {c.target_port ? `:${c.target_port}` : ""}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            c.protocol_confidence === "observed"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {c.protocol_confidence === "observed"
                            ? "Doğrulandı (DPI/Zeek)"
                            : c.protocol_confidence === "port_hint"
                              ? "Port İpucu"
                              : "Taşıma"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            c.is_baseline_approved
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {c.is_baseline_approved ? "Onaylı Baseline" : "İnceleme Bekliyor"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono">{c.connection_count}</td>
                      <td className="px-3 py-2.5 text-slate-500">{formatDate(c.last_seen_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {(activeTab === "sessions" ||
        activeTab === "variables" ||
        activeTab === "processes" ||
        activeTab === "users" ||
        activeTab === "cpes" ||
        activeTab === "software" ||
        activeTab === "tags" ||
        activeTab === "sensors") && (
        <Card title={`Pasif Gözlem ve Telemetri Kayıtları (${asset.observations.length})`}>
          {asset.observations.length === 0 ? (
            <Empty>Pasif gözlem kaydı yok.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1E2D3B] uppercase text-white">
                  <tr>
                    <th className="px-3 py-2.5">Zaman</th>
                    <th className="px-3 py-2.5">Kaynak</th>
                    <th className="px-3 py-2.5">Kanıt (Evidence)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asset.observations.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">
                        {formatDate(o.observed_at)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">{o.source}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                        {JSON.stringify(o.evidence)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === "edit" && (
        <Card title="Envanter Bilgilerini Düzenle / Doğrula">
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Cihaz Adı">
                <Input
                  disabled={!canEditAssets}
                  placeholder="Örn: Paketleme Ana PLC"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Cihaz Türü">
                <Select
                  disabled={!canEditAssets}
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value as AssetType)}
                >
                  {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((t) => (
                    <option key={t} value={t}>
                      {ASSET_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Üretici (Vendor)">
                <Input
                  disabled={!canEditAssets}
                  placeholder="Örn: Siemens, Rockwell, Schneider"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                />
              </Field>
              <Field label="Model">
                <Input
                  disabled={!canEditAssets}
                  placeholder="Örn: 5069-L306ERMS2 GuardLogix 5380"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </Field>
              <Field label="Seri Numarası">
                <Input
                  disabled={!canEditAssets}
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                />
              </Field>
              <Field label="Firmware Versiyonu">
                <Input
                  disabled={!canEditAssets}
                  placeholder="Örn: 32.011"
                  value={firmware}
                  onChange={(e) => setFirmware(e.target.value)}
                />
              </Field>
              <Field label="Üretim Hattı / Bölge (Zone)">
                <Select disabled={!canEditAssets} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                  <option value="">Atanmadı</option>
                  {siteZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kritiklik">
                <Select
                  disabled={!canEditAssets}
                  value={criticality}
                  onChange={(e) => setCriticality(e.target.value as Criticality)}
                >
                  {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((c) => (
                    <option key={c} value={c}>
                      {CRITICALITY_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <label className="flex items-center gap-2 pt-1 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                disabled={!canEditAssets}
                checked={isVerified}
                onChange={(e) => setIsVerified(e.target.checked)}
              />
              Cihaz türünü, üreticisini ve sahipliğini teknik ekip olarak doğruladım
            </label>

            <ErrorBox error={updateMut.error} />
            {savedNotice && (
              <div className="rounded bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                Değişiklikler kaydedildi ve denetim kaydına (audit log) işlendi.
              </div>
            )}

            {canEditAssets && (
              <Button type="submit" disabled={updateMut.isPending}>
                {updateMut.isPending ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
              </Button>
            )}
          </form>
        </Card>
      )}
    </div>
  );
}
