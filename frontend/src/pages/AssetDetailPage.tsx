import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
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
import { api } from "../services/api";
import type { AssetDetail, AssetType, Criticality, Sensor, Site, Zone } from "../types/api";

type DetailTab = "overview" | "risks" | "communications" | "observations" | "identifiers" | "edit";

const RISK_BREAKDOWN_SEGMENTS = [
  { key: "production_criticality", label: "Üretim Kritikliği (Maks 30)", color: "#E11D48" },
  { key: "network_exposure", label: "Ağ Maruziyeti (Maks 25)", color: "#0D9488" },
  { key: "verified_vulnerability", label: "Doğrulanmış Zafiyet (Maks 25)", color: "#D97706" },
  { key: "unexpected_behavior", label: "Beklenmeyen İletişim (Maks 10)", color: "#0284C7" },
  { key: "inventory_gap", label: "Envanter Eksikliği (Maks 10)", color: "#64748B" },
];

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeOrg, canEditAssets } = useAuth();
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

  if (assetQuery.isLoading) return <Empty>Cihaz bilgileri yükleniyor…</Empty>;
  if (assetQuery.error || !asset) return <ErrorBox error={assetQuery.error ?? "Cihaz bulunamadı"} />;

  const site = (sitesQuery.data ?? []).find((s) => s.id === asset.site_id);
  const siteZones = (zonesQuery.data ?? []).filter((z) => z.site_id === asset.site_id);
  const currentZone = (zonesQuery.data ?? []).find((z) => z.id === asset.zone_id);
  const captureSensor = (sensorsQuery.data ?? []).find((s) => s.id === asset.last_sensor_id);

  const outboundFlows = asset.communications.filter((c) => c.direction === "outbound");
  const inboundFlows = asset.communications.filter((c) => c.direction === "inbound");
  const totalConnections = asset.communications.reduce((acc, c) => acc + c.connection_count, 0);

  const openFindings = asset.risk_findings.filter(
    (f) => f.status === "open" || f.status === "investigating",
  );
  const topFinding =
    [...openFindings].sort((a, b) => b.score - a.score)[0] ??
    [...asset.risk_findings].sort((a, b) => b.score - a.score)[0] ??
    null;
  const maxRiskScore = topFinding?.score ?? 0;
  const breakdown = topFinding?.evidence?.score_breakdown ?? {};

  // Gerçek gözlem saatlerinden 24 saatlik aktivite dağılımı
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
        title={asset.name || asset.model || asset.hostname || asset.ip_address || "Cihaz Detayı"}
        subtitle={`${asset.classification_label} · ${asset.vendor_status_label} · ${asset.purdue_level ?? "Purdue L1/L2"}`}
        breadcrumb="Device Detail"
        actions={
          <>
            <Link to="/assets">
              <Button variant="secondary">← Envantere Dön</Button>
            </Link>
            <Button
              variant={activeTab === "edit" ? "dark" : "primary"}
              onClick={() => setActiveTab(activeTab === "edit" ? "overview" : "edit")}
            >
              {activeTab === "edit" ? "Özete Dön" : "Bilgileri Düzenle / Doğrula"}
            </Button>
          </>
        }
      />

      {/* TailAdmin 4 Sütunlu Cihaz Telemetri KPI Kartları */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Kimlik Doğrulama & Güven"
          value={`%${Math.round(asset.confidence * 100)}`}
          badge={asset.is_verified ? "Doğrulandı" : "Doğrulanmadı"}
          badgeTone={asset.is_verified ? "emerald" : "amber"}
          subtext={ASSET_TYPE_LABEL[asset.asset_type]}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />

        <StatCard
          label="En Yüksek Risk Puanı"
          value={`${maxRiskScore} / 100`}
          badge={`${openFindings.length} Açık Bulgu`}
          badgeTone={maxRiskScore >= 50 ? "red" : maxRiskScore > 0 ? "amber" : "teal"}
          subtext={`Kritiklik: ${CRITICALITY_LABEL[asset.criticality]}`}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          }
        />

        <StatCard
          label="Gözlemlenen İletişim Akışı"
          value={asset.communications.length}
          badge={`${totalConnections} Bağlantı`}
          badgeTone="teal"
          subtext={`${outboundFlows.length} giden · ${inboundFlows.length} gelen`}
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
          label="Pasif Gözlem Kayıtları"
          value={asset.observations.length}
          badge={`${(asset.observed_protocols ?? []).length} Protokol`}
          badgeTone="teal"
          subtext={`Son: ${formatDate(asset.last_seen_at)}`}
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
          title="Kanıta Dayalı Sınıflandırma"
          subtitle="Pasif trafik ve protokol kanıtları"
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
                Doğrulanmış Protokoller
              </div>
              <div className="flex flex-wrap gap-1.5">
                {asset.observed_protocols && asset.observed_protocols.length > 0 ? (
                  asset.observed_protocols.map((p) => <ProtocolBadge key={p} protocol={p} />)
                ) : (
                  <span className="text-[#64748B]">Doğrulanmış uygulama katmanı protokolü yok</span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card
          className="lg:col-span-4"
          title="Donanım ve Yazılım Kimliği"
          subtitle="Üretici, model ve firmware özellikleri"
        >
          <dl className="divide-y divide-[#E2E8F0] text-xs">
            <div className="flex items-center justify-between py-2 first:pt-0">
              <dt className="font-medium text-[#64748B]">Cihaz Türü</dt>
              <dd className="font-semibold text-[#1C2434]">{ASSET_TYPE_LABEL[asset.asset_type]}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">Üretici (Vendor)</dt>
              <dd className="font-semibold text-[#1C2434]">{asset.vendor || "Doğrulanmadı"}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">Model / Ürün</dt>
              <dd className="font-semibold text-[#1C2434]">{asset.model || "—"}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">Seri Numarası</dt>
              <dd className="font-mono text-[#1C2434]">{asset.serial_number || "—"}</dd>
            </div>
            <div className="flex items-center justify-between py-2 last:pb-0">
              <dt className="font-medium text-[#64748B]">Firmware Sürümü</dt>
              <dd className="font-mono font-semibold text-[#0F766E]">{asset.firmware_version || "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card
          className="lg:col-span-4"
          title="Ağ Konumu ve Yaşam Döngüsü"
          subtitle="Adresleme, bölge ve gözlem zamanları"
        >
          <dl className="divide-y divide-[#E2E8F0] text-xs">
            <div className="flex items-center justify-between py-2 first:pt-0">
              <dt className="font-medium text-[#64748B]">IP Adresi</dt>
              <dd className="font-mono font-bold text-[#1C2434]">{asset.ip_address ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">MAC Adresi</dt>
              <dd className="font-mono text-[#1C2434]">{asset.mac_address ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">Fabrika / Bölge</dt>
              <dd className="text-[#1C2434]">
                {site?.name ?? "—"} / {currentZone?.name ?? "Atanmadı"}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-medium text-[#64748B]">Gözlemleyen Sensör</dt>
              <dd className="font-mono text-[#1C2434]">{captureSensor?.name ?? "Pasif Zeek Sensörü"}</dd>
            </div>
            <div className="flex items-center justify-between py-2 last:pb-0">
              <dt className="font-medium text-[#64748B]">İlk / Son Görülme</dt>
              <dd className="font-mono text-[11px] text-[#64748B]">
                {formatDate(asset.first_seen_at)} → {formatDate(asset.last_seen_at)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* shadcn/ui + TailAdmin Sekmeli Detay Görünümü */}
      <Card noPadding>
        <div className="flex flex-wrap items-center gap-1 border-b border-[#E2E8F0] bg-[#F7F9FC] px-5 pt-2.5 text-xs">
          {(
            [
              { id: "overview", label: "Genel Telemetri & Risk Kırılımı" },
              { id: "risks", label: `Risk Bulguları (${asset.risk_findings.length})` },
              { id: "communications", label: `Ağ İletişimleri (${asset.communications.length})` },
              { id: "observations", label: `Pasif Gözlemler (${asset.observations.length})` },
              { id: "identifiers", label: `IP/MAC Geçmişi (${asset.identifiers.length})` },
              { id: "edit", label: "Envanter Bilgilerini Düzenle" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`rounded-t-[4px] border-b-2 px-3.5 py-2.5 font-semibold transition ${
                activeTab === t.id
                  ? "border-[#0D9488] bg-white text-[#0D9488]"
                  : "border-transparent text-[#64748B] hover:text-[#1C2434]"
              }`}
            >
              {t.label}
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
                    Açıklanabilir Risk Puanı Kırılımı (100 Puanlık Model)
                  </h3>
                  <Badge variant={maxRiskScore >= 50 ? "danger" : "teal"}>
                    Toplam: {maxRiskScore}/100
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[#64748B]">
                  {topFinding
                    ? `En yüksek bulgu: ${topFinding.title} (${topFinding.rule_key})`
                    : "Bu cihaz için aktif risk puanı kırılımı."}
                </p>

                <div className="mt-4 space-y-3">
                  {RISK_BREAKDOWN_SEGMENTS.map((seg) => {
                    const pts = breakdown[seg.key] ?? 0;
                    const maxPts = seg.key === "production_criticality" ? 30 : seg.key.includes("unexpected") || seg.key.includes("inventory") ? 10 : 25;
                    const pct = Math.min(100, Math.round((pts / maxPts) * 100));
                    return (
                      <div key={seg.key}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#1C2434]">{seg.label}</span>
                          <span className="font-mono font-bold text-[#1C2434]">+{pts} puan</span>
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

              {/* Sağ: 24 Saatlik Pasif Gözlem ve Trafik Aktivite Dağılımı */}
              <div className="rounded-[4px] border border-[#E2E8F0] p-4 lg:col-span-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#1C2434]">
                    Saatlik Pasif Trafik ve Gözlem Yoğunluğu (UTC)
                  </h3>
                  <Badge variant="mono">{totalConnections} bağlantı</Badge>
                </div>
                <p className="mt-1 text-xs text-[#64748B]">
                  Gerçek gözlem (`asset_observations`) ve iletişim (`asset_communications`) zaman damgalarına göre
                  24 saatlik dağılım.
                </p>

                <div className="mt-5 grid grid-cols-12 gap-1.5 sm:grid-cols-24">
                  {hourlyActivity.map((cnt, hr) => (
                    <div key={hr} className="flex flex-col items-center gap-1">
                      <div
                        title={`${String(hr).padStart(2, "0")}:00 UTC — ${cnt} kayıt/bağlantı`}
                        className={`h-16 w-full rounded-[2px] border ${
                          cnt > 10
                            ? "border-teal-700 bg-[#0D9488]"
                            : cnt > 0
                              ? "border-teal-300 bg-teal-400/70"
                              : "border-[#E2E8F0] bg-[#F8FAFC]"
                        }`}
                      />
                      <span className="font-mono text-[9px] text-[#64748B]">
                        {String(hr).padStart(2, "0")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "risks" && (
            <div>
              {asset.risk_findings.length === 0 ? (
                <Empty>Bu cihaz için kayıtlı risk bulgusu yok.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] uppercase text-[#64748B]">
                      <tr>
                        <th className="px-4 py-2.5">Başlık</th>
                        <th className="px-4 py-2.5">Kural</th>
                        <th className="px-4 py-2.5">Seviye / Puan</th>
                        <th className="px-4 py-2.5">Güven</th>
                        <th className="px-4 py-2.5">Durum</th>
                        <th className="px-4 py-2.5">Önerilen Aksiyon</th>
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
                          <td className="px-4 py-3">
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
                <Empty>Bu cihaz için henüz iletişim akışı gözlemlenmedi.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] uppercase text-[#64748B]">
                      <tr>
                        <th className="px-4 py-2.5">Yön</th>
                        <th className="px-4 py-2.5">Karşı Cihaz</th>
                        <th className="px-4 py-2.5">Protokol / Port</th>
                        <th className="px-4 py-2.5">Kanıt Güveni</th>
                        <th className="px-4 py-2.5">Baseline</th>
                        <th className="px-4 py-2.5">Bağlantı Sayısı</th>
                        <th className="px-4 py-2.5">Son Görülme</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {asset.communications.map((c) => (
                        <tr key={c.id} className="hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3 font-semibold text-[#1C2434]">
                            {c.direction === "outbound" ? "→ Giden" : "← Gelen"}
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
                          <td className="px-4 py-3 font-mono">
                            <ProtocolBadge protocol={c.protocol} confidence={c.protocol_confidence} />
                            {c.target_port !== null && <span className="ml-1.5 text-[#64748B]">:{c.target_port}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={c.protocol_confidence === "observed" ? "teal" : "warning"}>
                              {c.protocol_confidence === "observed"
                                ? "Doğrulandı (DPI/Zeek)"
                                : c.protocol_confidence === "port_hint"
                                  ? "Port İpucu"
                                  : "Taşıma"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={c.is_baseline_approved ? "success" : "warning"}>
                              {c.is_baseline_approved ? "✓ Onaylı Baseline" : "İnceleme Bekliyor"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-[#1C2434]">{c.connection_count}</td>
                          <td className="px-4 py-3 text-[#64748B]">{formatDate(c.last_seen_at)}</td>
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
                <Empty>Pasif gözlem kaydı yok.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] uppercase text-[#64748B]">
                      <tr>
                        <th className="px-4 py-2.5">Zaman</th>
                        <th className="px-4 py-2.5">Kaynak</th>
                        <th className="px-4 py-2.5">Kanıt (Evidence)</th>
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
                              {funcs.length > 0 && (
                                <div className="mb-1 flex flex-wrap gap-1">
                                  {funcs.map((fn) => (
                                    <Badge key={fn} variant="warning">
                                      Modbus: {fn}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {msgs.length > 0 && (
                                <div className="mb-1 flex flex-wrap gap-1">
                                  {msgs.map((m) => (
                                    <Badge key={m} variant="teal">
                                      DPI: {m}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              <div className="font-mono text-[11px] text-[#64748B]">
                                {JSON.stringify(o.evidence)}
                              </div>
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
                <Empty>Kayıt yok.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] uppercase text-[#64748B]">
                      <tr>
                        <th className="px-4 py-2.5">Kimlik Türü</th>
                        <th className="px-4 py-2.5">Değer</th>
                        <th className="px-4 py-2.5">İlk Görülme</th>
                        <th className="px-4 py-2.5">Son Görülme</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {asset.identifiers.map((idItem) => (
                        <tr key={idItem.id}>
                          <td className="px-4 py-3 uppercase text-[#64748B]">{idItem.identifier_type}</td>
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

              <label className="flex items-center gap-2 pt-1 text-xs font-medium text-[#1C2434]">
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
                <div className="rounded-[4px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  Değişiklikler kaydedildi ve denetim kaydına (audit log) işlendi.
                </div>
              )}

              {canEditAssets && (
                <Button type="submit" disabled={updateMut.isPending}>
                  {updateMut.isPending ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
                </Button>
              )}
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
