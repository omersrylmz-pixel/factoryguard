import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
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

  // Görünüm sekmeleri (Dragos ASSET INVENTORY / ZONES + MON5 Summary / Detail)
  const [activeTab, setActiveTab] = useState<"inventory" | "zones">("inventory");
  const [viewMode, setViewMode] = useState<"detail" | "summary">("detail");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
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

  const quickVerifyOneMut = useMutation({
    mutationFn: (assetId: string) =>
      api(`/assets/${assetId}`, { method: "PATCH", body: { is_verified: true } }),
    onSuccess: async () => {
      setOpenMenuId(null);
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

  // Sayfalama
  const totalPages = Math.max(1, Math.ceil(assets.length / rowsPerPage));
  const safePage = Math.min(pageIdx, totalPages);
  const startOffset = (safePage - 1) * rowsPerPage;
  const pagedAssets = assets.slice(startOffset, startOffset + rowsPerPage);

  // Aktif filtre rozetleri (Dragos tarzı)
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (q.trim()) {
    activeFilterChips.push({
      key: "q",
      label: `Search = "${q.trim()}"`,
      clear: () => {
        setQ("");
        setSearchParams({});
      },
    });
  }
  if (assetType) {
    activeFilterChips.push({
      key: "type",
      label: `Type = ${ASSET_TYPE_LABEL[assetType]}`,
      clear: () => setAssetType(""),
    });
  }
  if (vendor.trim()) {
    activeFilterChips.push({
      key: "vendor",
      label: `Hardware Vendor = ${vendor.trim()}`,
      clear: () => setVendor(""),
    });
  }
  if (zoneId) {
    const zName = zones.find((z) => z.id === zoneId)?.name ?? zoneId;
    activeFilterChips.push({
      key: "zone",
      label: `Zone = ${zName}`,
      clear: () => setZoneId(""),
    });
  }
  if (criticality) {
    activeFilterChips.push({
      key: "crit",
      label: `Criticality = ${CRITICALITY_LABEL[criticality as Criticality]}`,
      clear: () => setCriticality(""),
    });
  }
  if (verified !== "") {
    activeFilterChips.push({
      key: "ver",
      label: `Verified = ${verified}`,
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
    <div className="space-y-5">
      {/* Dragos & MON5 Birleşik Üst Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1E2D3B] text-white shadow-xs">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-light tracking-tight text-slate-900">Asset Inventory</h1>
            <p className="text-xs text-slate-500">
              {total} assets discovered · {verifiedCount} verified · {unverifiedCount} unverified
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Summary / Detail Toggle (MON5) */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("summary")}
              className={`rounded-md px-3 py-1 font-semibold ${
                viewMode === "summary" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setViewMode("detail")}
              className={`rounded-md px-3 py-1 font-semibold ${
                viewMode === "detail" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Detail
            </button>
          </div>

          <button
            type="button"
            onClick={() => void apiDownload("/reports/inventory?format=csv", "factoryguard-inventory.csv")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            ↓ Export
          </button>
        </div>
      </div>

      {/* Dragos Sekme Çubuğu: ASSET INVENTORY | ZONES */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs">
        <div className="grid grid-cols-2 border-b border-slate-200 text-center text-xs font-bold tracking-wider uppercase">
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`py-3.5 transition ${
              activeTab === "inventory"
                ? "border-b-2 border-[#2B7CB3] text-[#2B7CB3] bg-slate-50/40"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            ASSET INVENTORY ({total})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("zones")}
            className={`py-3.5 transition ${
              activeTab === "zones"
                ? "border-b-2 border-[#2B7CB3] text-[#2B7CB3] bg-slate-50/40"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            ZONES & PURDUE LEVELS ({zones.length})
          </button>
        </div>

        {/* MON5 Özet Kartları (Summary seçildiğinde görünür) */}
        {viewMode === "summary" && (
          <div className="grid grid-cols-1 gap-4 border-b border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3.5">
              <div className="text-[10px] font-mono font-bold uppercase text-slate-400">TOTAL ASSETS</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">{total}</div>
              <div className="text-xs text-slate-500">Pasif keşfedilen varlıklar</div>
            </div>
            <div className="rounded-lg border-2 border-[#EA580C]/70 bg-orange-50/60 p-3.5">
              <div className="text-[10px] font-mono font-bold uppercase text-[#EA580C]">TYPE_PLC / OT</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">
                {assets.filter((a) => (a.observed_protocols ?? []).length > 0 || a.asset_type === "plc").length}
              </div>
              <div className="text-xs font-medium text-[#EA580C]">Endüstriyel protokol konuşan</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3.5">
              <div className="text-[10px] font-mono font-bold uppercase text-emerald-700">VERIFIED</div>
              <div className="mt-1 text-2xl font-extrabold text-emerald-800">{verifiedCount}</div>
              <div className="text-xs text-emerald-700">Envanterde doğrulandı</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5">
              <div className="text-[10px] font-mono font-bold uppercase text-amber-800">UNVERIFIED</div>
              <div className="mt-1 text-2xl font-extrabold text-amber-900">{unverifiedCount}</div>
              <div className="text-xs text-amber-800">İnceleme / doğrulama bekliyor</div>
            </div>
          </div>
        )}

        {activeTab === "zones" ? (
          <div className="p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {zones.map((z) => {
                const zAssets = assets.filter((a) => a.zone_id === z.id);
                return (
                  <div
                    key={z.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">{z.name}</span>
                        <CriticalityBadge value={z.criticality} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {z.description || "Endüstriyel üretim bölgesi"}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-2.5 text-xs">
                      <span className="font-mono font-bold text-slate-800">{zAssets.length} cihaz</span>
                      <button
                        type="button"
                        onClick={() => {
                          setZoneId(z.id);
                          setActiveTab("inventory");
                        }}
                        className="font-semibold text-[#2B7CB3] hover:underline"
                      >
                        Bölgedeki Cihazları Filtrele →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Dragos Araç Çubuğu: Actions, Filters, IP/CIDR Search, Settings/Import */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {canEditAssets && (
                  <button
                    type="button"
                    disabled={bulkVerifyMut.isPending}
                    onClick={() => bulkVerifyMut.mutate(selectedIds.length > 0 ? selectedIds : undefined)}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span>
                      {bulkVerifyMut.isPending
                        ? "Doğrulanıyor…"
                        : selectedIds.length > 0
                          ? `Actions · Seçili ${selectedIds.length} Cihazı Doğrula`
                          : "Actions · Tüm Yerel Cihazları Doğrula"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold ${
                    showFilters
                      ? "border-[#2B7CB3] bg-sky-50 text-[#2B7CB3]"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>Filters ({activeFilterChips.length}) ▾</span>
                </button>

                <label className="hidden items-center gap-1.5 text-xs text-slate-600 sm:inline-flex">
                  <input
                    type="checkbox"
                    checked={verified === "false"}
                    onChange={(e) => setVerified(e.target.checked ? "false" : "")}
                  />
                  <span>Yalnızca doğrulanmamış cihazlar</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-64">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPageIdx(1);
                    }}
                    placeholder="e.g. 10.0.0.8, Siemens, PLC, modbus..."
                    className="w-full rounded border border-slate-300 bg-white py-1.5 pr-3 pl-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#2B7CB3] focus:outline-none"
                  />
                </div>
                {canEditAssets && (
                  <button
                    type="button"
                    onClick={() => setShowImport((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded bg-[#2B7CB3] px-3 py-1.5 text-xs font-bold tracking-wide text-white uppercase shadow-2xs hover:bg-[#236593]"
                  >
                    <span>⚙ CSV IMPORT</span>
                  </button>
                )}
              </div>
            </div>

            {/* Aktif Filtre Rozetleri (Dragos `Hardware Firmware = true ×` tarzı) */}
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {activeFilterChips.map((chip) => (
                  <span
                    key={chip.key}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                  >
                    <span>{chip.label}</span>
                    <button
                      type="button"
                      onClick={chip.clear}
                      className="ml-1 rounded-full text-slate-500 hover:text-slate-900"
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
                  className="text-xs font-semibold text-[#2B7CB3] hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Açılır Detaylı Filtre Çekmecesi */}
            {showFilters && (
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-3 lg:grid-cols-6">
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
                <Field label="Üretici (Vendor)">
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
                <Field label="Doğrulama Durumu">
                  <Select value={verified} onChange={(e) => setVerified(e.target.value)}>
                    <option value="">Tümü</option>
                    <option value="true">Doğrulanmış</option>
                    <option value="false">Doğrulanmamış</option>
                  </Select>
                </Field>
              </div>
            )}

            {bulkVerifyNotice && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                {bulkVerifyNotice}
              </div>
            )}

            {showImport && canEditAssets && (
              <Card title="CSV ile Envanter İçe Aktar">
                <form onSubmit={handleImport} className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                        className="w-full text-xs text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
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
                      className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs"
                      placeholder={"name,ip_address,mac_address,hostname,asset_type,vendor,model,firmware_version,zone,criticality,is_verified\nPLC-01,192.168.10.20,00:11:22:33:44:20,plc01,plc,Siemens,S7-1500,V2.9,Üretim Hattı,high,true"}
                      value={csvContent}
                      onChange={(e) => setCsvContent(e.target.value)}
                    />
                  </Field>
                  <ErrorBox error={importMut.error} />
                  {importResult && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                      <div className="font-medium text-slate-800">
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

            <ErrorBox error={assetsQuery.error || bulkVerifyMut.error} />

            {/* Dragos Tarzı Koyu Lacivert Başlıklı (#1E2D3B) Zebra Çizgili Envanter Tablosu */}
            {assetsQuery.isLoading ? (
              <Empty>Yükleniyor…</Empty>
            ) : assets.length === 0 ? (
              <Empty>Filtrelere uygun cihaz bulunamadı.</Empty>
            ) : (
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1E2D3B] text-[11px] font-semibold tracking-wider text-white uppercase">
                    <tr>
                      <th className="w-8 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={pagedAssets.length > 0 && pagedAssets.every((a) => selectedIds.includes(a.id))}
                          onChange={(e) =>
                            setSelectedIds(e.target.checked ? pagedAssets.map((a) => a.id) : [])
                          }
                        />
                      </th>
                      <th className="px-3 py-3">Model / Device</th>
                      <th className="px-3 py-3">IP / MAC</th>
                      <th className="px-3 py-3">Firmware</th>
                      <th className="px-3 py-3">Purdue / Series ↓</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Class & Protocols</th>
                      <th className="px-3 py-3">Hardware Vendor</th>
                      <th className="px-3 py-3">Zone</th>
                      <th className="px-3 py-3">Last Seen</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {pagedAssets.map((a, idx) => {
                      const zone = zones.find((z) => z.id === a.zone_id);
                      const isChecked = selectedIds.includes(a.id);
                      return (
                        <tr
                          key={a.id}
                          className={`transition ${
                            idx % 2 === 1 ? "bg-slate-50/90" : "bg-white"
                          } hover:bg-sky-50/60`}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelect(a.id)}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Link
                              to={`/assets/${a.id}`}
                              className="font-semibold text-[#1E2D3B] hover:text-[#2B7CB3] hover:underline"
                            >
                              {a.name || a.model || a.hostname || a.ip_address || "Unknown Device"}
                            </Link>
                            {a.hostname && <div className="text-[11px] text-slate-500">{a.hostname}</div>}
                          </td>
                          <td className="px-3 py-2.5 font-mono">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                              <span>{a.ip_address ?? "—"}</span>
                              {a.is_external && (
                                <span className="rounded bg-red-100 px-1.5 py-0.5 font-sans text-[10px] font-bold text-red-700">
                                  WAN
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">{a.mac_address ?? "—"}</div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-700">
                            {a.firmware_version || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">
                            <span className="font-medium">{a.purdue_level ?? "L1/L2"}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-700 font-mono text-[9px] font-bold text-white">
                                {a.asset_type === "plc"
                                  ? "PLC"
                                  : a.asset_type === "hmi"
                                    ? "HMI"
                                    : a.asset_type === "scada_server"
                                      ? "SCD"
                                      : "DEV"}
                              </span>
                              <span>{ASSET_TYPE_LABEL[a.asset_type]}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="text-slate-800">{a.classification_label}</div>
                            {a.observed_protocols && a.observed_protocols.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {a.observed_protocols.map((p) => (
                                  <span
                                    key={p}
                                    className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-[#1E2D3B]"
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-800">
                            <div className="font-medium">{a.vendor || a.vendor_status_label}</div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <CriticalityBadge value={a.criticality} />
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  a.is_verified
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-900"
                                }`}
                              >
                                {a.is_verified ? "Verified" : `%${Math.round(a.confidence * 100)}`}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">{zone?.name ?? "Unassigned"}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                            {formatDate(a.last_seen_at)}
                          </td>
                          <td className="relative px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(openMenuId === a.id ? null : a.id)}
                              className="rounded px-2 py-1 font-bold text-slate-600 hover:bg-slate-200"
                              title="Actions"
                            >
                              ⋮
                            </button>
                            {openMenuId === a.id && (
                              <div className="absolute right-4 z-30 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 text-left text-xs shadow-lg">
                                <Link
                                  to={`/assets/${a.id}`}
                                  className="block px-3 py-2 font-medium text-slate-800 hover:bg-slate-100"
                                >
                                  Edit Asset Attributes
                                </Link>
                                <Link
                                  to="/network"
                                  className="block px-3 py-2 text-slate-700 hover:bg-slate-100"
                                >
                                  Pivot → Interactive Map
                                </Link>
                                <Link
                                  to="/risks"
                                  className="block px-3 py-2 text-slate-700 hover:bg-slate-100"
                                >
                                  View Risk Notifications
                                </Link>
                                {canEditAssets && !a.is_verified && (
                                  <button
                                    type="button"
                                    onClick={() => quickVerifyOneMut.mutate(a.id)}
                                    className="block w-full border-t border-slate-100 px-3 py-2 text-left font-semibold text-emerald-700 hover:bg-emerald-50"
                                  >
                                    ✓ Mark Asset Verified
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Dragos Tarzı Sayfalama Alt Çubuğu */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setPageIdx(1);
                      }}
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={50}>50</option>
                    </select>
                  </div>

                  <div>
                    Displaying {assets.length === 0 ? 0 : startOffset + 1}–
                    {Math.min(startOffset + rowsPerPage, assets.length)} of {assets.length} rows
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPageIdx((p) => Math.max(1, p - 1))}
                      className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                    >
                      ‹
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                      <button
                        key={pNum}
                        type="button"
                        onClick={() => setPageIdx(pNum)}
                        className={`rounded border px-2.5 py-1 font-semibold ${
                          pNum === safePage
                            ? "border-[#2B7CB3] bg-sky-50 text-[#2B7CB3]"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                      >
                        {pNum}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPageIdx((p) => Math.min(totalPages, p + 1))}
                      className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
