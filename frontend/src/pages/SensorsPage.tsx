import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Badge,
  Button,
  Card,
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
import type {
  CommunicationGraph,
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

const SUPPORTED_PROTOCOLS = [
  "MODBUS",
  "S7COMM",
  "ENIP",
  "OPCUA",
  "BACNET",
  "DNP3",
  "PROFINET",
];

export default function SensorsPage() {
  const { activeOrg, canAdmin, canEditAssets } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = searchParams.get("tab") === "pcap" ? "pcap" : "all";

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

  const graphQuery = useQuery({
    queryKey: ["communications-graph", activeOrg?.id, ""],
    queryFn: () => api<CommunicationGraph>("/communications/graph"),
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
        qc.invalidateQueries({ queryKey: ["communications-graph", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["report-summary", activeOrg?.id] }),
      ]);
    },
  });

  const sites = sitesQuery.data ?? [];
  const sensors = sensorsQuery.data ?? [];
  const edges = graphQuery.data?.edges ?? [];
  const effectiveSiteId = siteId || sites[0]?.id || "";
  const effectiveUploadSensorId = uploadSensorId || sensors[0]?.id || "";
  const connectedCount = sensors.filter((s) => s.is_connected).length;
  const totalPacketsOrConns = edges.reduce((acc, e) => acc + e.connection_count, 0);

  // En Çok İletişim Kuran IP'ler ve Protokoller
  const ipStats = new Map<string, { id: string; ip: string; name: string; flows: number; conns: number }>();
  const protoStats = new Map<string, { proto: string; flows: number; conns: number }>();
  for (const e of edges) {
    for (const [aid, ip, label] of [
      [e.source_asset_id, e.source_ip ?? "—", e.source_label],
      [e.target_asset_id, e.target_ip ?? "—", e.target_label],
    ] as const) {
      const cur = ipStats.get(aid) ?? { id: aid, ip, name: label, flows: 0, conns: 0 };
      cur.flows += 1;
      cur.conns += e.connection_count;
      ipStats.set(aid, cur);
    }
    const pUp = (e.protocol || "unknown").toUpperCase();
    const pCur = protoStats.get(pUp) ?? { proto: pUp, flows: 0, conns: 0 };
    pCur.flows += 1;
    pCur.conns += e.connection_count;
    protoStats.set(pUp, pCur);
  }
  const topIps = Array.from(ipStats.values()).sort((a, b) => b.conns - a.conns).slice(0, 6);
  const topProtos = Array.from(protoStats.values()).sort((a, b) => b.conns - a.conns).slice(0, 6);

  function handleEnroll(e: FormEvent) {
    e.preventDefault();
    if (!effectiveSiteId) return;
    enrollMut.mutate({
      site_id: effectiveSiteId,
      name: name.trim(),
      version: version.trim() || "0.1.0",
    });
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
        breadcrumb={activeView === "pcap" ? "PCAP Analysis" : "Sensor Management"}
        title="Pasif Sensör Yönetimi & Derin PCAP Analizi"
        subtitle="SPAN / TAP sensör kayıtları, 7 endüstriyel protokol için derin paket analizi (DPI) ve tek tıkla PCAP / Zeek log işleme"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={activeView === "all" ? "primary" : "secondary"}
              onClick={() => setSearchParams({})}
            >
              Sensörler & Telemetri
            </Button>
            <Button
              variant={activeView === "pcap" ? "primary" : "secondary"}
              onClick={() => setSearchParams({ tab: "pcap" })}
            >
              PCAP / Zeek Log Analizi
            </Button>
          </div>
        }
      />

      {/* 4 TailAdmin StatCard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Kayıtlı Pasif Sensör"
          value={sensors.length}
          hint={`${sites.length} fabrika lokasyonunda`}
          tone="teal"
          badge={{
            text: `${connectedCount} Çevrimiçi`,
            tone: connectedCount > 0 ? "emerald" : "amber",
          }}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
            </svg>
          }
        />

        <StatCard
          label="Yakalanan İletişim Akışı"
          value={edges.length}
          hint={`Toplam ${totalPacketsOrConns} oturum / bağlantı`}
          tone="navy"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />

        <StatCard
          label="Derin Paket Analizi (DPI)"
          value={SUPPORTED_PROTOCOLS.length}
          hint="Modbus, S7comm, ENIP, OPC UA, BACnet, DNP3, Profinet"
          tone="teal"
          badge={{ text: "L7 Payload DPI", tone: "teal" }}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          }
        />

        <StatCard
          label="Çalışma Modu"
          value="%100 Pasif"
          hint="Üretim ağına sıfır paket enjeksiyonu"
          tone="emerald"
          badge={{ text: "Zero Active Probe", tone: "emerald" }}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />
      </div>

      {/* Yeni Sensör Token Uyarısı */}
      {enrolledToken && (
        <div className="rounded-[4px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              "{enrolledToken.name}" sensörü kaydedildi — API Anahtarını Şimdi Kopyalayın
            </span>
            <button
              type="button"
              className="text-xs font-medium text-amber-800 hover:underline"
              onClick={() => setEnrolledToken(null)}
            >
              Kapat
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Güvenlik nedeniyle bu anahtar veritabanında açık metin olarak saklanmaz (yalnızca SHA-256 parmak izi
            tutulur). Sensörünüzde <code className="font-mono">FG_SENSOR_TOKEN</code> olarak yapılandırın:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-[4px] border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-[#1C2434] select-all">
            {enrolledToken.token}
          </pre>
        </div>
      )}

      {/* Tek Tıkla PCAP / Zeek Log Yükleme ve Analiz Kartı (Screen 7) */}
      {canEditAssets && sensors.length > 0 && (
        <Card
          title="PCAP / Zeek Log Derin Paket Analizi (DPI)"
          subtitle="Bilgisayarınızdan .pcap, .pcapng veya Zeek .log dosyası yükleyin ya da hazır fabrika kayıtlarını tek tıkla çalıştırın"
          actions={
            <div className="flex flex-wrap items-center gap-1">
              {SUPPORTED_PROTOCOLS.map((p) => (
                <ProtocolBadge key={p} protocol={p} />
              ))}
            </div>
          }
        >
          <form
            onSubmit={(e) => void handleFileUpload(e)}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <Field label="Hedef Sensör *">
              <Select
                value={effectiveUploadSensorId}
                onChange={(e) => setUploadSensorId(e.target.value)}
              >
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
                className="h-9 w-full rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-xs text-[#1C2434] file:mr-3 file:rounded-[3px] file:border-0 file:bg-[#1C2434] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#333A48]"
              />
            </Field>
            <div className="flex items-end">
              <Button
                type="submit"
                className="w-full"
                disabled={!selectedFile || analyzeUploadMut.isPending}
              >
                {analyzeUploadMut.isPending ? "Analiz Ediliyor…" : "Dosyayı Yükle ve Analiz Et"}
              </Button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-3.5">
            <div className="text-xs text-slate-500">
              Laboratuvar endüstriyel paket kayıtlarını tek tıkla sensör hattından geçirin:
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
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
            <div className="mt-4 rounded-[4px] border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  ✓ Analiz Tamamlandı: {uploadResult.filename}
                </span>
                <div className="flex flex-wrap gap-3 font-semibold">
                  <Link to="/assets" className="text-[#0D9488] hover:underline">
                    Cihaz Envanterine Git →
                  </Link>
                  <Link to="/network" className="text-[#0D9488] hover:underline">
                    Topoloji Haritası →
                  </Link>
                  <Link to="/risks" className="text-[#0D9488] hover:underline">
                    Risk Bulguları ({uploadResult.open_risks_total}) →
                  </Link>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-[4px] bg-white/80 p-2">
                  <div className="text-[10px] uppercase text-slate-500">Keşfedilen Cihaz</div>
                  <div className="font-mono text-sm font-bold text-[#1C2434]">
                    {uploadResult.devices_discovered}
                  </div>
                </div>
                <div className="rounded-[4px] bg-white/80 p-2">
                  <div className="text-[10px] uppercase text-slate-500">Yeni / Güncellenen Varlık</div>
                  <div className="font-mono text-sm font-bold text-[#1C2434]">
                    +{uploadResult.assets_created} / {uploadResult.assets_updated}
                  </div>
                </div>
                <div className="rounded-[4px] bg-white/80 p-2">
                  <div className="text-[10px] uppercase text-slate-500">İletişim Akışı</div>
                  <div className="font-mono text-sm font-bold text-[#1C2434]">
                    +{uploadResult.communications_created} / {uploadResult.communications_updated}
                  </div>
                </div>
                <div className="rounded-[4px] bg-white/80 p-2">
                  <div className="text-[10px] uppercase text-slate-500">Açık Risk Bulgusu</div>
                  <div className="font-mono text-sm font-bold text-rose-700">
                    {uploadResult.open_risks_total}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Kayıtlı Sensörler Tablosu + Yeni Sensör Kaydı (Screen 6) */}
      <Card
        title={`Kayıtlı Pasif Sensörler (${sensors.length})`}
        subtitle="SPAN / Port Mirroring noktalarında çalışan sensörlerin bağlantı durumu ve SHA-256 kimlik doğrulaması"
        noPadding
      >
        {sensorsQuery.isLoading ? (
          <div className="p-6">
            <Empty>Yükleniyor…</Empty>
          </div>
        ) : sensors.length === 0 ? (
          <div className="p-6">
            <Empty>Henüz kayıtlı sensör bulunmuyor.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Sensör Adı</th>
                  <th className="px-4 py-3">Fabrika (Site)</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Versiyon</th>
                  <th className="px-4 py-3">Son Telemetri</th>
                  <th className="px-4 py-3">SHA-256 Parmak İzi</th>
                  <th className="px-5 py-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {sensors.map((s) => {
                  const site = sites.find((st) => st.id === s.site_id);
                  return (
                    <tr key={s.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3 font-semibold text-[#1C2434]">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600">{site?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={s.is_connected ? "emerald" : "slate"} dot>
                          {s.is_connected ? "1G · Çevrimiçi" : "Beklemede"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">v{s.version}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {s.last_seen_at ? formatDate(s.last_seen_at) : "Henüz veri yok"}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {s.credential_fingerprint.slice(0, 14)}…
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {canEditAssets && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={analyzeUploadMut.isPending}
                              onClick={() => {
                                setUploadSensorId(s.id);
                                handleSampleAnalyze("real-modbus-pcap");
                              }}
                            >
                              Örnek PCAP Çalıştır
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setSelectedSensorId(selectedSensorId === s.id ? null : s.id)
                            }
                          >
                            {selectedSensorId === s.id ? "Gizle" : "Keşif Geçmişi"}
                          </Button>
                        </div>
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
        <Card
          title={`Son Keşif Çalışmaları — ${detailQuery.data.name}`}
          subtitle="Sensör tarafından gönderilen pasif gözlem paketlerinin işlenme geçmişi"
          noPadding
        >
          {detailQuery.data.recent_runs.length === 0 ? (
            <div className="p-6">
              <Empty>Bu sensör henüz keşif verisi göndermedi.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Başlangıç Zamanı</th>
                    <th className="px-4 py-3">Tamamlanma Zamanı</th>
                    <th className="px-4 py-3">Durum</th>
                    <th className="px-5 py-3 text-right">Görülen Cihaz Sayısı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {detailQuery.data.recent_runs.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-2.5 font-mono text-slate-600">
                        {formatDate(r.started_at)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">
                        {r.ended_at ? formatDate(r.ended_at) : "Devam ediyor"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone="emerald" dot>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono font-bold text-[#1C2434]">
                        {r.devices_seen}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 2 Sütunlu Trafik Özeti: En Aktif IP'ler & Protokol Dağılımı */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Pasif Yakalamada En Aktif IP Adresleri"
          subtitle="Gözlemlenen akış ve oturum sayısına göre en yoğun endüstriyel düğümler"
          noPadding
        >
          {topIps.length === 0 ? (
            <div className="p-6">
              <Empty>Henüz trafik verisi yok.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">IP & Cihaz Adı</th>
                    <th className="px-4 py-3 text-right">Aktif Akış</th>
                    <th className="px-4 py-3 text-right">Toplam Oturum</th>
                    <th className="px-5 py-3 text-right">İncele</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {topIps.map((item) => (
                    <tr key={item.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-2.5">
                        <Link
                          to={`/assets/${item.id}`}
                          className="font-mono font-bold text-[#0D9488] hover:underline"
                        >
                          {item.ip}
                        </Link>
                        <div className="text-[11px] text-slate-500">{item.name}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                        {item.flows}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-[#1C2434]">
                        {item.conns}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Link
                          to={`/assets/${item.id}`}
                          className="text-xs font-semibold text-[#1C2434] hover:text-[#0D9488]"
                        >
                          Detay →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Pasif Yakalamada Gözlemlenen Protokoller"
          subtitle="DPI ve port analizi ile sınıflandırılan endüstriyel protokoller"
          noPadding
        >
          {topProtos.length === 0 ? (
            <div className="p-6">
              <Empty>Henüz protokol verisi yok.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Protokol</th>
                    <th className="px-4 py-3 text-right">Akış Sayısı</th>
                    <th className="px-4 py-3 text-right">Toplam Oturum</th>
                    <th className="px-5 py-3 text-right">Harita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {topProtos.map((p) => (
                    <tr key={p.proto} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-2.5">
                        <ProtocolBadge protocol={p.proto} />
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                        {p.flows}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-[#1C2434]">
                        {p.conns}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Link
                          to="/network"
                          className="text-xs font-semibold text-[#0D9488] hover:underline"
                        >
                          Topolojide Gör →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Yeni Sensör Kaydet (Enroll) */}
      {canAdmin && (
        <Card
          title="Yeni Pasif Sensör Kaydet (Sensor Enrollment)"
          subtitle="Saha SPAN portuna bağlanacak yeni bir Zeek / PCAP sensörü için tek kullanımlık API anahtarı üretin"
        >
          {sites.length === 0 ? (
            <Empty>
              Sensör kaydetmek için önce Ayarlar sayfasından bir fabrika (site) oluşturun.
            </Empty>
          ) : (
            <form onSubmit={handleEnroll} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
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
                  Sensör Kaydet & Anahtar Üret
                </Button>
              </div>
            </form>
          )}
          <div className="mt-2">
            <ErrorBox error={enrollMut.error} />
          </div>
        </Card>
      )}
    </div>
  );
}
