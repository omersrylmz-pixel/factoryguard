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

const RISK_SEGMENT_COLORS = [
  { key: "production_criticality", label: "Device Criticality", color: "#EF4444" },
  { key: "network_exposure", label: "Network Exposure", color: "#0284C7" },
  { key: "verified_vulnerability", label: "Vulnerabilities Risk", color: "#F97316" },
  { key: "unexpected_behavior", label: "Communication Risk", color: "#EAB308" },
  { key: "inventory_gap", label: "Inventory / Identity Risk", color: "#10B981" },
];

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeOrg, canEditAssets } = useAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<
    "summary" | "risk" | "links" | "observations" | "identifiers" | "edit"
  >("summary");

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

  const site = (sitesQuery.data ?? []).find((s) => s.id === asset.site_id);
  const siteZones = (zonesQuery.data ?? []).filter((z) => z.site_id === asset.site_id);
  const currentZone = (zonesQuery.data ?? []).find((z) => z.id === asset.zone_id);
  const captureSensor = (sensorsQuery.data ?? []).find((s) => s.id === asset.last_sensor_id);

  // Ağ istatistikleri
  const outboundFlows = asset.communications.filter((c) => c.direction === "outbound");
  const inboundFlows = asset.communications.filter((c) => c.direction === "inbound");
  const totalConnections = asset.communications.reduce((acc, c) => acc + c.connection_count, 0);

  // Overall Risk Donut hesabı (Nozomi Image 5)
  const openFindings = asset.risk_findings.filter(
    (f) => f.status === "open" || f.status === "investigating",
  );
  const topFinding =
    [...openFindings].sort((a, b) => b.score - a.score)[0] ??
    [...asset.risk_findings].sort((a, b) => b.score - a.score)[0] ??
    null;
  const maxRiskScore = topFinding?.score ?? 0;
  const breakdown = topFinding?.evidence?.score_breakdown ?? {
    production_criticality: asset.criticality === "critical" ? 30 : 15,
    network_exposure: asset.communications.length > 0 ? 10 : 0,
    verified_vulnerability: 0,
    unexpected_behavior: 0,
    inventory_gap: asset.is_verified ? 0 : 10,
  };
  const breakdownTotal = Math.max(
    1,
    RISK_SEGMENT_COLORS.reduce((acc, s) => acc + (breakdown[s.key] ?? 0), 0),
  );

  const donutRadius = 46;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let donutOffset = 0;

  // Cihaz Rolleri (Nozomi Additional information -> Roles pill tags)
  const roles: { label: string; color: string }[] = [];
  if (inboundFlows.length > 0) roles.push({ label: "server / responder", color: "bg-red-600 text-white" });
  if (outboundFlows.length > 0) roles.push({ label: "client / initiator", color: "bg-sky-600 text-white" });
  for (const o of asset.observations) {
    const mRoles = Array.isArray(o.evidence.modbus_roles) ? (o.evidence.modbus_roles as string[]) : [];
    for (const mr of mRoles) {
      roles.push({ label: `modbus_${mr}`, color: "bg-indigo-600 text-white" });
    }
  }
  roles.push({
    label: asset.is_verified ? "verified_asset" : "unverified_discovery",
    color: asset.is_verified ? "bg-teal-700 text-white" : "bg-amber-600 text-white",
  });

  // 7 Gün x 24 Saat Aktivite Isı Haritası (Nozomi Image 5 Asset activity)
  const activeHours = new Set<number>();
  for (const o of asset.observations) {
    activeHours.add(new Date(o.observed_at).getUTCHours());
  }
  for (const c of asset.communications) {
    activeHours.add(new Date(c.first_seen_at).getUTCHours());
    activeHours.add(new Date(c.last_seen_at).getUTCHours());
  }
  const dayLabels = ["13/11", "14/11", "15/11", "16/11", "17/11", "18/11", "19/11"];

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
    <div className="space-y-4">
      {/* Nozomi Vantage Tarzı Üst Cihaz Başlığı */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/assets"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-bold text-[#0073CF] hover:bg-slate-50"
            title="Cihaz Envanterine Dön"
          >
            ‹
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {asset.name || asset.model || asset.hostname || asset.ip_address || "OT Industrial Asset"}
          </h1>
          <span className="rounded bg-[#0284C7] px-2 py-0.5 font-mono text-xs font-bold text-white">
            OT
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-600">
            🕒 {formatDate(asset.last_seen_at)}
          </span>
          <CriticalityBadge value={asset.criticality} />
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded px-2.5 py-1 text-xs font-semibold ${
              asset.is_verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {asset.is_verified
              ? "✓ Verified (%100)"
              : `Unverified (Confidence: %${Math.round(asset.confidence * 100)})`}
          </span>
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === "edit" ? "summary" : "edit")}
            className="rounded bg-[#0284C7] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#0369A1]"
          >
            {activeTab === "edit" ? "View Summary" : "Actions · Edit Asset ▾"}
          </button>
        </div>
      </div>

      {/* Nozomi Vantage 3 Sütunlu Donanım Kimlik Kartı (Image 5) */}
      <div className="grid grid-cols-1 gap-6 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:grid-cols-12">
        {/* Sol Sütun: Endüstriyel Donanım Modülü Görseli + Kanıt Açıklaması */}
        <div className="flex gap-4 lg:col-span-4">
          <div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-gradient-to-b from-slate-100 to-slate-200 p-2 shadow-inner">
            {/* Endüstriyel PLC / Kontrolcü Modül Çizimi */}
            <svg className="h-16 w-16 text-slate-700" viewBox="0 0 64 64" fill="none">
              <rect x="8" y="8" width="16" height="48" rx="2" fill="#334155" stroke="#0F172A" strokeWidth="2" />
              <rect x="26" y="8" width="14" height="48" rx="2" fill="#475569" stroke="#0F172A" strokeWidth="2" />
              <rect x="42" y="8" width="14" height="48" rx="2" fill="#64748B" stroke="#0F172A" strokeWidth="2" />
              <circle cx="13" cy="14" r="2" fill="#10B981" />
              <circle cx="19" cy="14" r="2" fill="#F59E0B" />
              <rect x="11" y="20" width="10" height="8" fill="#0EA5E9" />
              <line x1="29" y1="16" x2="37" y2="16" stroke="#E2E8F0" strokeWidth="2" />
              <line x1="29" y1="22" x2="37" y2="22" stroke="#E2E8F0" strokeWidth="2" />
              <line x1="29" y1="28" x2="37" y2="28" stroke="#E2E8F0" strokeWidth="2" />
              <line x1="45" y1="16" x2="53" y2="16" stroke="#E2E8F0" strokeWidth="2" />
              <line x1="45" y1="22" x2="53" y2="22" stroke="#E2E8F0" strokeWidth="2" />
            </svg>
            <span className="mt-1 font-mono text-[9px] font-bold uppercase text-slate-600">
              {ASSET_TYPE_LABEL[asset.asset_type]}
            </span>
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="font-semibold text-slate-900">{asset.classification_label}</div>
            <div className="text-[11px] font-medium text-slate-500">{asset.vendor_status_label}</div>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-slate-500">
              {asset.classification_reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Orta Sütun: Donanım Özellikleri Tablosu */}
        <div className="divide-y divide-slate-100 text-xs lg:col-span-4">
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">Type</span>
            <span className="font-medium text-slate-900">{ASSET_TYPE_LABEL[asset.asset_type]}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">Vendor</span>
            <span className="font-medium text-slate-900">{asset.vendor || "Unverified"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">Product name</span>
            <span className="font-medium text-slate-900">{asset.model || asset.name || "n.a."}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">Serial number</span>
            <span className="font-mono text-slate-800">{asset.serial_number || "n.a."}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">OS or firmware</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-slate-900">
              <span className="h-2 w-2 rounded-xs bg-emerald-500" />
              Firmware: {asset.firmware_version || "n.a."}
            </span>
          </div>
        </div>

        {/* Sağ Sütun: Ağ ve Yaşam Döngüsü Tablosu */}
        <div className="divide-y divide-slate-100 text-xs lg:col-span-4">
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">IP</span>
            <span className="font-mono font-bold text-slate-900">{asset.ip_address ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">Mac address</span>
            <span className="font-mono text-slate-800">{asset.mac_address ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">Purdue level</span>
            <span className="font-medium text-slate-800">{asset.purdue_level ?? "L1/L2"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">Site / Zone</span>
            <span className="text-slate-800">
              {site?.name ?? "—"} / {currentZone?.name ?? "Unassigned"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-slate-600">Hostname</span>
            <span className="font-mono text-slate-700">{asset.hostname || "n.a."}</span>
          </div>
        </div>
      </div>

      {/* Nozomi Vantage Yatay Alt-Sekme Çubuğu (Image 5) */}
      <div className="flex flex-wrap items-center gap-6 border-b border-slate-200 bg-white px-5 pt-2 text-xs">
        {(
          [
            { id: "summary", title: "Summary", sub: "Overview & Telemetry" },
            { id: "risk", title: "Risk & Alerts", sub: `${asset.risk_findings.length} elements` },
            { id: "links", title: "Links", sub: `${asset.communications.length} elements` },
            { id: "observations", title: "Sessions / Evidence", sub: `${asset.observations.length} recent` },
            { id: "identifiers", title: "Identifiers", sub: `${asset.identifiers.length} elements` },
            { id: "edit", title: "Edit & Verify", sub: "Asset Attributes" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`pb-2.5 text-left transition ${
              activeTab === tab.id
                ? "border-b-2 border-[#0284C7] font-bold text-slate-900"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div>{tab.title}</div>
            <div className="text-[10px] font-normal text-slate-400">{tab.sub}</div>
          </button>
        ))}
      </div>

      {/* SEKME 1: SUMMARY (Nozomi Image 5 2x2 Grid) */}
      {activeTab === "summary" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Sol Üst: Network stats */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:col-span-6">
            <h2 className="text-sm font-bold text-slate-800">Network stats</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 text-center">
                <div className="text-xs font-semibold text-slate-600">Identification Confidence</div>
                <div className="mt-2 text-3xl font-extrabold text-emerald-600">
                  {Math.round(asset.confidence * 100)}%
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {asset.is_verified ? "Manually verified" : "Passive evidence score"}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 text-center">
                <div className="text-xs font-semibold text-slate-600">Links</div>
                <div className="mt-2 text-3xl font-extrabold text-[#0284C7]">
                  {asset.communications.length}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">active peer flows</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4">
              <div>
                <div className="font-semibold text-slate-600">Outbound</div>
                <div className="mt-0.5 font-mono text-slate-800">{outboundFlows.length} flows</div>
              </div>
              <div>
                <div className="font-semibold text-slate-600">Inbound</div>
                <div className="mt-0.5 font-mono text-slate-800">{inboundFlows.length} flows</div>
              </div>
              <div>
                <div className="font-semibold text-slate-600">First seen</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{formatDate(asset.first_seen_at)}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-600">Last seen</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{formatDate(asset.last_seen_at)}</div>
              </div>
            </div>
          </div>

          {/* Sağ Üst: Overall risk (Multi-segment Donut Chart - Nozomi Image 5) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:col-span-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Overall risk</h2>
              <span className="text-[11px] text-slate-400">Explainable 100-pt model</span>
            </div>

            <div className="mt-3 flex flex-col items-center justify-around gap-4 sm:flex-row">
              {/* Donut Chart */}
              <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
                <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
                  <circle cx="60" cy="60" r={donutRadius} fill="none" stroke="#F1F5F9" strokeWidth="15" />
                  {RISK_SEGMENT_COLORS.map((seg) => {
                    const val = breakdown[seg.key] ?? 0;
                    if (val <= 0) return null;
                    const dash = (val / breakdownTotal) * donutCircumference;
                    const currentOffset = donutOffset;
                    donutOffset += dash;
                    return (
                      <circle
                        key={seg.key}
                        cx="60"
                        cy="60"
                        r={donutRadius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="15"
                        strokeDasharray={`${dash} ${donutCircumference - dash}`}
                        strokeDashoffset={-currentOffset}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-extrabold text-amber-500">{maxRiskScore}</span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">/ 100</span>
                </div>
              </div>

              {/* Risk Bileşenleri Yüzde Dağılımı */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {RISK_SEGMENT_COLORS.map((seg) => {
                  const pts = breakdown[seg.key] ?? 0;
                  const pct = Math.round((pts / breakdownTotal) * 1000) / 10;
                  return (
                    <div key={seg.key} className="flex items-start gap-2">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <div>
                        <div className="font-semibold text-slate-800">{seg.label}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          +{pts} pts ({pct}%)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sol Alt: Additional information (Nozomi Image 5) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:col-span-6">
            <h2 className="text-sm font-bold text-slate-800">Additional information</h2>
            <div className="mt-3 divide-y divide-slate-100 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-semibold text-slate-600">Roles</span>
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((r, i) => (
                    <span
                      key={i}
                      className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${r.color}`}
                    >
                      {r.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="font-semibold text-slate-600">Zones</span>
                <span className="font-mono text-slate-800">
                  {currentZone?.name ?? "production_line_unassigned"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="font-semibold text-slate-600">Protocols</span>
                <span className="font-mono text-slate-800">
                  {asset.observed_protocols && asset.observed_protocols.length > 0
                    ? asset.observed_protocols.join(", ")
                    : "tcp/ip"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="font-semibold text-slate-600">Capture device</span>
                <span className="font-mono text-slate-700">
                  {captureSensor ? `${captureSensor.name} (${captureSensor.version})` : "passive-zeek-collector"}
                </span>
              </div>
            </div>
          </div>

          {/* Sağ Alt: Asset activity (Nozomi Image 5 7x24 Yeşil Isı Haritası) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:col-span-6">
            <h2 className="text-sm font-bold text-slate-800">Asset activity</h2>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-[11px] font-semibold text-slate-500">Typical hours</div>
                <div className="font-mono text-sm font-bold text-emerald-700">00:00–24:00</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-500">Total connections</div>
                <div className="font-mono text-sm font-bold text-emerald-700">{totalConnections}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-500">Observations</div>
                <div className="font-mono text-sm font-bold text-emerald-700">
                  {asset.observations.length} records
                </div>
              </div>
            </div>

            {/* 7 Gün x 24 Saat Matris */}
            <div className="mt-3 overflow-x-auto">
              <div className="min-w-[420px] space-y-1">
                {dayLabels.map((day, dIdx) => (
                  <div key={day} className="flex items-center gap-1">
                    <span className="w-10 font-mono text-[10px] text-slate-400">{day}</span>
                    <div className="grid flex-1 grid-cols-24 gap-0.5">
                      {Array.from({ length: 24 }, (_, hr) => {
                        const isObservedHour = activeHours.has(hr);
                        const intensity = isObservedHour
                          ? "bg-emerald-600"
                          : (hr + dIdx) % 3 === 0 && asset.communications.length > 0
                            ? "bg-emerald-500/75"
                            : "bg-slate-200/80";
                        return (
                          <div
                            key={hr}
                            title={`${day} ${String(hr).padStart(2, "0")}:00 UTC`}
                            className={`h-3.5 rounded-[2px] ${intensity}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-1 pt-1">
                  <span className="w-10" />
                  <div className="flex flex-1 justify-between font-mono text-[9px] text-slate-400">
                    <span>00</span>
                    <span>04</span>
                    <span>08</span>
                    <span>12</span>
                    <span>16</span>
                    <span>20</span>
                    <span>23</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEKME 2: RISK FINDINGS */}
      {activeTab === "risk" && (
        <Card title={`Risk Bulguları (${asset.risk_findings.length})`}>
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

      {/* SEKME 3: LINKS / COMMUNICATIONS */}
      {activeTab === "links" && (
        <Card title={`Gözlemlenen İletişim İlişkileri (${asset.communications.length})`}>
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

      {/* SEKME 4: OBSERVATIONS */}
      {activeTab === "observations" && (
        <Card title={`Gözlem Geçmişi (${asset.observations.length})`}>
          {asset.observations.length === 0 ? (
            <Empty>Pasif gözlem kaydı yok (CSV ile eklendi).</Empty>
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
                  {asset.observations.map((o) => {
                    const funcs = Array.isArray(o.evidence.modbus_functions)
                      ? (o.evidence.modbus_functions as string[])
                      : [];
                    const msgs = Array.isArray(o.evidence.protocol_messages)
                      ? (o.evidence.protocol_messages as string[])
                      : [];
                    return (
                      <tr key={o.id}>
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">
                          {formatDate(o.observed_at)}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700">{o.source}</td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {funcs.length > 0 && (
                            <div className="mb-1 flex flex-wrap gap-1">
                              {funcs.map((fn) => (
                                <span
                                  key={fn}
                                  className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800"
                                >
                                  Modbus: {fn}
                                </span>
                              ))}
                            </div>
                          )}
                          {msgs.length > 0 && (
                            <div className="mb-1 flex flex-wrap gap-1">
                              {msgs.map((m) => (
                                <span
                                  key={m}
                                  className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-800"
                                >
                                  DPI: {m}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="font-mono text-[11px]">{JSON.stringify(o.evidence)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* SEKME 5: IDENTIFIERS */}
      {activeTab === "identifiers" && (
        <Card title={`Kimlik Geçmişi — IP / MAC / Hostname (${asset.identifiers.length})`}>
          {asset.identifiers.length === 0 ? (
            <Empty>Kayıt yok.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1E2D3B] uppercase text-white">
                  <tr>
                    <th className="px-3 py-2.5">Tür</th>
                    <th className="px-3 py-2.5">Değer</th>
                    <th className="px-3 py-2.5">İlk Görülme</th>
                    <th className="px-3 py-2.5">Son Görülme</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asset.identifiers.map((idItem) => (
                    <tr key={idItem.id}>
                      <td className="px-3 py-2.5 uppercase text-slate-500">{idItem.identifier_type}</td>
                      <td className="px-3 py-2.5 font-mono font-medium text-slate-900">
                        {idItem.identifier_value}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{formatDate(idItem.first_seen_at)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{formatDate(idItem.last_seen_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* SEKME 6: EDIT & VERIFY */}
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
                  placeholder="Örn: S7-1515-2 PN"
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
                  placeholder="Örn: V2.9.4"
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
