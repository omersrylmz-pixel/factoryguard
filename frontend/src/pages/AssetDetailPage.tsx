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
  PageHeader,
  Select,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { AssetDetail, AssetType, Criticality, Site, Zone } from "../types/api";

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeOrg, canEditAssets } = useAuth();
  const qc = useQueryClient();

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
      <div className="flex items-center justify-between">
        <div>
          <Link to="/assets" className="text-xs font-medium text-blue-700 hover:underline">
            ← Cihaz Envanterine Dön
          </Link>
          <PageHeader
            title={asset.name || asset.hostname || asset.ip_address || "Cihaz Detayı"}
            subtitle={`${asset.classification_label} · ${asset.vendor_status_label}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <CriticalityBadge value={asset.criticality} />
          <span
            className={`rounded px-2.5 py-1 text-xs font-medium ${
              asset.is_verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {asset.is_verified ? "Doğrulandı (%100)" : `Doğrulanmadı (Güven: %${Math.round(asset.confidence * 100)})`}
          </span>
        </div>
      </div>

      {/* Kanıta Dayalı Sınıflandırma Özeti */}
      <Card title="Kanıta Dayalı Sınıflandırma Değerlendirmesi">
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
          {asset.classification_reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Genel Bilgiler */}
        <Card title="Ağ ve Görülme Bilgileri">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">IP Adresi</dt>
              <dd className="font-mono font-medium text-slate-900">{asset.ip_address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">MAC Adresi</dt>
              <dd className="font-mono font-medium text-slate-900">{asset.mac_address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Hostname</dt>
              <dd className="font-mono text-slate-800">{asset.hostname ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Fabrika (Site)</dt>
              <dd className="text-slate-800">{site?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">İlk Görülme</dt>
              <dd className="text-xs text-slate-700">{formatDate(asset.first_seen_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Son Görülme</dt>
              <dd className="text-xs text-slate-700">{formatDate(asset.last_seen_at)}</dd>
            </div>
          </dl>
        </Card>

        {/* Manuel Düzenleme ve Doğrulama */}
        <Card title="Envanter Bilgilerini Düzenle / Doğrula">
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  placeholder="Örn: Siemens, Schneider, Omron"
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
      </div>

      {/* İletişim İlişkileri */}
      <Card title={`Gözlemlenen İletişim İlişkileri (${asset.communications.length})`}>
        {asset.communications.length === 0 ? (
          <Empty>Bu cihaz için henüz iletişim akışı gözlemlenmedi.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Yön</th>
                  <th className="py-2 pr-4">Karşı Cihaz</th>
                  <th className="py-2 pr-4">Protokol / Hedef Port</th>
                  <th className="py-2 pr-4">Bağlantı Sayısı</th>
                  <th className="py-2">Son Görülme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {asset.communications.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-4 font-medium">
                      {c.direction === "outbound" ? "→ Giden" : "← Gelen"}
                    </td>
                    <td className="py-2 pr-4">
                      <Link to={`/assets/${c.peer_asset_id}`} className="font-mono text-blue-700 hover:underline">
                        {c.peer_ip ?? c.peer_asset_id.slice(0, 8)}
                      </Link>
                      {c.peer_name && <span className="ml-2 text-slate-500">({c.peer_name})</span>}
                    </td>
                    <td className="py-2 pr-4 font-mono">
                      {c.protocol.toUpperCase()} {c.target_port ? `:${c.target_port}` : ""}
                    </td>
                    <td className="py-2 pr-4 font-mono">{c.connection_count}</td>
                    <td className="py-2 text-slate-500">{formatDate(c.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Kimlik Geçmişi (IP / MAC Değişimleri) ve Gözlem Geçmişi */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={`Kimlik Geçmişi — IP / MAC / Hostname (${asset.identifiers.length})`}>
          {asset.identifiers.length === 0 ? (
            <Empty>Kayıt yok.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Tür</th>
                    <th className="py-2 pr-4">Değer</th>
                    <th className="py-2 pr-4">İlk Görülme</th>
                    <th className="py-2">Son Görülme</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asset.identifiers.map((idItem) => (
                    <tr key={idItem.id}>
                      <td className="py-2 pr-4 uppercase text-slate-500">{idItem.identifier_type}</td>
                      <td className="py-2 pr-4 font-mono font-medium text-slate-900">{idItem.identifier_value}</td>
                      <td className="py-2 pr-4 text-slate-500">{formatDate(idItem.first_seen_at)}</td>
                      <td className="py-2 text-slate-500">{formatDate(idItem.last_seen_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={`Gözlem Geçmişi (${asset.observations.length})`}>
          {asset.observations.length === 0 ? (
            <Empty>Pasif gözlem kaydı yok (CSV ile eklendi).</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Zaman</th>
                    <th className="py-2 pr-4">Kaynak</th>
                    <th className="py-2">Kanıt (Evidence)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asset.observations.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 pr-4 whitespace-nowrap text-slate-500">{formatDate(o.observed_at)}</td>
                      <td className="py-2 pr-4 font-mono text-slate-700">{o.source}</td>
                      <td className="py-2 font-mono text-slate-600">{JSON.stringify(o.evidence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
