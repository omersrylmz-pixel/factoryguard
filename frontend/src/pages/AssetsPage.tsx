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
import { useLang } from "../i18n";
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
  const { t } = useLang();
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
        t(
          `${res.verified_count} cihaz doğrulandı ve ilgili yeni cihaz risk bulguları otomatik çözüldü.`,
          `${res.verified_count} devices verified and related new-asset risk findings resolved automatically.`,
        ),
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
      label: `${t("Arama", "Search")}: "${q.trim()}"`,
      clear: () => {
        setQ("");
        setSearchParams({});
      },
    });
  }
  if (assetType) {
    activeFilterChips.push({
      key: "type",
      label: `${t("Tür", "Type")}: ${ASSET_TYPE_LABEL[assetType as AssetType]}`,
      clear: () => setAssetType(""),
    });
  }
  if (vendor.trim()) {
    activeFilterChips.push({
      key: "vendor",
      label: `${t("Üretici", "Vendor")}: ${vendor.trim()}`,
      clear: () => setVendor(""),
    });
  }
  if (zoneId) {
    const zName = zones.find((z) => z.id === zoneId)?.name ?? zoneId;
    activeFilterChips.push({
      key: "zone",
      label: `${t("Bölge", "Zone")}: ${zName}`,
      clear: () => setZoneId(""),
    });
  }
  if (criticality) {
    activeFilterChips.push({
      key: "crit",
      label: `${t("Kritiklik", "Criticality")}: ${CRITICALITY_LABEL[criticality as Criticality]}`,
      clear: () => setCriticality(""),
    });
  }
  if (verified !== "") {
    activeFilterChips.push({
      key: "ver",
      label: `${t("Doğrulama", "Verification")}: ${
        verified === "true" ? t("Doğrulanmış", "Verified") : t("Doğrulanmamış", "Unverified")
      }`,
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

  function shortPurdue(raw?: string): string {
    if (!raw) return "L1/L2";
    const m = raw.match(/L\d(?:\s*\/\s*L\d)?/i);
    return m ? m[0].toUpperCase() : raw.split("-")[0]?.trim() ?? "L1/L2";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Cihaz Envanteri", "Device Inventory")}
        subtitle={t(
          "Pasif trafik gözlemiyle keşfedilen veya CSV ile içe aktarılan merkezi endüstriyel varlıklar",
          "Centralized industrial assets discovered via passive traffic or imported from CSV",
        )}
        breadcrumb={t("Cihaz Envanteri", "Device Inventory")}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void apiDownload("/reports/inventory?format=csv", "factoryguard-inventory.csv")}
            >
              {t("↓ CSV Dışa Aktar", "↓ Export CSV")}
            </Button>
            {canEditAssets && (
              <Button variant="primary" onClick={() => setShowImport((v) => !v)}>
                {showImport
                  ? t("İçe Aktarmayı Kapat", "Close Import")
                  : t("+ CSV Envanter İçe Aktar", "+ Import CSV Inventory")}
              </Button>
            )}
          </>
        }
      />

      {/* TailAdmin 4 Sütunlu Envanter Özeti (Tek sayı değeri, eşit yükseklik) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("Toplam Envanter Varlığı", "Total Inventory Assets")}
          value={total}
          badge={t(`${sites.length} Fabrika`, `${sites.length} Sites`)}
          badgeTone="teal"
          subtext={t(`${zones.length} güvenlik bölgesi`, `${zones.length} security zones`)}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="6" rx="1.5" />
              <rect x="2" y="14" width="20" height="6" rx="1.5" />
            </svg>
          }
        />
        <StatCard
          label={t("Endüstriyel OT Cihazı", "Industrial OT Devices")}
          value={otDeviceCount}
          badge={t("OT Protokolleri", "OT Protocols")}
          badgeTone="teal"
          subtext="Modbus · S7comm · ENIP · OPC UA"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        />
        <StatCard
          label={t("Doğrulanmış Varlıklar", "Verified Assets")}
          value={verifiedCount}
          badge={t(
            `%${total > 0 ? Math.round((verifiedCount / total) * 100) : 0} Tamamlandı`,
            `${total > 0 ? Math.round((verifiedCount / total) * 100) : 0}% Complete`,
          )}
          badgeTone="emerald"
          subtext={t("Envanter onayı tamamlananlar", "Confirmed in inventory baseline")}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
        />
        <StatCard
          label={t("Doğrulama Bekleyen", "Pending Verification")}
          value={unverifiedCount}
          badge={unverifiedCount > 0 ? t("İnceleme Gerekli", "Review Needed") : t("Tamamı Doğrulandı", "All Verified")}
          badgeTone={unverifiedCount > 0 ? "amber" : "teal"}
          subtext={t(`${highCritAssets} kritik / yüksek varlık`, `${highCritAssets} critical / high assets`)}
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
        <Card
          title={t("CSV ile Envanter İçe Aktar", "Import Inventory via CSV")}
          subtitle={t("Mevcut fabrika varlık listesini toplu olarak içe aktarın", "Bulk import your existing plant asset list")}
        >
          <form onSubmit={handleImport} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t("Hedef Fabrika *", "Target Site *")}>
                <Select value={effectiveSiteId} onChange={(e) => setImportSiteId(e.target.value)}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("CSV Dosyası Seç", "Select CSV File")}>
                <label className="flex h-9 cursor-pointer items-center justify-between rounded-[4px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 text-xs text-[#1C2434] hover:border-[#0D9488]">
                  <span className="truncate">
                    {csvContent
                      ? t("CSV içeriği yüklendi", "CSV content loaded")
                      : t("CSV dosyası seçin…", "Choose a CSV file…")}
                  </span>
                  <span className="ml-2 rounded bg-[#1C2434] px-2 py-0.5 text-[11px] font-medium text-white">
                    {t("Gözat", "Browse")}
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) file.text().then((txt) => setCsvContent(txt));
                    }}
                  />
                </label>
              </Field>
            </div>
            <Field label={t("CSV İçeriği", "CSV Content")}>
              <textarea
                rows={4}
                className="w-full rounded-[4px] border border-[#E2E8F0] p-2.5 font-mono text-xs focus:border-[#0D9488] focus:outline-none"
                placeholder={
                  "name,ip_address,mac_address,hostname,asset_type,vendor,model,firmware_version,zone,criticality,is_verified\nPLC-01,192.168.10.20,00:11:22:33:44:20,plc01,plc,Siemens,S7-1500,V2.9,Line-1,high,true"
                }
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
              />
            </Field>
            <ErrorBox error={importMut.error} />
            {importResult && (
              <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
                <div className="font-semibold text-[#1C2434]">
                  {t(
                    `İşlenen: ${importResult.processed_rows} · Yeni: ${importResult.created} · Güncellenen: ${importResult.updated} · Hatalı: ${importResult.errors.length}`,
                    `Processed: ${importResult.processed_rows} · Created: ${importResult.created} · Updated: ${importResult.updated} · Errors: ${importResult.errors.length}`,
                  )}
                </div>
              </div>
            )}
            <Button type="submit" disabled={importMut.isPending || !csvContent.trim()}>
              {importMut.isPending ? t("İçe Aktarılıyor…", "Importing…") : t("CSV'yi İçe Aktar", "Import CSV")}
            </Button>
          </form>
        </Card>
      )}

      {/* TailAdmin 7 Sütunlu Kompakt Envanter Tablo Kartı */}
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
              {t(`Cihaz Listesi (${total})`, `Device List (${total})`)}
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
              {t(`Bölgeler & Purdue (${zones.length})`, `Zones & Purdue (${zones.length})`)}
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
                placeholder={t("IP, MAC, üretici, model ara...", "Search IP, MAC, vendor, model...")}
              />
            </div>
            <Button
              variant={showFilters ? "outline" : "secondary"}
              onClick={() => setShowFilters((v) => !v)}
            >
              {t(`Filtreler (${activeFilterChips.length}) ▾`, `Filters (${activeFilterChips.length}) ▾`)}
            </Button>
            {canEditAssets && (
              <Button
                variant="secondary"
                disabled={bulkVerifyMut.isPending}
                onClick={() => bulkVerifyMut.mutate(selectedIds.length > 0 ? selectedIds : undefined)}
              >
                {bulkVerifyMut.isPending
                  ? t("Doğrulanıyor…", "Verifying…")
                  : selectedIds.length > 0
                    ? t(`✓ Seçili ${selectedIds.length} Cihazı Doğrula`, `✓ Verify ${selectedIds.length} Selected`)
                    : t("✓ Tümünü Toplu Doğrula", "✓ Bulk Verify All")}
              </Button>
            )}
          </div>
        </div>

        {/* Açılır Detaylı Filtre Çekmecesi */}
        {showFilters && (
          <div className="grid grid-cols-1 gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
            <Field label={t("IP Adresi", "IP Address")}>
              <Input placeholder="192.168.10..." value={ip} onChange={(e) => setIp(e.target.value)} />
            </Field>
            <Field label={t("MAC Adresi", "MAC Address")}>
              <Input placeholder="00:1b:1b..." value={mac} onChange={(e) => setMac(e.target.value)} />
            </Field>
            <Field label={t("Cihaz Türü", "Device Type")}>
              <Select value={assetType} onChange={(e) => setAssetType(e.target.value)}>
                <option value="">{t("Tümü", "All")}</option>
                {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((typeKey) => (
                  <option key={typeKey} value={typeKey}>
                    {ASSET_TYPE_LABEL[typeKey]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Üretici", "Vendor")}>
              <Input placeholder="Siemens, Omron…" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </Field>
            <Field label={t("Bölge", "Zone")}>
              <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">{t("Tümü", "All")}</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Doğrulama", "Verification")}>
              <Select value={verified} onChange={(e) => setVerified(e.target.value)}>
                <option value="">{t("Tümü", "All")}</option>
                <option value="true">{t("Doğrulanmış", "Verified")}</option>
                <option value="false">{t("Doğrulanmamış", "Unverified")}</option>
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
              {t("Filtreleri Temizle", "Clear Filters")}
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
                      {z.description || t("Endüstriyel üretim bölgesi", "Industrial production zone")}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-xs">
                    <span className="font-mono font-semibold text-[#1C2434]">
                      {t(`${zAssets.length} cihaz`, `${zAssets.length} devices`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setZoneId(z.id);
                        setActiveTab("inventory");
                      }}
                      className="font-semibold text-[#0D9488] hover:underline"
                    >
                      {t("Bölgedeki Cihazları Gör →", "View Devices in Zone →")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : assetsQuery.isLoading ? (
          <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
        ) : assets.length === 0 ? (
          <Empty>{t("Filtrelere uygun cihaz bulunamadı.", "No devices match the current filters.")}</Empty>
        ) : (
          <div>
            <div className="overflow-x-auto">
              {/* 7 Veri Sütunu (+ Seçim Kutusu): Tek/İki Satırlık Kompakt Tablo */}
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
                    <th className="px-4 py-3">{t("Cihaz / Hostname", "Device / Hostname")}</th>
                    <th className="px-4 py-3">{t("IP & MAC Adresi", "IP & MAC Address")}</th>
                    <th className="px-4 py-3">{t("Tür & Sınıflandırma", "Type & Classification")}</th>
                    <th className="px-4 py-3">{t("Üretici & Model", "Vendor & Model")}</th>
                    <th className="px-4 py-3">{t("Bölge & Kritiklik", "Zone & Criticality")}</th>
                    <th className="px-4 py-3">{t("Durum & Son Görülme", "Status & Last Seen")}</th>
                    <th className="px-4 py-3 text-right">{t("İşlem", "Action")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {pagedAssets.map((a) => {
                    const zone = zones.find((z) => z.id === a.zone_id);
                    const isChecked = selectedIds.includes(a.id);
                    const primaryName =
                      a.name || a.model || a.hostname || a.ip_address || t("İsimsiz Cihaz", "Unnamed Device");
                    const showSubHostname = Boolean(a.hostname && a.hostname !== primaryName);
                    const vendorDisplay = a.vendor
                      ? a.vendor
                      : t("Doğrulanmadı", "Unverified");
                    const modelFw = [a.model, a.firmware_version ? `v${a.firmware_version}` : null]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <tr key={a.id} className="transition-colors hover:bg-[#F8FAFC]">
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(a.id)}
                          />
                        </td>

                        {/* 1. Cihaz / Hostname (tekrarsız) */}
                        <td className="max-w-[190px] px-4 py-2.5">
                          <Link
                            to={`/assets/${a.id}`}
                            title={primaryName}
                            className="block truncate font-semibold text-[#1C2434] hover:text-[#0D9488] hover:underline"
                          >
                            {primaryName}
                          </Link>
                          {showSubHostname && (
                            <div className="truncate font-mono text-[11px] text-[#64748B]" title={a.hostname!}>
                              {a.hostname}
                            </div>
                          )}
                        </td>

                        {/* 2. IP & MAC Adresi */}
                        <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-semibold text-[#1C2434]">
                            <span>{a.ip_address ?? "—"}</span>
                            {a.is_external && <Badge variant="danger">{t("Dış Ağ", "External")}</Badge>}
                          </div>
                          <div className="text-[11px] text-[#64748B]">{a.mac_address ?? "—"}</div>
                        </td>

                        {/* 3. Tür & Sınıflandırma (Purdue + Protokoller tek hücrede) */}
                        <td className="px-4 py-2.5" title={a.classification_label}>
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="font-medium text-[#1C2434]">{ASSET_TYPE_LABEL[a.asset_type]}</span>
                            <Badge variant="mono">{shortPurdue(a.purdue_level)}</Badge>
                          </div>
                          {a.observed_protocols && a.observed_protocols.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {a.observed_protocols.slice(0, 3).map((p) => (
                                <ProtocolBadge key={p} protocol={p} />
                              ))}
                            </div>
                          )}
                        </td>

                        {/* 4. Üretici & Model */}
                        <td className="max-w-[170px] px-4 py-2.5">
                          <div
                            className={`truncate font-medium ${a.vendor ? "text-[#1C2434]" : "text-[#64748B]"}`}
                            title={a.vendor || a.vendor_status_label}
                          >
                            {vendorDisplay}
                          </div>
                          {modelFw && (
                            <div className="truncate font-mono text-[11px] text-[#64748B]" title={modelFw}>
                              {modelFw}
                            </div>
                          )}
                        </td>

                        {/* 5. Bölge & Kritiklik */}
                        <td className="max-w-[175px] px-4 py-2.5">
                          <div className="truncate text-[#1C2434]" title={zone?.name ?? t("Atanmadı", "Unassigned")}>
                            {zone?.name ?? t("Atanmadı", "Unassigned")}
                          </div>
                          <div className="mt-0.5">
                            <CriticalityBadge value={a.criticality} />
                          </div>
                        </td>

                        {/* 6. Durum & Son Görülme */}
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div>
                            <Badge variant={a.is_verified ? "success" : "warning"}>
                              {a.is_verified
                                ? t("✓ Doğrulandı", "✓ Verified")
                                : t(
                                    `Doğrulanmadı (%${Math.round(a.confidence * 100)})`,
                                    `Unverified (${Math.round(a.confidence * 100)}%)`,
                                  )}
                            </Badge>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-[#64748B]">
                            {formatDate(a.last_seen_at)}
                          </div>
                        </td>

                        {/* 7. İşlem */}
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <Link to={`/assets/${a.id}`}>
                            <Button variant="secondary" size="sm">
                              {t("Detay", "Detail")}
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
                <span>{t("Sayfa başına satır:", "Rows per page:")}</span>
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
                {t(
                  `Toplam ${assets.length} kayıttan ${assets.length === 0 ? 0 : startOffset + 1}–${Math.min(
                    startOffset + rowsPerPage,
                    assets.length,
                  )} arası gösteriliyor`,
                  `Showing ${assets.length === 0 ? 0 : startOffset + 1}–${Math.min(
                    startOffset + rowsPerPage,
                    assets.length,
                  )} of ${assets.length} records`,
                )}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPageIdx((p) => Math.max(1, p - 1))}
                >
                  {t("‹ Önceki", "‹ Previous")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPageIdx((p) => Math.min(totalPages, p + 1))}
                >
                  {t("Sonraki ›", "Next ›")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
