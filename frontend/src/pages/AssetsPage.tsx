import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
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
  PageHeader,
  Select,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { Asset, AssetType, Criticality, CsvImportResult, Page, Site, Zone } from "../types/api";

export default function AssetsPage() {
  const { activeOrg, canEditAssets } = useAuth();
  const qc = useQueryClient();

  // Filtreler (Bölüm 10.3: IP, MAC, Cihaz türü, Üretici, Bölge, Kritiklik, Doğrulama durumu)
  const [ip, setIp] = useState("");
  const [mac, setMac] = useState("");
  const [assetType, setAssetType] = useState("");
  const [vendor, setVendor] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [criticality, setCriticality] = useState("");
  const [verified, setVerified] = useState("");

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
  if (ip.trim()) params.set("ip", ip.trim());
  if (mac.trim()) params.set("mac", mac.trim());
  if (assetType) params.set("asset_type", assetType);
  if (vendor.trim()) params.set("vendor", vendor.trim());
  if (zoneId) params.set("zone_id", zoneId);
  if (criticality) params.set("criticality", criticality);
  if (verified !== "") params.set("is_verified", verified);
  params.set("limit", "100");

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

  const importMut = useMutation({
    mutationFn: (body: { site_id: string; csv_content: string }) =>
      api<CsvImportResult>("/assets/import", { method: "POST", body }),
    onSuccess: async (res) => {
      setImportResult(res);
      await qc.invalidateQueries({ queryKey: ["assets", activeOrg?.id] });
    },
  });

  const sites = sitesQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const assets = assetsQuery.data?.items ?? [];
  const total = assetsQuery.data?.total ?? 0;
  const effectiveSiteId = importSiteId || sites[0]?.id || "";

  function handleImport(e: FormEvent) {
    e.preventDefault();
    if (!effectiveSiteId || !csvContent.trim()) return;
    importMut.mutate({ site_id: effectiveSiteId, csv_content: csvContent });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Merkezi Cihaz Envanteri"
          subtitle="Pasif keşifle tespit edilen veya CSV ile içe aktarılan tüm endüstriyel ve ağ varlıkları"
        />
        {canEditAssets && (
          <Button variant="secondary" onClick={() => setShowImport(!showImport)}>
            {showImport ? "CSV İçe Aktarmayı Kapat" : "CSV ile Envanter İçe Aktar"}
          </Button>
        )}
      </div>

      {showImport && canEditAssets && (
        <Card title="CSV ile Envanter İçe Aktar">
          {sites.length === 0 ? (
            <Empty>Önce Ayarlar sayfasından bir fabrika oluşturun.</Empty>
          ) : (
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
                <Field label="CSV Dosyası Seç (İsteğe Bağlı)">
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
              <Field label="CSV İçeriği (Örnek sütunlar: name,ip_address,mac_address,hostname,asset_type,vendor,model,zone,criticality)">
                <textarea
                  rows={5}
                  required
                  className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs focus:border-blue-600 focus:outline-none"
                  placeholder={
                    "name,ip_address,mac_address,asset_type,vendor,model,criticality\nHat-1 PLC,192.168.10.20,00:11:22:33:44:50,plc,Siemens,S7-1500,high"
                  }
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                />
              </Field>
              <ErrorBox error={importMut.error} />
              {importResult && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <div>
                    İşlenen satır: <strong>{importResult.processed_rows}</strong> · Yeni eklenen:{" "}
                    <strong>{importResult.created}</strong> · Güncellenen: <strong>{importResult.updated}</strong> ·
                    Hatalı: <strong>{importResult.errors.length}</strong>
                  </div>
                  {importResult.errors.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-red-700">
                      {importResult.errors.map((err) => (
                        <li key={err.row}>
                          Satır {err.row}: {err.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <Button type="submit" disabled={importMut.isPending}>
                {importMut.isPending ? "İçe aktarılıyor…" : "İçe Aktar"}
              </Button>
            </form>
          )}
        </Card>
      )}

      {/* Filtre Çubuğu */}
      <Card title="Filtreler">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Field label="IP Adresi">
            <Input placeholder="10.0.0." value={ip} onChange={(e) => setIp(e.target.value)} />
          </Field>
          <Field label="MAC Adresi">
            <Input placeholder="00:11:22" value={mac} onChange={(e) => setMac(e.target.value)} />
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
          <Field label="Bölge / Hat">
            <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">Tümü</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kritiklik">
            <Select value={criticality} onChange={(e) => setCriticality(e.target.value)}>
              <option value="">Tümü</option>
              {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((c) => (
                <option key={c} value={c}>
                  {CRITICALITY_LABEL[c]}
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
      </Card>

      {/* Envanter Tablosu */}
      <Card title={`Cihazlar (Toplam: ${total})`}>
        {assetsQuery.isLoading ? (
          <Empty>Yükleniyor…</Empty>
        ) : assets.length === 0 ? (
          <Empty>Filtrelere uygun cihaz bulunamadı.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Cihaz / Hostname</th>
                  <th className="py-2 pr-4">IP / MAC</th>
                  <th className="py-2 pr-4">Sınıflandırma (Kanıta Dayalı)</th>
                  <th className="py-2 pr-4">Üretici / Model</th>
                  <th className="py-2 pr-4">Bölge</th>
                  <th className="py-2 pr-4">Kritiklik</th>
                  <th className="py-2 pr-4">Güven / Doğrulama</th>
                  <th className="py-2 text-right">Son Görülme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((a) => {
                  const zone = zones.find((z) => z.id === a.zone_id);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4">
                        <Link to={`/assets/${a.id}`} className="font-medium text-blue-700 hover:underline">
                          {a.name || a.hostname || a.ip_address || "İsimsiz Cihaz"}
                        </Link>
                        {a.hostname && <div className="text-xs text-slate-500">{a.hostname}</div>}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        <div className="text-slate-900">{a.ip_address ?? "—"}</div>
                        <div className="text-slate-500">{a.mac_address ?? "—"}</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="text-xs font-medium text-slate-800">{a.classification_label}</div>
                        <div className="text-[11px] text-slate-500">{ASSET_TYPE_LABEL[a.asset_type]}</div>
                      </td>
                      <td className="py-2.5 pr-4 text-xs">
                        <div className="text-slate-800">{a.vendor_status_label}</div>
                        {a.model && <div className="text-slate-500">{a.model}</div>}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-slate-600">{zone?.name ?? "Atanmadı"}</td>
                      <td className="py-2.5 pr-4">
                        <CriticalityBadge value={a.criticality} />
                      </td>
                      <td className="py-2.5 pr-4 text-xs">
                        <span
                          className={`rounded px-2 py-0.5 font-medium ${
                            a.is_verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {a.is_verified ? "Doğrulandı" : `Doğrulanmadı (%${Math.round(a.confidence * 100)})`}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-xs text-slate-500">{formatDate(a.last_seen_at)}</td>
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
