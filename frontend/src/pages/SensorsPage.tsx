import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, formatDate } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type {
  Sensor,
  SensorDetail,
  SensorEnrollResponse,
  SensorUploadAnalyzeResult,
  Site,
} from "../types/api";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

export default function SensorsPage() {
  const { activeOrg, canAdmin, canEditAssets } = useAuth();
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

  // PCAP / Zeek log yükleme durumu
  const [uploadSensorId, setUploadSensorId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<SensorUploadAnalyzeResult | null>(null);

  const enrollMut = useMutation({
    mutationFn: (body: { site_id: string; name: string; version: string }) =>
      api<SensorEnrollResponse>("/sensors/enroll", { method: "POST", body }),
    onSuccess: async (res) => {
      setName("");
      setEnrolledToken({ name: res.name, token: res.sensor_token });
      setSelectedSensorId(res.id);
      setUploadSensorId(res.id);
      await qc.invalidateQueries({ queryKey: ["sensors", activeOrg?.id] });
    },
  });

  const analyzeUploadMut = useMutation({
    mutationFn: (args: {
      sensorId: string;
      body: { filename?: string; content_base64?: string; sample?: string };
    }) =>
      api<SensorUploadAnalyzeResult>(`/sensors/${args.sensorId}/analyze-upload`, {
        method: "POST",
        body: args.body,
      }),
    onSuccess: async (res) => {
      setUploadResult(res);
      setSelectedFile(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sensors", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["sensor", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["assets", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["communications", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["comm-graph", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["report-summary", activeOrg?.id] }),
      ]);
    },
  });

  const sites = sitesQuery.data ?? [];
  const sensors = sensorsQuery.data ?? [];
  const effectiveSiteId = siteId || sites[0]?.id || "";
  const effectiveUploadSensorId = uploadSensorId || sensors[0]?.id || "";

  function handleEnroll(e: FormEvent) {
    e.preventDefault();
    if (!effectiveSiteId) return;
    enrollMut.mutate({ site_id: effectiveSiteId, name: name.trim(), version: version.trim() || "0.1.0" });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadResult(null);
  }

  async function handleFileUpload(e: FormEvent) {
    e.preventDefault();
    if (!effectiveUploadSensorId || !selectedFile) return;
    const b64 = await fileToBase64(selectedFile);
    analyzeUploadMut.mutate({
      sensorId: effectiveUploadSensorId,
      body: { filename: selectedFile.name, content_base64: b64 },
    });
  }

  function handleSampleAnalyze(sampleKey: "real-modbus-pcap" | "synthetic-zeek") {
    if (!effectiveUploadSensorId) return;
    setUploadResult(null);
    analyzeUploadMut.mutate({
      sensorId: effectiveUploadSensorId,
      body: { sample: sampleKey },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sensör Yönetimi ve Canlı PCAP Analizi"
        subtitle="Pasif trafik analiz sensörlerinin durumu, tek tıkla PCAP / Zeek log analizi ve keşif çalışmaları"
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

      {canEditAssets && sensors.length > 0 && (
        <Card
          title="Web Arayüzünden Tek Tıkla PCAP / Zeek Log Yükle ve Analiz Et"
          actions={
            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              %100 Pasif Analiz (.pcap, .pcapng, Zeek .log)
            </span>
          }
        >
          <p className="mb-4 text-xs text-slate-600">
            Bilgisayarınızdan bir <code className="font-mono">.pcap</code>,{" "}
            <code className="font-mono">.pcapng</code> veya Zeek log dosyası seçip yükleyin ya da hazır gerçek
            fabrika PCAP senaryolarını tek tıkla çalıştırın. Keşfedilen cihazlar, ağ topolojisi ve açıklanabilir
            risk bulguları anında oluşturulur.
          </p>

          <form onSubmit={(e) => void handleFileUpload(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Hedef Sensör *">
              <Select value={effectiveUploadSensorId} onChange={(e) => setUploadSensorId(e.target.value)}>
                {sensors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="PCAP veya Zeek Log Dosyası (.pcap, .pcapng, .log, .json)">
              <input
                type="file"
                accept=".pcap,.pcapng,.cap,.log,.json,.tsv"
                onChange={handleFileChange}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button
                type="submit"
                className="w-full"
                disabled={!selectedFile || analyzeUploadMut.isPending}
              >
                {analyzeUploadMut.isPending ? "Analiz Ediliyor…" : "Dosyayı Yükle ve Analiz Et"}
              </Button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-500">
              Dosyanız yoksa laboratuvarımızdaki gerçek endüstriyel paket kayıtlarını tek tıkla çalıştırın:
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={analyzeUploadMut.isPending}
                onClick={() => handleSampleAnalyze("real-modbus-pcap")}
              >
                Gerçek Modbus PCAP Analiz Et (Zeek 9.0.1)
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={analyzeUploadMut.isPending}
                onClick={() => handleSampleAnalyze("synthetic-zeek")}
              >
                Örnek Fabrika Senaryosu Yükle
              </Button>
            </div>
          </div>

          {analyzeUploadMut.error != null && (
            <div className="mt-3">
              <ErrorBox error={analyzeUploadMut.error} />
            </div>
          )}

          {uploadResult && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  Analiz Tamamlandı: {uploadResult.filename}
                </span>
                <div className="flex gap-3 font-medium">
                  <Link to="/assets" className="text-blue-700 hover:underline">
                    Cihaz Envanterine Git →
                  </Link>
                  <Link to="/network" className="text-blue-700 hover:underline">
                    Topoloji Haritası →
                  </Link>
                  <Link to="/risks" className="text-blue-700 hover:underline">
                    Risk Bulguları ({uploadResult.open_risks_total}) →
                  </Link>
                </div>
              </div>
              <div className="mt-1.5 text-emerald-800">
                Keşfedilen Cihaz: <strong>{uploadResult.devices_discovered}</strong> (Yeni:{" "}
                <strong>{uploadResult.assets_created}</strong>, Güncellenen:{" "}
                <strong>{uploadResult.assets_updated}</strong>) · İletişim Akışı (Yeni:{" "}
                <strong>{uploadResult.communications_created}</strong>, Güncellenen:{" "}
                <strong>{uploadResult.communications_updated}</strong>) · Toplam Açık Risk:{" "}
                <strong>{uploadResult.open_risks_total}</strong>
              </div>
            </div>
          )}
        </Card>
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
