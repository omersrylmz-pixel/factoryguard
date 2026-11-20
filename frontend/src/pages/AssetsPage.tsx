import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
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
import { api, apiDownload } from "../services/api";
import type {
  Asset,
  AssetBulkVerifyResult,
  AssetType,
  Criticality,
  CsvImportResult,
  Page,
  Site,
  Zone,
} from "../types/api";

export default function AssetsPage() {
  const { activeOrg, canEditAssets } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<"inventory" | "zones">("inventory");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [pageIdx, setPageIdx] = useState(1);

  // Filtreler
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [ip, setIp] = useState("");
  const [mac, setMac] = useState("");
  const [assetType, setAssetType] = useState("");
  const [vendor, setVendor] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [criticality, setCriticality] = useState("");
  const [verified, setVerified] = useState("");
  const [showFilters, setShowFilters] = useState(false);

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

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (ip.trim()) params.set("ip", ip.trim());
  if (mac.trim()) params.set("mac", mac.trim());
  if (assetType) params.set("asset_type", assetType);
  if (vendor.trim()) params.set("vendor", vendor.trim());
  if (zoneId) params.set("zone_id", zoneId);
  if (criticality) params.set("criticality", criticality);
  if (verified !== "") params.set("is_verified", verified);
  params.set("limit", "200");

  const assetsQuery = useQuery({
    queryKey: ["assets", activeOrg?.id, params.toString()],
    queryFn: () => api<Page<Asset>>(`/assets?${params.toString()}`),
    enabled: !!activeOrg,
  });

  // CSV İçe Aktarma
  const [showImport, setShowImport] = useState(false);
  const [importSiteId, setImportSiteId] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [bulkVerifyNotice, setBulkVerifyNotice] = useState<string | null>(null);

  const importMut = useMutation({
    mutationFn: (body: { site_id: string; csv_content: string }) =>
      api<CsvImportResult>("/assets/import", { method: "POST", body }),
    onSuccess: async (res) => {
      setImportResult(res);
      await qc.invalidateQueries({ queryKey: ["assets", activeOrg?.id] });
    },
  });

  const bulkVerifyMut = useMutation({
    mutationFn: (ids?: string[]) =>
      api<AssetBulkVerifyResult>("/assets/bulk-verify", {
        method: "POST",
        body: {
          ...(ids && ids.length > 0 ? { asset_ids: ids } : {}),
          ...(zoneId ? { zone_id: zoneId } : {}),
        },
      }),
    onSuccess: async (res) => {
      setBulkVerifyNotice(
        `${res.verified_count} cihaz doğrulandı ve ilgili NEW_ASSET risk bulguları otomatik çözüldü.`,
      );
      setSelectedIds([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["assets", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] }),
      ]);
    },
  });

  const sites = sitesQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const assets = assetsQuery.data?.items ?? [];
  const total = assetsQuery.data?.total ?? 0;
  const effectiveSiteId = importSiteId || sites[0]?.id || "";

  const verifiedCount = assets.filter((a) => a.is_verified).length;
  const unverifiedCount = assets.length - verifiedCount;
  const otDeviceCount = assets.filter(
    (a) => (a.observed_protocols ?? []).length > 0 || ["plc", "hmi", "scada_server"].includes(a.asset_type),
  ).length;
  const highCritAssets = assets.filter((a) => a.criticality === "critical" || a.criticality === "high").length;

  // Sayfalama
  const totalPages = Math.max(1, Math.ceil(assets.length / rowsPerPage));
  const safePage = Math.min(pageIdx, totalPages);
  const startOffset = (safePage - 1) * rowsPerPage;
  const pagedAssets = assets.slice(startOffset, startOffset + rowsPerPage);

  // Aktif filtre rozetleri
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (q.trim()) {
    activeFilterChips.push({
      key: "q",
      label: `Arama: "${q.trim()}"`,
      clear: () => {
        setQ("");
        setSearchParams({});
      },
    });
  }
  if (assetType) {
    activeFilterChips.push({
      key: "type",
      label: `Tür: ${ASSET_TYPE_LABEL[assetType]}`,
      clear: () => setAssetType(""),
    });
  }
  if (vendor.trim()) {
    activeFilterChips.push({
      key: "vendor",
      label: `Üretici: ${vendor.trim()}`,
      clear: () => setVendor(""),
    });
  }
  if (zoneId) {
    const zName = zones.find((z) => z.id === zoneId)?.name ?? zoneId;
    activeFilterChips.push({
      key: "zone",
      label: `Bölge: ${zName}`,
      clear: () => setZoneId(""),
    });
  }
  if (criticality) {
    activeFilterChips.push({
      key: "crit",
      label: `Kritiklik: ${CRITICALITY_LABEL[criticality as Criticality]}`,
      clear: () => setCriticality(""),
    });
  }
  if (verified !== "") {
    activeFilterChips.push({
      key: "ver",
      label: `Doğrulama: ${verified === "true" ? "Doğrulanmış" : "Doğrulanmamış"}`,
      clear: () => setVerified(""),
    });
  }

  function handleImport(e: FormEvent) {
    e.preventDefault();
    if (!effectiveSiteId || !csvContent.trim()) return;
    importMut.mutate({ site_id: effectiveSiteId, csv_content: csvContent });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Device Inventory"
        subtitle="Pasif trafik gözlemiyle keşfedilen veya CSV ile içe aktarılan merkezi endüstriyel cihaz envanteri"
        breadcrumb="Device Inventory"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void apiDownload("/reports/inventory?format=csv", "factoryguard-envanter.csv")}
            >
              ↓ CSV Dışa Aktar
            </Button>
            {canEditAssets && (
              <Button variant="primary" onClick={() => setShowImport((v) => !v)}>
                {showImport ? "İçe Aktarmayı Kapat" : "+ CSV Envanter İçe Aktar"}
              </Button>
            )}
          </>
        }
      />

      {/* TailAdmin 4 Sütunlu Envanter Özeti */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Toplam Envanter Varlığı"
          value={total}
          badge={`${sites.length} Fabrika`}
          badgeTone="teal"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="6" rx="1.5" />
              <rect x="2" y="14" width="20" height="6" rx="1.5" />
            </svg>
          }
        />
        <StatCard
          label="Endüstriyel OT Cihazı"
          value={otDeviceCount}
          badge="Modbus / S7 / ENIP"
          badgeTone="teal"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        />
        <StatCard
          label="Doğrulanmış Varlıklar"
          value={verifiedCount}
          badge={`%${total > 0 ? Math.round((verifiedCount / total) * 100) : 0} Tamamlandı`}
          badgeTone="emerald"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
        />
        <StatCard
          label="Doğrulama Bekleyen / Kritik"
          value={`${unverifiedCount} / ${highCritAssets}`}
          badge={unverifiedCount > 0 ? "İnceleme Gerekli" : "Tamamı Doğrulandı"}
          badgeTone={unverifiedCount > 0 ? "amber" : "teal"}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
        />
      </div>

      {showImport && canEditAssets && (
        <Card title="CSV ile Envanter İçe Aktar" subtitle="Mevcut fabrika varlık listesini toplu olarak içe aktarın">
          <form onSubmit={handleImport} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Hedef Fabrika *">
                <Select value={effectiveSiteId} onChange={(e) => setImportSiteId(e.target.value)}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="CSV Dosyası Seç">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="w-full text-xs text-[#64748B] file:mr-3 file:rounded-[4px] file:border-0 file:bg-[#F1F5F9] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#1C2434]"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) file.text().then((t) => setCsvContent(t));
                  }}
                />
              </Field>
            </div>
            <Field label="CSV İçeriği">
              <textarea
                rows={4}
                className="w-full rounded-[4px] border border-[#E2E8F0] p-2.5 font-mono text-xs focus:border-[#0D9488] focus:outline-none"
                placeholder={"name,ip_address,mac_address,hostname,asset_type,vendor,model,firmware_version,zone,criticality,is_verified\nPLC-01,192.168.10.20,00:11:22:33:44:20,plc01,plc,Siemens,S7-1500,V2.9,Üretim Hattı,high,true"}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
              />
            </Field>
            <ErrorBox error={importMut.error} />
            {importResult && (
              <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
                <div className="font-semibold text-[#1C2434]">
                  İşlenen: {importResult.processed_rows} · Yeni: {importResult.created} · Güncellenen:{" "}
                  {importResult.updated} · Hatalı: {importResult.errors.length}
                </div>
              </div>
            )}
            <Button type="submit" disabled={importMut.isPending || !csvContent.trim()}>
              {importMut.isPending ? "İçe Aktarılıyor…" : "CSV'yi İçe Aktar"}
            </Button>
          </form>
        </Card>
      )}

      {/* TailAdmin Envanter Tablo Kartı */}
      <Card noPadding>
        {/* Üst Sekme ve Filtre Araç Çubuğu */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("inventory")}
              className={`rounded-[4px] px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "inventory"
                  ? "bg-[#1C2434] text-white"
                  : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1C2434]"
              }`}
            >
              Cihaz Listesi ({total})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("zones")}
              className={`rounded-[4px] px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "zones"
                  ? "bg-[#1C2434] text-white"
                  : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1C2434]"
              }`}
            >
              Bölgeler & Purdue Katmanları ({zones.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-60">
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPageIdx(1);
                }}
                placeholder="IP, MAC, üretici, model ara..."
              />
            </div>
            <Button
              variant={showFilters ? "outline" : "secondary"}
              onClick={() => setShowFilters((v) => !v)}
            >
              Filtreler ({activeFilterChips.length}) ▾
            </Button>
            {canEditAssets && (
              <Button
                variant="secondary"
                disabled={bulkVerifyMut.isPending}
                onClick={() => bulkVerifyMut.mutate(selectedIds.length > 0 ? selectedIds : undefined)}
              >
                {bulkVerifyMut.isPending
                  ? "Doğrulanıyor…"
                  : selectedIds.length > 0
                    ? `✓ Seçili ${selectedIds.length} Cihazı Doğrula`
                    : "✓ Yerel Cihazları Toplu Doğrula"}
              </Button>
            )}
          </div>
        </div>

        {/* Açılır Detaylı Filtre Çekmecesi */}
        {showFilters && (
          <div className="grid grid-cols-1 gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="IP Adresi">
              <Input placeholder="192.168.10..." value={ip} onChange={(e) => setIp(e.target.value)} />
            </Field>
            <Field label="MAC Adresi">
              <Input placeholder="00:1b:1b..." value={mac} onChange={(e) => setMac(e.target.value)} />
            </Field>
            <Field label="Cihaz Türü">
              <Select value={assetType} onChange={(e) => setAssetType(e.target.value)}>
                <option value="">Tümü</option>
                {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Üretici">
              <Input placeholder="Siemens, Omron…" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </Field>
            <Field label="Bölge (Zone)">
              <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">Tümü</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Doğrulama">
              <Select value={verified} onChange={(e) => setVerified(e.target.value)}>
                <option value="">Tümü</option>
                <option value="true">Doğrulanmış</option>
                <option value="false">Doğrulanmamış</option>
              </Select>
            </Field>
          </div>
        )}

        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] bg-white px-5 py-2.5">
            {activeFilterChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-0.5 text-xs font-medium text-[#1C2434]"
              >
                <span>{chip.label}</span>
                <button
                  type="button"
                  onClick={chip.clear}
                  className="text-[#64748B] hover:text-[#1C2434]"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                setQ("");
                setIp("");
                setMac("");
                setAssetType("");
                setVendor("");
                setZoneId("");
                setCriticality("");
                setVerified("");
                setSearchParams({});
              }}
              className="text-xs font-semibold text-[#0D9488] hover:underline"
            >
              Filtreleri Temizle
            </button>
          </div>
        )}

        {bulkVerifyNotice && (
          <div className="mx-5 mt-3 rounded-[4px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            {bulkVerifyNotice}
          </div>
        )}

        <div className="px-5">
          <ErrorBox error={assetsQuery.error || bulkVerifyMut.error} />
        </div>

        {activeTab === "zones" ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {zones.map((z) => {
              const zAssets = assets.filter((a) => a.zone_id === z.id);
              return (
                <div
                  key={z.id}
                  className="flex flex-col justify-between rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-4"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#1C2434]">{z.name}</span>
                      <CriticalityBadge value={z.criticality} />
                    </div>
                    <p className="mt-1 text-xs text-[#64748B]">
                      {z.description || "Endüstriyel üretim bölgesi"}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-xs">
                    <span className="font-mono font-semibold text-[#1C2434]">{zAssets.length} cihaz</span>
                    <button
                      type="button"
                      onClick={() => {
                        setZoneId(z.id);
                        setActiveTab("inventory");
                      }}
                      className="font-semibold text-[#0D9488] hover:underline"
                    >
                      Bölgedeki Cihazları Gör →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : assetsQuery.isLoading ? (
          <Empty>Yükleniyor…</Empty>
        ) : assets.length === 0 ? (
          <Empty>Filtrelere uygun cihaz bulunamadı.</Empty>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold text-[#64748B] uppercase">
                  <tr>
                    <th className="w-8 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={pagedAssets.length > 0 && pagedAssets.every((a) => selectedIds.includes(a.id))}
                        onChange={(e) =>
                          setSelectedIds(e.target.checked ? pagedAssets.map((a) => a.id) : [])
                        }
                      />
                    </th>
                    <th className="px-4 py-3">Cihaz / Hostname</th>
                    <th className="px-4 py-3">IP & MAC Adresi</th>
                    <th className="px-4 py-3">Tür & Purdue Katmanı</th>
                    <th className="px-4 py-3">Kanıta Dayalı Sınıflandırma</th>
                    <th className="px-4 py-3">Üretici / Model / FW</th>
                    <th className="px-4 py-3">Bölge & Kritiklik</th>
                    <th className="px-4 py-3">Güven / Durum</th>
                    <th className="px-4 py-3">Son Görülme</th>
                    <th className="px-4 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {pagedAssets.map((a) => {
                    const zone = zones.find((z) => z.id === a.zone_id);
                    const isChecked = selectedIds.includes(a.id);
                    return (
                      <tr key={a.id} className="transition-colors hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(a.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/assets/${a.id}`}
                            className="font-semibold text-[#1C2434] hover:text-[#0D9488] hover:underline"
                          >
                            {a.name || a.model || a.hostname || a.ip_address || "İsimsiz Cihaz"}
                          </Link>
                          {a.hostname && <div className="font-mono text-[11px] text-[#64748B]">{a.hostname}</div>}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <div className="flex items-center gap-1.5 font-semibold text-[#1C2434]">
                            <span>{a.ip_address ?? "—"}</span>
                            {a.is_external && <Badge variant="danger">Dış Ağ</Badge>}
                          </div>
                          <div className="text-[11px] text-[#64748B]">{a.mac_address ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#1C2434]">{ASSET_TYPE_LABEL[a.asset_type]}</div>
                          <div className="text-[11px] text-[#64748B]">{a.purdue_level ?? "L1/L2"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#1C2434]">{a.classification_label}</div>
                          {a.observed_protocols && a.observed_protocols.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {a.observed_protocols.map((p) => (
                                <ProtocolBadge key={p} protocol={p} />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#1C2434]">{a.vendor || a.vendor_status_label}</div>
                          {(a.model || a.firmware_version) && (
                            <div className="font-mono text-[11px] text-[#64748B]">
                              {a.model ?? "—"} {a.firmware_version ? `(${a.firmware_version})` : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="mb-1 text-[#1C2434]">{zone?.name ?? "Atanmadı"}</div>
                          <CriticalityBadge value={a.criticality} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={a.is_verified ? "success" : "warning"}>
                            {a.is_verified ? "✓ Doğrulandı" : `Doğrulanmadı (%${Math.round(a.confidence * 100)})`}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#64748B]">
                          {formatDate(a.last_seen_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/assets/${a.id}`}>
                            <Button variant="secondary" size="sm">
                              Detay
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* TailAdmin Sayfalama Alt Çubuğu */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] bg-white px-5 py-3 text-xs text-[#64748B]">
              <div className="flex items-center gap-2">
                <span>Sayfa başına satır:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setPageIdx(1);
                  }}
                  className="rounded-[4px] border border-[#E2E8F0] px-2 py-1 text-xs text-[#1C2434]"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div>
                Toplam <strong className="text-[#1C2434]">{assets.length}</strong> kayıttan{" "}
                <strong className="text-[#1C2434]">
                  {assets.length === 0 ? 0 : startOffset + 1}–{Math.min(startOffset + rowsPerPage, assets.length)}
                </strong>{" "}
                arası gösteriliyor
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPageIdx((p) => Math.max(1, p - 1))}
                >
                  ‹ Önceki
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPageIdx((p) => Math.min(totalPages, p + 1))}
                >
                  Sonraki ›
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
