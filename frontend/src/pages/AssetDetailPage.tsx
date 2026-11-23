import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { DeviceHardwareChassisCard } from "../components/deviceVisuals";
import {
  ASSET_TYPE_LABEL,
  Badge,
  Button,
  Card,
  CRITICALITY_LABEL,
  CriticalityBadge,
  Empty,
  ErrorBox,
  Field,
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
import type { AssetDetail, AssetType, Criticality, Sensor, Site, Zone } from "../types/api";

type DetailTab = "overview" | "risks" | "communications" | "observations" | "identifiers" | "edit";

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeOrg, canEditAssets } = useAuth();
  const { t } = useLang();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

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

  // Düzenleme formu
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

  if (assetQuery.isLoading) return <Empty>{t("Cihaz bilgileri yükleniyor…", "Loading device details…")}</Empty>;
  if (assetQuery.error || !asset)
    return <ErrorBox error={assetQuery.error ?? t("Cihaz bulunamadı", "Device not found")} />;

  const site = (sitesQuery.data ?? []).find((s) => s.id === asset.site_id);
  const siteZones = (zonesQuery.data ?? []).filter((z) => z.site_id === asset.site_id);
  const currentZone = (zonesQuery.data ?? []).find((z) => z.id === asset.zone_id);
  const captureSensor = (sensorsQuery.data ?? []).find((s) => s.id === asset.last_sensor_id);

  const outboundFlows = asset.communications.filter((c) => c.direction === "outbound");
  const inboundFlows = asset.communications.filter((c) => c.direction === "inbound");
  const totalConnections = asset.communications.reduce((acc, c) => acc + c.connection_count, 0);

  const portMap = new Map<string, { port: number; proto: string; direction: string }>();
  for (const c of asset.communications) {
    if (c.target_port !== null) {
      const proto = c.protocol.replace(/\?+$/, "").toUpperCase();
      const key = `${c.target_port}:${proto}`;
      if (!portMap.has(key)) {
        portMap.set(key, { port: c.target_port, proto, direction: c.direction });
      }
    }
  }
  const activePorts = Array.from(portMap.values());

  const openFindings = asset.risk_findings.filter(
    (f) => f.status === "open" || f.status === "investigating",
  );
  const topFinding =
    [...openFindings].sort((a, b) => b.score - a.score)[0] ??
    [...asset.risk_findings].sort((a, b) => b.score - a.score)[0] ??
    null;
  const maxRiskScore = topFinding?.score ?? 0;
  const breakdown = topFinding?.evidence?.score_breakdown ?? {};

  const riskBreakdownSegments = [
    {
      key: "production_criticality",
      label: t("Üretim Kritikliği (Maks 30)", "Production Criticality (Max 30)"),
      max: 30,
      color: "#E11D48",
    },
    {
      key: "network_exposure",
      label: t("Ağ Maruziyeti (Maks 25)", "Network Exposure (Max 25)"),
      max: 25,
      color: "#0D9488",
    },
    {
      key: "verified_vulnerability",
      label: t("Doğrulanmış Zafiyet (Maks 25)", "Verified Vulnerability (Max 25)"),
      max: 25,
      color: "#D97706",
    },
    {
      key: "unexpected_behavior",
      label: t("Beklenmeyen İletişim (Maks 10)", "Unexpected Behavior (Max 10)"),
      max: 10,
      color: "#0284C7",
    },
    {
      key: "inventory_gap",
      label: t("Envanter Eksikliği (Maks 10)", "Inventory Gap (Max 10)"),
      max: 10,
      color: "#64748B",
    },
  ];

  // Gerçek gözlem saatlerinden 24 saatlik orantılı aktivite dağılımı
  const hourlyActivity = Array.from({ length: 24 }, (_, hr) => {
    let count = 0;
    for (const o of asset.observations) {
      if (new Date(o.observed_at).getUTCHours() === hr) count += 1;
    }
    for (const c of asset.communications) {
      if (new Date(c.last_seen_at).getUTCHours() === hr) count += c.connection_count;
    }
    return count;
  });
  const maxHourlyCount = Math.max(1, ...hourlyActivity);

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
    <div className="space-y-6">
      <PageHeader
        title={asset.name || asset.model || asset.hostname || asset.ip_address || t("Cihaz Detayı", "Device Detail")}
        subtitle={`${ASSET_TYPE_LABEL[asset.asset_type]} · ${
          asset.vendor || t("Üretici doğrulanmadı", "Unverified vendor")
        } · ${asset.purdue_level ?? "Purdue L1/L2"}`}
        breadcrumb={t("Cihaz Detayı", "Device Detail")}
        actions={
          <>
            <Link to="/assets">
              <Button variant="secondary">{t("← Envantere Dön", "← Back to Inventory")}</Button>
            </Link>
            <Button
              variant={activeTab === "edit" ? "dark" : "primary"}
              onClick={() => setActiveTab(activeTab === "edit" ? "overview" : "edit")}
            >
              {activeTab === "edit"
                ? t("Özete Dön", "Back to Overview")
                : t("Bilgileri Düzenle / Doğrula", "Edit / Verify Asset")}
            </Button>
          </>
        }
      />

      {/* Endüstriyel Donanım Şasisi & Ön Panel Dijital İkizi (Hardware Digital Twin) */}
      <DeviceHardwareChassisCard
        name={asset.name || asset.model || asset.hostname || asset.ip_address || t("Endüstriyel Cihaz", "Industrial Device")}
        ip={asset.ip_address}
        mac={asset.mac_address}
        assetType={asset.asset_type}
        vendor={asset.vendor}
        model={asset.model}
        firmware={asset.firmware_version}
        serial={asset.serial_number}
        purdueLevel={asset.purdue_level}
        isVerified={asset.is_verified}
        criticality={asset.criticality}
        protocols={asset.observed_protocols ?? []}
        activePorts={activePorts}
      />

      {/* TailAdmin 4 Sütunlu Cihaz Telemetri KPI Kartları */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("Sınıflandırma Güveni", "Classification Confidence")}
          value={`%${Math.round(asset.confidence * 100)}`}
          badge={asset.is_verified ? t("Doğrulandı", "Verified") : t("Doğrulanmadı", "Unverified")}
          badgeTone={asset.is_verified ? "emerald" : "amber"}
          subtext={ASSET_TYPE_LABEL[asset.asset_type]}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />

        <StatCard
          label={t("En Yüksek Risk Puanı", "Highest Risk Score")}
          value={`${maxRiskScore}/100`}
          badge={t(`${openFindings.length} Açık Bulgu`, `${openFindings.length} Open Findings`)}
          badgeTone={maxRiskScore >= 50 ? "red" : maxRiskScore > 0 ? "amber" : "teal"}
          subtext={`${t("Kritiklik", "Criticality")}: ${CRITICALITY_LABEL[asset.criticality]}`}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          }
        />

        <StatCard
          label={t("Gözlemlenen İletişim Akışı", "Observed Network Flows")}
          value={asset.communications.length}
          badge={t(`${totalConnections} Bağlantı`, `${totalConnections} Connections`)}
          badgeTone="teal"
          subtext={t(
            `${outboundFlows.length} giden · ${inboundFlows.length} gelen`,
            `${outboundFlows.length} outbound · ${inboundFlows.length} inbound`,
          )}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="12" cy="18" r="3" />
              <path d="M8.5 7.5L10.5 15.5M15.5 7.5L13.5 15.5" />
            </svg>
          }
        />

        <StatCard
          label={t("Pasif Gözlem Kayıtları", "Passive Observations")}
          value={asset.observations.length}
          badge={t(
            `${(asset.observed_protocols ?? []).length} Protokol`,
            `${(asset.observed_protocols ?? []).length} Protocols`,
          )}
          badgeTone="teal"
          subtext={formatDate(asset.last_seen_at)}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        />
      </div>

      {/* 3 Sütunlu Donanım, Ağ ve Kanıt Kimlik Kartları */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card
          className="lg:col-span-4"
          title={t("Kanıta Dayalı Sınıflandırma", "Evidence-Based Classification")}
          subtitle={t("Pasif trafik ve protokol kanıtları", "Passive traffic and protocol evidence")}
        >
          <div className="space-y-3 text-xs">
            <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="font-semibold text-[#1C2434]">{asset.classification_label}</div>
              <div className="mt-0.5 text-[#64748B]">{asset.vendor_status_label}</div>
            </div>
            <ul className="list-disc space-y-1.5 pl-4 text-[#64748B]">
              {asset.classification_reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <div className="border-t border-[#E2E8F0] pt-2.5">
              <div className="mb-1.5 text-[11px] font-semibold text-[#64748B] uppercase">
                {t("Gözlemlenen Protokoller", "Observed Protocols")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {asset.observed_protocols && asset.observed_protocols.length > 0 ? (
                  asset.observed_protocols.map((p) => <ProtocolBadge key={p} protocol={p} />)
                ) : (
                  <span className="text-[#64748B]">
                    {t("Uygulama katmanı protokolü gözlenmedi", "No application-layer protocol observed")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card
          className="lg:col-span-4"
          title={t("Donanım ve Yazılım Kimliği", "Hardware & Software Identity")}
          subtitle={t("Üretici, model ve firmware özellikleri", "Vendor, model and firmware attributes")}
        >
          <dl className="divide-y divide-[#E2E8F0] text-xs">
            <div className="flex items-center justify-between py-2 first:pt-0">
              <dt className="font-medium text-[#64748B]">{t("Cihaz Türü", "Device Type")}</dt>
              <dd className="font-semibold text-[#1C2434]">{ASSET_TYPE_LABEL[asset.asset_type]}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">{t("Üretici", "Vendor")}</dt>
              <dd className="font-semibold text-[#1C2434]">
                {asset.vendor || t("Doğrulanmadı", "Unverified")}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">{t("Model / Ürün", "Model / Product")}</dt>
              <dd className="font-semibold text-[#1C2434]">{asset.model || "—"}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">{t("Seri Numarası", "Serial Number")}</dt>
              <dd className="font-mono text-[#1C2434]">{asset.serial_number || "—"}</dd>
            </div>
            <div className="flex items-center justify-between py-2 last:pb-0">
              <dt className="font-medium text-[#64748B]">{t("Firmware Sürümü", "Firmware Version")}</dt>
              <dd className="font-mono font-semibold text-[#0F766E]">{asset.firmware_version || "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card
          className="lg:col-span-4"
          title={t("Ağ Konumu ve Yaşam Döngüsü", "Network Location & Lifecycle")}
          subtitle={t("Adresleme, bölge ve gözlem zamanları", "Addressing, zone and observation timestamps")}
        >
          <dl className="divide-y divide-[#E2E8F0] text-xs">
            <div className="flex items-center justify-between py-2 first:pt-0">
              <dt className="font-medium text-[#64748B]">{t("IP Adresi", "IP Address")}</dt>
              <dd className="font-mono font-bold text-[#1C2434]">{asset.ip_address ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">{t("MAC Adresi", "MAC Address")}</dt>
              <dd className="font-mono text-[#1C2434]">{asset.mac_address ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">{t("Fabrika / Bölge", "Site / Zone")}</dt>
              <dd className="text-[#1C2434]">
                {site?.name ?? "—"} / {currentZone?.name ?? t("Atanmadı", "Unassigned")}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">{t("Gözlemleyen Sensör", "Observing Sensor")}</dt>
              <dd className="font-mono text-[#1C2434]">
                {captureSensor?.name ?? t("Pasif Zeek Sensörü", "Passive Zeek Sensor")}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2 last:pb-0">
              <dt className="font-medium text-[#64748B]">{t("İlk / Son Görülme", "First / Last Seen")}</dt>
              <dd className="font-mono text-[11px] text-[#64748B]">
                {formatDate(asset.first_seen_at)} → {formatDate(asset.last_seen_at)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Sekmeli Detay Görünümü */}
      <Card noPadding>
        <div className="flex flex-wrap items-center gap-1 border-b border-[#E2E8F0] bg-[#F7F9FC] px-5 pt-2.5 text-xs">
          {(
            [
              { id: "overview", label: t("Genel Telemetri & Risk Kırılımı", "Telemetry & Risk Breakdown") },
              {
                id: "risks",
                label: t(
                  `Risk Bulguları (${asset.risk_findings.length})`,
                  `Risk Findings (${asset.risk_findings.length})`,
                ),
              },
              {
                id: "communications",
                label: t(
                  `Ağ İletişimleri (${asset.communications.length})`,
                  `Network Flows (${asset.communications.length})`,
                ),
              },
              {
                id: "observations",
                label: t(
                  `Pasif Gözlemler (${asset.observations.length})`,
                  `Passive Observations (${asset.observations.length})`,
                ),
              },
              {
                id: "identifiers",
                label: t(
                  `IP/MAC Geçmişi (${asset.identifiers.length})`,
                  `IP/MAC History (${asset.identifiers.length})`,
                ),
              },
              { id: "edit", label: t("Envanter Bilgilerini Düzenle", "Edit Inventory Attributes") },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-t-[4px] border-b-2 px-3.5 py-2.5 font-semibold transition ${
                activeTab === tab.id
                  ? "border-[#0D9488] bg-white text-[#0D9488]"
                  : "border-transparent text-[#64748B] hover:text-[#1C2434]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Sol: 100 Puanlık Açıklanabilir Risk Kırılımı */}
              <div className="rounded-[4px] border border-[#E2E8F0] p-4 lg:col-span-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#1C2434]">
                    {t("Açıklanabilir Risk Puanı Kırılımı", "Explainable Risk Score Breakdown")}
                  </h3>
                  <Badge variant={maxRiskScore >= 50 ? "danger" : "teal"}>
                    {t(`Toplam: ${maxRiskScore}/100`, `Total: ${maxRiskScore}/100`)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[#64748B]">
                  {topFinding
                    ? `${t("En yüksek bulgu", "Top finding")}: ${topFinding.title}`
                    : t("100 puanlık deterministik ağırlık modeli.", "100-point deterministic weighting model.")}
                </p>

                <div className="mt-4 space-y-3">
                  {riskBreakdownSegments.map((seg) => {
                    const pts = breakdown[seg.key] ?? 0;
                    const pct = Math.min(100, Math.round((pts / seg.max) * 100));
                    return (
                      <div key={seg.key}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#1C2434]">{seg.label}</span>
                          <span className="font-mono font-bold text-[#1C2434]">
                            +{pts} {t("puan", "pts")}
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-[#F1F5F9]">
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: seg.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sağ: 24 Saatlik Pasif Gözlem ve Trafik Aktivite Dağılımı (Orantılı Bar Yüksekliği) */}
              <div className="rounded-[4px] border border-[#E2E8F0] p-4 lg:col-span-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#1C2434]">
                    {t("Saatlik Pasif Trafik Yoğunluğu (UTC)", "Hourly Passive Traffic Intensity (UTC)")}
                  </h3>
                  <Badge variant="mono">
                    {t(`Tepe: ${maxHourlyCount} olay`, `Peak: ${maxHourlyCount} events`)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[#64748B]">
                  {t(
                    "Pasif ağ gözlemlerinin ve bağlantı oturumlarının 24 saatlik orantılı dağılımı.",
                    "24-hour proportional distribution of passive observations and connection sessions.",
                  )}
                </p>

                <div className="mt-5 grid grid-cols-12 gap-1.5 sm:grid-cols-24">
                  {hourlyActivity.map((cnt, hr) => {
                    const heightPct = cnt > 0 ? Math.max(18, Math.round((cnt / maxHourlyCount) * 100)) : 0;
                    return (
                      <div key={hr} className="flex flex-col items-center gap-1">
                        <div
                          title={`${String(hr).padStart(2, "0")}:00 UTC — ${cnt} ${t("kayıt/bağlantı", "events/conns")}`}
                          className="flex h-20 w-full items-end rounded-[2px] border border-[#E2E8F0] bg-[#F8FAFC] p-0.5"
                        >
                          {cnt > 0 && (
                            <div
                              className={`w-full rounded-[1px] ${
                                cnt === maxHourlyCount ? "bg-[#0D9488]" : "bg-teal-400/80"
                              }`}
                              style={{ height: `${heightPct}%` }}
                            />
                          )}
                        </div>
                        <span className="font-mono text-[9px] text-[#64748B]">
                          {String(hr).padStart(2, "0")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "risks" && (
            <div>
              {asset.risk_findings.length === 0 ? (
                <Empty>{t("Bu cihaz için kayıtlı risk bulgusu yok.", "No risk findings recorded for this device.")}</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[#64748B] uppercase">
                      <tr>
                        <th className="px-4 py-2.5">{t("Başlık", "Title")}</th>
                        <th className="px-4 py-2.5">{t("Kural", "Rule")}</th>
                        <th className="px-4 py-2.5">{t("Seviye / Puan", "Severity / Score")}</th>
                        <th className="px-4 py-2.5">{t("Güven", "Confidence")}</th>
                        <th className="px-4 py-2.5">{t("Durum", "Status")}</th>
                        <th className="px-4 py-2.5">{t("Önerilen Aksiyon", "Recommended Action")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {asset.risk_findings.map((rf) => (
                        <tr key={rf.id} className="hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3 font-semibold text-[#1C2434]">
                            <Link to="/risks" className="text-[#0D9488] hover:underline">
                              {rf.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-mono text-[#1C2434]">{rf.rule_key}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <CriticalityBadge value={rf.severity} />{" "}
                            <span className="ml-1 font-mono font-bold">{rf.score}/100</span>
                          </td>
                          <td className="px-4 py-3 font-mono">%{Math.round(rf.confidence * 100)}</td>
                          <td className="px-4 py-3">
                            <Badge variant={rf.status === "open" ? "warning" : "default"}>{rf.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-[#64748B]">{rf.recommendation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "communications" && (
            <div>
              {asset.communications.length === 0 ? (
                <Empty>
                  {t(
                    "Bu cihaz için henüz iletişim akışı gözlemlenmedi.",
                    "No network flows observed for this device yet.",
                  )}
                </Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[#64748B] uppercase">
                      <tr>
                        <th className="px-4 py-2.5">{t("Yön", "Direction")}</th>
                        <th className="px-4 py-2.5">{t("Karşı Cihaz", "Peer Device")}</th>
                        <th className="px-4 py-2.5">{t("Protokol / Port", "Protocol / Port")}</th>
                        <th className="px-4 py-2.5">{t("Kanıt Güveni", "Confidence")}</th>
                        <th className="px-4 py-2.5">Baseline</th>
                        <th className="px-4 py-2.5">{t("Bağlantı Sayısı", "Connections")}</th>
                        <th className="px-4 py-2.5">{t("Son Görülme", "Last Seen")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {asset.communications.map((c) => (
                        <tr key={c.id} className="hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3 font-semibold whitespace-nowrap text-[#1C2434]">
                            {c.direction === "outbound" ? t("→ Giden", "→ Outbound") : t("← Gelen", "← Inbound")}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/assets/${c.peer_asset_id}`}
                              className="font-mono font-semibold text-[#0D9488] hover:underline"
                            >
                              {c.peer_ip ?? c.peer_asset_id.slice(0, 8)}
                            </Link>
                            {c.peer_name && <span className="ml-2 text-[#64748B]">({c.peer_name})</span>}
                          </td>
                          <td className="px-4 py-3 font-mono whitespace-nowrap">
                            <ProtocolBadge protocol={c.protocol} confidence={c.protocol_confidence} />
                            {c.target_port !== null && <span className="ml-1.5 text-[#64748B]">:{c.target_port}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={c.protocol_confidence === "observed" ? "teal" : "warning"}>
                              {c.protocol_confidence === "observed"
                                ? t("DPI / Zeek Doğrulandı", "DPI / Zeek Verified")
                                : c.protocol_confidence === "port_hint"
                                  ? t("Port Tahmini", "Port Hint")
                                  : t("Taşıma", "Transport")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={c.is_baseline_approved ? "success" : "warning"}>
                              {c.is_baseline_approved
                                ? t("✓ Onaylı Baseline", "✓ Baseline Approved")
                                : t("İnceleme Bekliyor", "Pending Review")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-[#1C2434]">{c.connection_count}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#64748B]">{formatDate(c.last_seen_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "observations" && (
            <div>
              {asset.observations.length === 0 ? (
                <Empty>{t("Pasif gözlem kaydı yok.", "No passive observation records.")}</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[#64748B] uppercase">
                      <tr>
                        <th className="px-4 py-2.5">{t("Zaman", "Timestamp")}</th>
                        <th className="px-4 py-2.5">{t("Kaynak", "Source")}</th>
                        <th className="px-4 py-2.5">{t("Gözlem Özeti & Kanıt", "Observation Summary & Evidence")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {asset.observations.map((o) => {
                        const funcs = Array.isArray(o.evidence.modbus_functions)
                          ? (o.evidence.modbus_functions as string[])
                          : [];
                        const msgs = Array.isArray(o.evidence.protocol_messages)
                          ? (o.evidence.protocol_messages as string[])
                          : [];
                        return (
                          <tr key={o.id} className="hover:bg-[#F8FAFC]">
                            <td className="px-4 py-3 whitespace-nowrap text-[#64748B]">
                              {formatDate(o.observed_at)}
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold text-[#1C2434]">{o.source}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {funcs.map((fn) => (
                                  <Badge key={fn} variant="warning">
                                    Modbus: {fn}
                                  </Badge>
                                ))}
                                {msgs.map((m) => (
                                  <Badge key={m} variant="teal">
                                    DPI: {m}
                                  </Badge>
                                ))}
                                <Badge variant="mono">
                                  {t("Güven", "Confidence")}: %{Math.round(o.confidence * 100)}
                                </Badge>
                              </div>
                              <details className="mt-1.5">
                                <summary className="cursor-pointer text-[11px] font-medium text-[#0D9488] hover:underline">
                                  {t("Teknik kanıtı göster", "Show technical evidence")}
                                </summary>
                                <pre className="mt-1.5 max-h-36 overflow-auto rounded-[4px] bg-[#1C2434] p-2.5 font-mono text-[11px] text-slate-100">
                                  {JSON.stringify(o.evidence, null, 2)}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "identifiers" && (
            <div>
              {asset.identifiers.length === 0 ? (
                <Empty>{t("Kayıt yok.", "No records.")}</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[#64748B] uppercase">
                      <tr>
                        <th className="px-4 py-2.5">{t("Kimlik Türü", "Identifier Type")}</th>
                        <th className="px-4 py-2.5">{t("Değer", "Value")}</th>
                        <th className="px-4 py-2.5">{t("İlk Görülme", "First Seen")}</th>
                        <th className="px-4 py-2.5">{t("Son Görülme", "Last Seen")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {asset.identifiers.map((idItem) => (
                        <tr key={idItem.id}>
                          <td className="px-4 py-3 text-[#64748B] uppercase">{idItem.identifier_type}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-[#1C2434]">
                            {idItem.identifier_value}
                          </td>
                          <td className="px-4 py-3 text-[#64748B]">{formatDate(idItem.first_seen_at)}</td>
                          <td className="px-4 py-3 text-[#64748B]">{formatDate(idItem.last_seen_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "edit" && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("Cihaz Adı", "Device Name")}>
                  <Input
                    disabled={!canEditAssets}
                    placeholder={t("Örn: Paketleme Ana PLC", "e.g. Packaging Main PLC")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label={t("Cihaz Türü", "Device Type")}>
                  <Select
                    disabled={!canEditAssets}
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value as AssetType)}
                  >
                    {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((typeKey) => (
                      <option key={typeKey} value={typeKey}>
                        {ASSET_TYPE_LABEL[typeKey]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("Üretici", "Vendor")}>
                  <Input
                    disabled={!canEditAssets}
                    placeholder="Siemens, Rockwell, Schneider…"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                  />
                </Field>
                <Field label={t("Model", "Model")}>
                  <Input
                    disabled={!canEditAssets}
                    placeholder="S7-1515-2 PN"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </Field>
                <Field label={t("Seri Numarası", "Serial Number")}>
                  <Input
                    disabled={!canEditAssets}
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                  />
                </Field>
                <Field label={t("Firmware Sürümü", "Firmware Version")}>
                  <Input
                    disabled={!canEditAssets}
                    placeholder="V2.9.4"
                    value={firmware}
                    onChange={(e) => setFirmware(e.target.value)}
                  />
                </Field>
                <Field label={t("Üretim Hattı / Bölge", "Production Line / Zone")}>
                  <Select disabled={!canEditAssets} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                    <option value="">{t("Atanmadı", "Unassigned")}</option>
                    {siteZones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("Kritiklik", "Criticality")}>
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

              <label className="flex items-center gap-2 pt-1 text-xs font-medium text-[#1C2434]">
                <input
                  type="checkbox"
                  disabled={!canEditAssets}
                  checked={isVerified}
                  onChange={(e) => setIsVerified(e.target.checked)}
                />
                {t(
                  "Cihaz türünü, üreticisini ve sahipliğini teknik ekip olarak doğruladım",
                  "I have verified the device type, vendor and ownership as part of the engineering team",
                )}
              </label>

              <ErrorBox error={updateMut.error} />
              {savedNotice && (
                <div className="rounded-[4px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  {t(
                    "Değişiklikler kaydedildi ve denetim kaydına işlendi.",
                    "Changes saved and recorded in the audit log.",
                  )}
                </div>
              )}

              {canEditAssets && (
                <Button type="submit" disabled={updateMut.isPending}>
                  {updateMut.isPending
                    ? t("Kaydediliyor…", "Saving…")
                    : t("Değişiklikleri Kaydet", "Save Changes")}
                </Button>
              )}
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
