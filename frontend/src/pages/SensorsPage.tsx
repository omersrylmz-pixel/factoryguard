import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, formatDate } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { Sensor, SensorDetail, SensorEnrollResponse, Site } from "../types/api";

export default function SensorsPage() {
  const { activeOrg, canAdmin } = useAuth();
  const qc = useQueryClient();

  const sitesQuery = useQuery({
    queryKey: ["sites", activeOrg?.id],
    queryFn: () => api<Site[]>("/sites"),
    enabled: !!activeOrg,
  });

  const sensorsQuery = useQuery({
    queryKey: ["sensors", activeOrg?.id],
    queryFn: () => api<Sensor[]>("/sensors"),
    enabled: !!activeOrg,
  });

  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const detailQuery = useQuery({
    queryKey: ["sensor", activeOrg?.id, selectedSensorId],
    queryFn: () => api<SensorDetail>(`/sensors/${selectedSensorId}`),
    enabled: !!activeOrg && !!selectedSensorId,
  });

  const [siteId, setSiteId] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("0.1.0");
  const [enrolledToken, setEnrolledToken] = useState<{ name: string; token: string } | null>(null);

  const enrollMut = useMutation({
    mutationFn: (body: { site_id: string; name: string; version: string }) =>
      api<SensorEnrollResponse>("/sensors/enroll", { method: "POST", body }),
    onSuccess: async (res) => {
      setName("");
      setEnrolledToken({ name: res.name, token: res.sensor_token });
      setSelectedSensorId(res.id);
      await qc.invalidateQueries({ queryKey: ["sensors", activeOrg?.id] });
    },
  });

  const sites = sitesQuery.data ?? [];
  const sensors = sensorsQuery.data ?? [];
  const effectiveSiteId = siteId || sites[0]?.id || "";

  function handleEnroll(e: FormEvent) {
    e.preventDefault();
    if (!effectiveSiteId) return;
    enrollMut.mutate({ site_id: effectiveSiteId, name: name.trim(), version: version.trim() || "0.1.0" });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sensör Yönetimi"
        subtitle="Pasif trafik analiz sensörlerinin bağlantı durumu, son görülme zamanı ve keşif çalışmaları"
      />

      {enrolledToken && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              "{enrolledToken.name}" sensörü kaydedildi — API Anahtarını Şimdi Kopyalayın
            </span>
            <button
              className="text-xs font-medium text-amber-800 hover:underline"
              onClick={() => setEnrolledToken(null)}
            >
              Kapat
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Güvenlik nedeniyle bu anahtar veritabanında saklanmaz (yalnızca SHA-256 parmak izi tutulur) ve bir daha
            gösterilmez. Sensörünüzde <code className="font-mono">FG_SENSOR_TOKEN</code> olarak yapılandırın:
          </p>
          <pre className="mt-2 overflow-x-auto rounded border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 select-all">
            {enrolledToken.token}
          </pre>
        </div>
      )}

      {canAdmin && (
        <Card title="Yeni Sensör Kaydet (Enroll)">
          {sites.length === 0 ? (
            <Empty>Sensör kaydetmek için önce Ayarlar sayfasından bir fabrika (site) oluşturun.</Empty>
          ) : (
            <form onSubmit={handleEnroll} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field label="Fabrika *">
                <Select value={effectiveSiteId} onChange={(e) => setSiteId(e.target.value)}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sensör Adı *">
                <Input
                  required
                  placeholder="Örn: sensor-uretim-vlan10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Versiyon">
                <Input value={version} onChange={(e) => setVersion(e.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={enrollMut.isPending}>
                  Sensör Kaydet
                </Button>
              </div>
            </form>
          )}
          <div className="mt-2">
            <ErrorBox error={enrollMut.error} />
          </div>
        </Card>
      )}

      <Card title={`Kayıtlı Sensörler (${sensors.length})`}>
        {sensorsQuery.isLoading ? (
          <Empty>Yükleniyor…</Empty>
        ) : sensors.length === 0 ? (
          <Empty>Henüz kayıtlı sensör bulunmuyor.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Sensör</th>
                  <th className="py-2 pr-4">Fabrika</th>
                  <th className="py-2 pr-4">Bağlantı Durumu</th>
                  <th className="py-2 pr-4">Versiyon</th>
                  <th className="py-2 pr-4">Son Görülme</th>
                  <th className="py-2 pr-4">Parmak İzi (SHA-256)</th>
                  <th className="py-2 text-right">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sensors.map((s) => {
                  const site = sites.find((st) => st.id === s.site_id);
                  return (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">{s.name}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{site?.name ?? "—"}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${
                            s.is_connected
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              s.is_connected ? "bg-emerald-600" : "bg-slate-400"
                            }`}
                          />
                          {s.is_connected ? "Çevrimiçi" : "Çevrimdışı"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">{s.version}</td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500">
                        {s.last_seen_at ? formatDate(s.last_seen_at) : "Henüz veri yok"}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">
                        {s.credential_fingerprint.slice(0, 12)}…
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedSensorId(selectedSensorId === s.id ? null : s.id)}
                        >
                          {selectedSensorId === s.id ? "Gizle" : "Çalışmalar"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedSensorId && detailQuery.data && (
        <Card title={`Son Keşif Çalışmaları — ${detailQuery.data.name}`}>
          {detailQuery.data.recent_runs.length === 0 ? (
            <Empty>Bu sensör henüz keşif verisi göndermedi.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Başlangıç</th>
                    <th className="py-2 pr-4">Bitiş</th>
                    <th className="py-2 pr-4">Durum</th>
                    <th className="py-2">Görülen Cihaz Sayısı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailQuery.data.recent_runs.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-4 text-slate-600">{formatDate(r.started_at)}</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {r.ended_at ? formatDate(r.ended_at) : "Devam ediyor"}
                      </td>
                      <td className="py-2 pr-4 font-medium text-emerald-700">{r.status}</td>
                      <td className="py-2 font-mono font-medium text-slate-900">{r.devices_seen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
