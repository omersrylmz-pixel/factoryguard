import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { DecryptedText } from "../components/reactBits";
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
import { useLang } from "../i18n";
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
    reader.onerror = () => reject(new Error("File read failed"));
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
  const { t } = useLang();
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) {
      setSelectedFile(file);
      setUploadResult(null);
    }
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

  function handleSampleAnalyze(sampleKey: "real-modbus-pcap" | "synthetic-zeek" | "multi-ot-pcap") {
    if (!effectiveUploadSensorId) return;
    setUploadResult(null);
    analyzeUploadMut.mutate({
      sensorId: effectiveUploadSensorId,
      body: { sample: sampleKey },
    });
  }

  function handleCopyFingerprint(sensorId: string, fp: string) {
    void navigator.clipboard?.writeText(fp);
    setCopiedId(sensorId);
    setTimeout(() => setCopiedId((cur) => (cur === sensorId ? null : cur)), 2000);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          activeView === "pcap"
            ? t("PCAP Analizi", "PCAP Analysis")
            : t("Sensör Yönetimi", "Sensor Management")
        }
        title={t(
          "Pasif Sensör Yönetimi & Derin PCAP Analizi",
          "Passive Sensor Management & Deep PCAP Analysis",
        )}
        subtitle={t(
          "SPAN / TAP sensör kayıtları, 7 endüstriyel protokol için derin paket analizi ve tek tıkla PCAP / Zeek log işleme",
          "SPAN / TAP sensor enrollment, deep packet inspection for 7 OT protocols and one-click PCAP / Zeek log analysis",
        )}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={activeView === "all" ? "primary" : "secondary"}
              onClick={() => setSearchParams({})}
            >
              {t("Sensörler & Telemetri", "Sensors & Telemetry")}
            </Button>
            <Button
              variant={activeView === "pcap" ? "primary" : "secondary"}
              onClick={() => setSearchParams({ tab: "pcap" })}
            >
              {t("PCAP / Zeek Log Analizi", "PCAP / Zeek Log Analysis")}
            </Button>
          </div>
        }
      />

      {/* 4 TailAdmin StatCard (Tümü sayısal metrik, tek satır etiket ve alt metin) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("Kayıtlı Pasif Sensör", "Registered Passive Sensors")}
          value={sensors.length}
          hint={t(`${sites.length} fabrika lokasyonunda`, `Across ${sites.length} site locations`)}
          tone="teal"
          badge={{
            text: t(`${connectedCount} Çevrimiçi`, `${connectedCount} Online`),
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
          label={t("Yakalanan İletişim Akışı", "Captured Network Flows")}
          value={edges.length}
          hint={t(`Toplam ${totalPacketsOrConns} oturum / bağlantı`, `${totalPacketsOrConns} total sessions / connections`)}
          tone="navy"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />

        <StatCard
          label={t("Desteklenen OT Protokolü", "Supported OT Protocols")}
          value={SUPPORTED_PROTOCOLS.length}
          hint="Modbus · S7comm · ENIP · OPC UA · DNP3"
          tone="teal"
          badge={{ text: t("Derin Paket Analizi", "Deep Packet Inspection"), tone: "teal" }}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          }
        />

        <StatCard
          label={t("Gönderilen Aktif Tarama Paketi", "Active Probe Packets Sent")}
          value={0}
          hint={t("Üretim ağına sıfır paket enjeksiyonu", "Zero packet injection into OT network")}
          tone="emerald"
          badge={{ text: t("Yalnızca Pasif", "Passive Only"), tone: "emerald" }}
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
              {t(
                `"${enrolledToken.name}" sensörü kaydedildi — API Anahtarını Şimdi Kopyalayın`,
                `Sensor "${enrolledToken.name}" enrolled — Copy API Token Now`,
              )}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-amber-800 hover:underline"
              onClick={() => setEnrolledToken(null)}
            >
              {t("Kapat", "Dismiss")}
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            {t(
              "Güvenlik nedeniyle bu anahtar veritabanında açık metin olarak saklanmaz (yalnızca SHA-256 parmak izi tutulur). Sensörünüzde FG_SENSOR_TOKEN olarak yapılandırın:",
              "For security, this token is never stored in plain text (only its SHA-256 fingerprint is stored). Configure it as FG_SENSOR_TOKEN on your sensor:",
            )}
          </p>
          <pre className="mt-2 overflow-x-auto rounded-[4px] border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-[#1C2434] select-all">
            {enrolledToken.token}
          </pre>
        </div>
      )}

      {/* Tek Tıkla PCAP / Zeek Log Yükleme ve Analiz Kartı */}
      {canEditAssets && sensors.length > 0 && (
        <Card
          title={t("PCAP / Zeek Log Derin Paket Analizi", "PCAP / Zeek Log Deep Packet Inspection")}
          subtitle={t(
            ".pcap, .pcapng veya Zeek .log dosyası yükleyin ya da hazır fabrika kayıtlarını tek tıkla çalıştırın",
            "Upload a .pcap, .pcapng or Zeek .log file or run pre-packaged plant traffic captures with one click",
          )}
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
            <Field label={t("Hedef Sensör *", "Target Sensor *")}>
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
            <Field label={t("PCAP veya Zeek Log Dosyası (.pcap, .pcapng, .log)", "PCAP or Zeek Log File (.pcap, .pcapng, .log)")}>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex h-9 w-full cursor-pointer items-center justify-between rounded-[4px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 text-xs text-[#1C2434] transition hover:border-[#0D9488] hover:bg-teal-50/30"
              >
                <span className="truncate font-medium">
                  {selectedFile
                    ? selectedFile.name
                    : t("Dosya seçin veya buraya sürükleyin…", "Choose a file or drop it here…")}
                </span>
                <span className="ml-2 shrink-0 rounded-[3px] bg-[#1C2434] px-2.5 py-1 text-[11px] font-medium text-white">
                  {t("Dosya Seç", "Browse")}
                </span>
                <input
                  type="file"
                  accept=".pcap,.pcapng,.cap,.log,.json,.tsv"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
            </Field>
            <div className="flex items-end">
              <Button
                type="submit"
                className="w-full"
                disabled={!selectedFile || analyzeUploadMut.isPending}
              >
                {analyzeUploadMut.isPending
                  ? t("Analiz Ediliyor…", "Analyzing…")
                  : t("Dosyayı Yükle ve Analiz Et", "Upload & Analyze File")}
              </Button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-3.5">
            <div className="text-xs text-slate-500">
              {t(
                "Laboratuvar endüstriyel paket kayıtlarını tek tıkla sensör hattından geçirin:",
                "Run laboratory industrial packet captures through the sensor pipeline with one click:",
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={analyzeUploadMut.isPending}
                onClick={() => handleSampleAnalyze("multi-ot-pcap")}
              >
                {t(
                  "7 Protokollü Karma OT PCAP Analiz Et (DPI)",
                  "Analyze 7-Protocol Multi-Vendor OT PCAP (DPI)",
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={analyzeUploadMut.isPending}
                onClick={() => handleSampleAnalyze("real-modbus-pcap")}
              >
                {t("Gerçek Modbus PCAP (Zeek 9.0.1)", "Real Modbus PCAP (Zeek 9.0.1)")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={analyzeUploadMut.isPending}
                onClick={() => handleSampleAnalyze("synthetic-zeek")}
              >
                {t("Örnek Fabrika Senaryosu", "Sample Plant Scenario")}
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
                  ✓ {t("Analiz Tamamlandı", "Analysis Completed")}: {uploadResult.filename}
                </span>
                <div className="flex flex-wrap gap-3 font-semibold">
                  <Link to="/assets" className="text-[#0D9488] hover:underline">
                    {t("Cihaz Envanterine Git →", "Go to Device Inventory →")}
                  </Link>
                  <Link to="/network" className="text-[#0D9488] hover:underline">
                    {t("Topoloji Haritası →", "Topology Map →")}
                  </Link>
                  <Link to="/risks" className="text-[#0D9488] hover:underline">
                    {t(
                      `Risk Bulguları (${uploadResult.open_risks_total}) →`,
                      `Risk Findings (${uploadResult.open_risks_total}) →`,
                    )}
                  </Link>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-[4px] bg-white/80 p-2">
                  <div className="text-[10px] text-slate-500 uppercase">
                    {t("Keşfedilen Cihaz", "Discovered Devices")}
                  </div>
                  <div className="font-mono text-sm font-bold text-[#1C2434]">
                    {uploadResult.devices_discovered}
                  </div>
                </div>
                <div className="rounded-[4px] bg-white/80 p-2">
                  <div className="text-[10px] text-slate-500 uppercase">
                    {t("Yeni / Güncellenen Varlık", "Created / Updated Assets")}
                  </div>
                  <div className="font-mono text-sm font-bold text-[#1C2434]">
                    +{uploadResult.assets_created} / {uploadResult.assets_updated}
                  </div>
                </div>
                <div className="rounded-[4px] bg-white/80 p-2">
                  <div className="text-[10px] text-slate-500 uppercase">
                    {t("İletişim Akışı", "Communication Flows")}
                  </div>
                  <div className="font-mono text-sm font-bold text-[#1C2434]">
                    +{uploadResult.communications_created} / {uploadResult.communications_updated}
                  </div>
                </div>
                <div className="rounded-[4px] bg-white/80 p-2">
                  <div className="text-[10px] text-slate-500 uppercase">
                    {t("Açık Risk Bulgusu", "Open Risk Findings")}
                  </div>
                  <div className="font-mono text-sm font-bold text-rose-700">
                    {uploadResult.open_risks_total}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Kayıtlı Sensörler Tablosu */}
      <Card
        title={t(`Kayıtlı Pasif Sensörler (${sensors.length})`, `Registered Passive Sensors (${sensors.length})`)}
        subtitle={t(
          "SPAN / Port Mirroring noktalarında çalışan sensörlerin bağlantı durumu ve SHA-256 kimlik doğrulaması",
          "Connection status and SHA-256 credential fingerprint of sensors running on SPAN / mirror ports",
        )}
        noPadding
      >
        {sensorsQuery.isLoading ? (
          <div className="p-6">
            <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
          </div>
        ) : sensors.length === 0 ? (
          <div className="p-6">
            <Empty>{t("Henüz kayıtlı sensör bulunmuyor.", "No sensors registered yet.")}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">{t("Sensör Adı", "Sensor Name")}</th>
                  <th className="px-4 py-3">{t("Fabrika", "Site")}</th>
                  <th className="px-4 py-3">{t("Durum", "Status")}</th>
                  <th className="px-4 py-3">{t("Sürüm", "Version")}</th>
                  <th className="px-4 py-3">{t("Son Telemetri", "Last Telemetry")}</th>
                  <th className="px-4 py-3">{t("SHA-256 Parmak İzi", "SHA-256 Fingerprint")}</th>
                  <th className="px-5 py-3 text-right">{t("İşlemler", "Actions")}</th>
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
                          {s.is_connected ? t("1G · Çevrimiçi", "1G · Online") : t("Beklemede", "Standby")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">v{s.version}</td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap text-slate-500">
                        {s.last_seen_at ? formatDate(s.last_seen_at) : t("Henüz veri yok", "No telemetry yet")}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        <div className="inline-flex items-center gap-1.5" title={s.credential_fingerprint}>
                          <DecryptedText text={`${s.credential_fingerprint.slice(0, 14)}…`} />
                          <button
                            type="button"
                            onClick={() => handleCopyFingerprint(s.id, s.credential_fingerprint)}
                            className="rounded border border-[#E2E8F0] bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-[#1C2434] hover:border-[#0D9488] hover:text-[#0D9488]"
                          >
                            {copiedId === s.id ? t("Kopyalandı", "Copied") : t("Kopyala", "Copy")}
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
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
                              {t("Örnek PCAP Çalıştır", "Run Sample PCAP")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setSelectedSensorId(selectedSensorId === s.id ? null : s.id)
                            }
                          >
                            {selectedSensorId === s.id
                              ? t("Gizle", "Hide")
                              : t("Keşif Geçmişi", "Discovery Runs")}
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
          title={t(
            `Son Keşif Çalışmaları — ${detailQuery.data.name}`,
            `Recent Discovery Runs — ${detailQuery.data.name}`,
          )}
          subtitle={t(
            "Sensör tarafından gönderilen pasif gözlem paketlerinin işlenme geçmişi",
            "Processing history of passive observation batches submitted by this sensor",
          )}
          noPadding
        >
          {detailQuery.data.recent_runs.length === 0 ? (
            <div className="p-6">
              <Empty>
                {t(
                  "Bu sensör henüz keşif verisi göndermedi.",
                  "This sensor has not submitted any discovery data yet.",
                )}
              </Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-5 py-3">{t("Başlangıç Zamanı", "Start Time")}</th>
                    <th className="px-4 py-3">{t("Tamamlanma Zamanı", "End Time")}</th>
                    <th className="px-4 py-3">{t("Durum", "Status")}</th>
                    <th className="px-5 py-3 text-right">{t("Görülen Cihaz Sayısı", "Devices Seen")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {detailQuery.data.recent_runs.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-2.5 font-mono text-slate-600">
                        {formatDate(r.started_at)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">
                        {r.ended_at ? formatDate(r.ended_at) : t("Devam ediyor", "In progress")}
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
          title={t("Pasif Yakalamada En Aktif IP Adresleri", "Top Communicating IP Addresses")}
          subtitle={t(
            "Gözlemlenen akış ve oturum sayısına göre en yoğun endüstriyel düğümler",
            "Most active industrial nodes by observed flow and session count",
          )}
          noPadding
        >
          {topIps.length === 0 ? (
            <div className="p-6">
              <Empty>{t("Henüz trafik verisi yok.", "No traffic data yet.")}</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-5 py-3">{t("IP & Cihaz Adı", "IP & Device Name")}</th>
                    <th className="px-4 py-3 text-right">{t("Aktif Akış", "Active Flows")}</th>
                    <th className="px-4 py-3 text-right">{t("Toplam Oturum", "Total Sessions")}</th>
                    <th className="px-5 py-3 text-right">{t("İncele", "Inspect")}</th>
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
                        {item.name !== item.ip && (
                          <div className="text-[11px] text-slate-500">{item.name}</div>
                        )}
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
                          {t("Detay →", "Detail →")}
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
          title={t("Pasif Yakalamada Gözlemlenen Protokoller", "Observed Protocols in Passive Capture")}
          subtitle={t(
            "DPI ve port analizi ile sınıflandırılan endüstriyel protokoller",
            "Industrial protocols classified via DPI and port analysis",
          )}
          noPadding
        >
          {topProtos.length === 0 ? (
            <div className="p-6">
              <Empty>{t("Henüz protokol verisi yok.", "No protocol data yet.")}</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-5 py-3">{t("Protokol", "Protocol")}</th>
                    <th className="px-4 py-3 text-right">{t("Akış Sayısı", "Flow Count")}</th>
                    <th className="px-4 py-3 text-right">{t("Toplam Oturum", "Total Sessions")}</th>
                    <th className="px-5 py-3 text-right">{t("Harita", "Map")}</th>
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
                          {t("Topolojide Gör →", "View in Topology →")}
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
          title={t("Yeni Pasif Sensör Kaydet", "Enroll New Passive Sensor")}
          subtitle={t(
            "Saha SPAN portuna bağlanacak yeni bir Zeek / PCAP sensörü için tek kullanımlık API anahtarı üretin",
            "Generate a one-time API token for a new Zeek / PCAP sensor connected to a plant SPAN port",
          )}
        >
          {sites.length === 0 ? (
            <Empty>
              {t(
                "Sensör kaydetmek için önce Ayarlar sayfasından bir fabrika oluşturun.",
                "Create a site in Settings first before enrolling a sensor.",
              )}
            </Empty>
          ) : (
            <form onSubmit={handleEnroll} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Field label={t("Fabrika *", "Site *")}>
                <Select value={effectiveSiteId} onChange={(e) => setSiteId(e.target.value)}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("Sensör Adı *", "Sensor Name *")}>
                <Input
                  required
                  placeholder={t("Örn: sensor-uretim-vlan10", "e.g. sensor-prod-vlan10")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label={t("Sürüm", "Version")}>
                <Input value={version} onChange={(e) => setVersion(e.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={enrollMut.isPending}>
                  {t("Sensör Kaydet & Anahtar Üret", "Enroll Sensor & Generate Token")}
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
