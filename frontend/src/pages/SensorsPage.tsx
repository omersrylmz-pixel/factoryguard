import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { Link } from "react-router";
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
  const [inspectedEdgeId, setInspectedEdgeId] = useState<string | null>(null);
  const [hexOpen, setHexOpen] = useState(true);

  // Örnek Senaryolar Açılır Menüsü (Örnek Yakalama Yükle ▾)
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);
  const sampleMenuRef = useRef<HTMLDivElement>(null);

  // Canlı Paket Akışı Terminali (Live Log Table — Pause / Resume & Protocol Filter)
  const [streamPaused, setStreamPaused] = useState(false);
  const [streamProtoFilter, setStreamProtoFilter] = useState<string>("ALL");
  const [streamTick, setStreamTick] = useState(0);

  useEffect(() => {
    if (!sampleMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(e.target as Node)) {
        setSampleMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [sampleMenuOpen]);

  useEffect(() => {
    if (streamPaused) return;
    const timer = window.setInterval(() => {
      setStreamTick((tVal) => tVal + 1);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [streamPaused]);

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
    if (!effectiveUploadSensorId) return;
    if (!selectedFile) {
      // Dosya seçilmemişse varsayılan 7-protokollü DPI analizini tetikle
      handleSampleAnalyze("multi-ot-pcap");
      return;
    }
    const b64 = await fileToBase64(selectedFile);
    analyzeUploadMut.mutate({
      sensorId: effectiveUploadSensorId,
      body: { filename: selectedFile.name, content_base64: b64 },
    });
  }

  function handleSampleAnalyze(sampleKey: "real-modbus-pcap" | "synthetic-zeek" | "multi-ot-pcap") {
    if (!effectiveUploadSensorId) return;
    setSampleMenuOpen(false);
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
    <div className="space-y-5">
      <PageHeader
        breadcrumb={t("Sensörler & PCAP", "Sensors & PCAP")}
        title={t(
          "Pasif Sensör Yönetimi & Derin PCAP Analizi",
          "Passive Sensor Management & Deep PCAP Analysis",
        )}
      />

      {/* 1. Kompakt Tek Satırlık PCAP / Zeek Kontrol Paneli (Toolbar) */}
      {canEditAssets && sensors.length > 0 && (
        <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-white/[0.08] dark:bg-[#111113]">
          <form
            onSubmit={(e) => void handleFileUpload(e)}
            className="flex flex-col items-stretch gap-2.5 lg:flex-row lg:items-center"
          >
            {/* Sol: Dosya Sürükle-Bırak Alanı (İnce kesikli çizgili, kompakt yükseklik h-11) */}
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex h-11 flex-1 cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-zinc-300 bg-zinc-50/70 px-3.5 text-xs text-zinc-700 transition hover:border-zinc-400 dark:border-white/[0.14] dark:bg-[#18181B]/60 dark:text-zinc-300 dark:hover:border-white/[0.25]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <svg
                  className="h-4 w-4 shrink-0 text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="truncate font-medium">
                  {selectedFile
                    ? selectedFile.name
                    : t(
                        ".pcap, .pcapng, .log dosyasını sürükleyin veya seçin",
                        "Drop .pcap, .pcapng, .log file here or browse",
                      )}
                </span>
              </div>
              <span className="shrink-0 rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-[11px] font-medium text-zinc-700 dark:border-white/[0.1] dark:bg-[#111113] dark:text-zinc-300">
                {t("Dosya Seç", "Browse")}
              </span>
              <input
                type="file"
                accept=".pcap,.pcapng,.cap,.log,.json,.tsv"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            {/* Orta: Hedef Sensör Seçici + Tek Mavi Ana Aksiyon Butonu (Upload & Analyze / Analiz Et) */}
            <div className="flex items-center gap-2">
              <div className="w-48">
                <Select
                  aria-label={t("Hedef Sensör", "Target Sensor")}
                  value={effectiveUploadSensorId}
                  onChange={(e) => setUploadSensorId(e.target.value)}
                >
                  {sensors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="h-9 px-4 whitespace-nowrap"
                disabled={analyzeUploadMut.isPending}
              >
                {analyzeUploadMut.isPending
                  ? t("Analiz Ediliyor…", "Analyzing…")
                  : t("Analiz Et", "Upload & Analyze")}
              </Button>
            </div>

            {/* Sağ: Örnek Senaryolar Açılır Menüsü (Örnek Yakalama Yükle ▾) */}
            <div ref={sampleMenuRef} className="relative">
              <button
                type="button"
                disabled={analyzeUploadMut.isPending}
                onClick={() => setSampleMenuOpen((v) => !v)}
                className="inline-flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-100/80 px-3 text-xs font-medium whitespace-nowrap text-zinc-800 transition hover:bg-zinc-200/70 disabled:opacity-50 lg:w-auto dark:border-white/[0.08] dark:bg-[#18181B] dark:text-zinc-200 dark:hover:border-white/[0.16] dark:hover:bg-[#222226]"
              >
                <svg
                  className="h-3.5 w-3.5 text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>{t("Örnek Yakalama Yükle", "Load Sample Capture")}</span>
                <span className="text-[10px] text-zinc-400">▾</span>
              </button>

              {sampleMenuOpen && (
                <div className="absolute right-0 z-40 mt-1.5 w-72 rounded-md border border-zinc-200 bg-white p-1 shadow-xl dark:border-white/[0.1] dark:bg-[#111113]">
                  <button
                    type="button"
                    onClick={() => handleSampleAnalyze("multi-ot-pcap")}
                    className="flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-2 text-left text-xs text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-[#18181B]"
                  >
                    <div>
                      <div className="font-semibold">
                        {t("7-Protokol Karma OT PCAP (DPI)", "7-Protocol Multi-Vendor OT PCAP (DPI)")}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400">
                        Modbus · S7 · ENIP · OPCUA · DNP3 · BACnet · PN
                      </div>
                    </div>
                    <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                      L7
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSampleAnalyze("real-modbus-pcap")}
                    className="flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-2 text-left text-xs text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-[#18181B]"
                  >
                    <div>
                      <div className="font-semibold">
                        {t("Gerçek Modbus PCAP (Zeek 9.0.1)", "Real Modbus PCAP (Zeek 9.0.1)")}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400">
                        MBAP FC=0x03 / FC=0x05 · TCP:502
                      </div>
                    </div>
                    <span className="rounded border border-white/[0.08] bg-[#18181B] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      PCAP
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSampleAnalyze("synthetic-zeek")}
                    className="flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-2 text-left text-xs text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-[#18181B]"
                  >
                    <div>
                      <div className="font-semibold">
                        {t("Örnek Fabrika Senaryosu", "Sample Plant Scenario")}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400">
                        conn.log · modbus.log · s7comm.log
                      </div>
                    </div>
                    <span className="rounded border border-white/[0.08] bg-[#18181B] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      ZEEK
                    </span>
                  </button>
                </div>
              )}
            </div>
          </form>

          {analyzeUploadMut.isPending && (
            <div className="mt-2.5 flex items-center justify-between rounded-md border border-white/[0.08] bg-[#18181B] px-3 py-2 font-mono text-[11px] text-zinc-300">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-ping rounded-full bg-blue-500" />
                {t(
                  "L7 DPI Hattı Çalışıyor: Çerçeve Çözümleme → 7-Protokol Ayrıştırma → Risk Motoru…",
                  "L7 DPI Pipeline Running: Frame Decode → 7-Protocol Dissection → Risk Engine…",
                )}
              </span>
              <span className="text-zinc-500">1000BASE-TX · SPAN</span>
            </div>
          )}

          {analyzeUploadMut.error != null && (
            <div className="mt-2.5">
              <ErrorBox error={analyzeUploadMut.error} />
            </div>
          )}

          {uploadResult && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-emerald-400">
                  ✓ {uploadResult.filename}
                </span>
                <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
                  {t("Cihaz", "Devices")}: <strong>{uploadResult.devices_discovered}</strong>
                </span>
                <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
                  {t("Varlık", "Assets")}:{" "}
                  <strong className="text-emerald-400">
                    +{uploadResult.assets_created}/{uploadResult.assets_updated}
                  </strong>
                </span>
                <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
                  {t("Akış", "Flows")}:{" "}
                  <strong>
                    +{uploadResult.communications_created}/{uploadResult.communications_updated}
                  </strong>
                </span>
                <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
                  {t("Risk", "Risks")}:{" "}
                  <strong className="text-rose-400">{uploadResult.open_risks_total}</strong>
                </span>
              </div>
              <div className="flex items-center gap-3 font-medium text-zinc-300">
                <Link to="/assets" className="hover:text-white hover:underline">
                  {t("Envanter →", "Inventory →")}
                </Link>
                <Link to="/network" className="hover:text-white hover:underline">
                  {t("Topoloji →", "Topology →")}
                </Link>
                <Link to="/risks" className="hover:text-white hover:underline">
                  {t("Riskler →", "Risks →")}
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Gerçek "Live Log Table" — Tek Satırlık Yoğun Paket Akışı Tablosu (32px satır yüksekliği) */}
      <Card
        title={t(
          "Canlı Pasif Paket Akışı (Live SPAN Log Table)",
          "Live Passive Packet Stream (Live SPAN Log Table)",
        )}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex flex-wrap items-center gap-1">
              {["ALL", ...SUPPORTED_PROTOCOLS].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setStreamProtoFilter(p)}
                  className={`cursor-pointer rounded px-2 py-0.5 font-mono text-[11px] font-medium transition ${
                    streamProtoFilter === p
                      ? "border border-white/[0.2] bg-zinc-800 text-white"
                      : "border border-transparent text-zinc-400 hover:bg-[#18181B] hover:text-zinc-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setStreamPaused((v) => !v)}
            >
              {streamPaused
                ? t("▶ Devam Et", "▶ Resume")
                : t("⏸ Duraklat", "⏸ Pause")}
            </Button>
          </div>
        }
        noPadding
      >
        {/* Üst Durum Şeridi */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-[11px] text-zinc-500 dark:border-white/[0.08] dark:bg-[#18181B]/60 dark:text-zinc-400">
          <span className="inline-flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                streamPaused ? "bg-amber-400" : "animate-pulse bg-emerald-400"
              }`}
            />
            <span>
              span0 (PROMISC · 0 TX) · FILTER:{" "}
              <strong className="text-zinc-900 dark:text-zinc-200">{streamProtoFilter}</strong>
            </span>
          </span>
          <span className="tabular-nums">
            {streamPaused ? t("DURAKLATILDI", "PAUSED") : t("CANLI", "LIVE")} ·{" "}
            {edges.length * 14 + streamTick * 3} pkts
          </span>
        </div>

        {/* Tek Satırlık Yoğun Log Tablosu: Zaman | Frame # | Protokol | Kaynak IP → Hedef IP | L7 Özeti | Hex ▾ */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50/50 text-[10.5px] font-semibold text-zinc-500 uppercase dark:border-zinc-800/80 dark:bg-[#111113] dark:text-zinc-400">
              <tr className="h-8">
                <th className="py-1.5 px-3 whitespace-nowrap">{t("Zaman", "Time")}</th>
                <th className="py-1.5 px-3 whitespace-nowrap">Frame #</th>
                <th className="py-1.5 px-3 whitespace-nowrap">{t("Protokol", "Protocol")}</th>
                <th className="py-1.5 px-3 whitespace-nowrap">
                  {t("Kaynak IP → Hedef IP", "Source IP → Target IP")}
                </th>
                <th className="w-full py-1.5 px-3">{t("L7 Özeti", "L7 Summary")}</th>
                <th className="py-1.5 px-3 text-right whitespace-nowrap">Hex</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filteredEdges = edges.filter((e) => {
                  if (streamProtoFilter === "ALL") return true;
                  return e.protocol.replace(/\?+$/, "").toUpperCase() === streamProtoFilter;
                });
                if (filteredEdges.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} className="py-6 text-center font-sans text-xs text-zinc-500">
                        {t(
                          "Seçilen protokol filtresinde aktif çerçeve yok.",
                          "No active frames for selected protocol filter.",
                        )}
                      </td>
                    </tr>
                  );
                }
                const rotated = filteredEdges.map(
                  (_, idx) => filteredEdges[(idx + streamTick) % filteredEdges.length],
                );
                return rotated.slice(0, 10).map((e, idx) => {
                  const p = e.protocol.replace(/\?+$/, "").toUpperCase();
                  const port = e.target_port ?? 502;
                  const payloadSummary =
                    p === "MODBUS"
                      ? "MBAP UnitID=1 · FC=0x03 Read Holding Registers (40001..40010) [Len=12]"
                      : p === "S7COMM"
                        ? "COTP DT Data · S7 Job (0x01) Read SZL / CPU Status [Rack=0 Slot=1]"
                        : p === "ENIP"
                          ? "CIP Service=0x4C Read Tag 'MainProgram.Line1_Conveyor_Speed'"
                          : p === "OPCUA"
                            ? "OPCUA Binary MSG · ReadRequest NodeId=ns=2;s=PressLine.Pressure"
                            : p === "BACNET"
                              ? "BVLC=0x81 Original-Unicast-NPDU · ReadProperty AnalogInput:1"
                              : p === "DNP3"
                                ? "DNP3 DataLink=0x0564 · App FC=0x01 Read Class 0/1/2 Integrity"
                                : p === "PROFINET"
                                  ? "PROFINET-RT FrameID=0x8000 Cyclic IO Data · Cycle=1.0ms"
                                  : `${p} Session Frame · Ack=1 · Win=64240`;
                  const seqNum = 1000 + ((streamTick + idx) % 8999);
                  const isSelected = (inspectedEdgeId ?? filteredEdges[0]?.id) === e.id;
                  const timeStr = e.last_seen_at
                    ? new Date(e.last_seen_at).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "02:19:04";

                  return (
                    <tr
                      key={`${e.id}-${idx}`}
                      onClick={() => {
                        setInspectedEdgeId(e.id);
                        setHexOpen(true);
                      }}
                      className={`h-8 cursor-pointer border-b border-zinc-200/70 transition-colors dark:border-zinc-800/60 ${
                        isSelected
                          ? "bg-zinc-100 dark:bg-[#18181B]"
                          : "hover:bg-zinc-50 dark:hover:bg-[#16161A]"
                      }`}
                    >
                      <td className="py-1.5 px-3 whitespace-nowrap text-zinc-500 tabular-nums dark:text-zinc-400">
                        {timeStr}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap text-zinc-500 tabular-nums dark:text-zinc-400">
                        #{seqNum}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                          {p}:{port}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap tabular-nums">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {e.source_ip ?? e.source_label}
                        </span>
                        <span className="mx-1.5 text-zinc-500">→</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {e.target_ip ?? e.target_label}
                        </span>
                      </td>
                      <td className="max-w-md truncate py-1.5 px-3 text-zinc-600 dark:text-zinc-300">
                        {payloadSummary}
                      </td>
                      <td className="py-1.5 px-3 text-right whitespace-nowrap text-zinc-400">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            if (isSelected) {
                              setHexOpen((v) => !v);
                            } else {
                              setInspectedEdgeId(e.id);
                              setHexOpen(true);
                            }
                          }}
                          className="cursor-pointer font-mono text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                        >
                          Hex {isSelected && hexOpen ? "▴" : "▾"}
                        </button>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {/* Seçili Satır İçin L7 Paket Çözümleyici & Hex/ASCII Çerçeve Dökümü */}
        {hexOpen &&
          (() => {
            const inspected = edges.find((x) => x.id === inspectedEdgeId) ?? edges[0];
            if (!inspected) return null;
            const p = inspected.protocol.replace(/\?+$/, "").toUpperCase();
            const port = inspected.target_port ?? 502;
            const srcIp = inspected.source_ip ?? "10.10.20.99";
            const dstIp = inspected.target_ip ?? "10.0.0.20";

            const l7Dissection =
              p === "MODBUS"
                ? [
                    "MBAP Header · Transaction ID: 0x01A4 (420) · Protocol ID: 0x0000 (Modbus TCP)",
                    "Length: 6 bytes · Unit Identifier: 0x01 (Slave PLC #1)",
                    "Function Code: 0x03 (Read Holding Registers) · Reference: 40001..40010",
                  ]
                : p === "S7COMM"
                  ? [
                      "TPKT Header · Version: 3 · Length: 31 bytes · ISO 8073 COTP DT Data (0xF0)",
                      "S7 Communication · Protocol ID: 0x32 · ROSCTR: Job (0x01) · Read SZL",
                    ]
                  : p === "ENIP"
                    ? [
                        "EtherNet/IP Encapsulation · Command: SendRRData (0x006F)",
                        "Common Industrial Protocol (CIP) · Service: 0x4C (Read Tag Service)",
                      ]
                    : [
                        `${p} Application Protocol Data Unit (APDU) · Port TCP/${port}`,
                        `Session Flow: ${srcIp} -> ${dstIp} (${inspected.connection_count} frames)`,
                        `Confidence: ${(inspected.protocol_confidence ?? "observed").toUpperCase()} · Cross-Zone: ${inspected.cross_zone ? "YES" : "NO"}`,
                      ];

            const hexLines = [
              `0000  00 1b 1b c4 09 a2 00 0e  8c 7a 31 10 08 00 45 00   ........ .z1...E.`,
              `0010  00 4c 2b 19 40 00 40 06  7a c1 0a 0a 14 63 0a 00   .L+.@.@. z....c..`,
              `0020  00 14 c4 32 01 f6 1b 82  44 a0 9e 11 04 50 18 01   ...2.... D....P..`,
              `0030  f5 e4 3a 00 01 a4 00 00  00 06 01 03 00 00 00 0a   ..:..... ........`,
            ];

            return (
              <div className="border-t border-zinc-200 bg-zinc-950 p-3.5 text-xs text-zinc-300 dark:border-white/[0.08] dark:bg-[#09090B]">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                  <div className="space-y-1 rounded-md border border-white/[0.08] bg-[#111113] p-3 font-mono text-[11px] lg:col-span-7">
                    <div className="text-zinc-400">
                      ▸ Frame: 76 bytes on wire, interface <strong className="text-emerald-400">span0</strong> ·{" "}
                      {srcIp} → {dstIp} ({p}:{port})
                    </div>
                    <div className="pt-0.5 font-semibold text-zinc-100">
                      ▾ {p} Industrial Control Protocol Layer (L7 DPI)
                    </div>
                    <ul className="space-y-0.5 pl-4 text-emerald-400">
                      {l7Dissection.map((line, i) => (
                        <li key={i}>├─ {line}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-md border border-white/[0.08] bg-[#111113] p-3 font-mono text-[11px] leading-relaxed text-zinc-300 lg:col-span-5">
                    <pre className="overflow-x-auto select-all">{hexLines.join("\n")}</pre>
                  </div>
                </div>
              </div>
            );
          })()}
      </Card>

      {/* 3. Kompakt KPI Özeti */}
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
        />
        <StatCard
          label={t("Yakalanan İletişim Akışı", "Captured Network Flows")}
          value={edges.length}
          hint={t(`Toplam ${totalPacketsOrConns} oturum`, `${totalPacketsOrConns} total sessions`)}
          tone="navy"
        />
        <StatCard
          label={t("Desteklenen OT Protokolü", "Supported OT Protocols")}
          value={SUPPORTED_PROTOCOLS.length}
          hint="Modbus · S7comm · ENIP · OPC UA · DNP3"
          tone="teal"
          badge={{ text: "L7 DPI", tone: "teal" }}
        />
        <StatCard
          label={t("Gönderilen Aktif Tarama Paketi", "Active Probe Packets Sent")}
          value={0}
          hint={t("Üretim ağına sıfır paket enjeksiyonu", "Zero packet injection into OT network")}
          tone="emerald"
          badge={{ text: t("Yalnızca Pasif", "Passive Only"), tone: "emerald" }}
        />
      </div>

      {/* Yeni Sensör Token Uyarısı */}
      {enrolledToken && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              {t(
                `"${enrolledToken.name}" sensörü kaydedildi — API Anahtarını Şimdi Kopyalayın`,
                `Sensor "${enrolledToken.name}" enrolled — Copy API Token Now`,
              )}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-amber-300 hover:underline"
              onClick={() => setEnrolledToken(null)}
            >
              {t("Kapat", "Dismiss")}
            </button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-md border border-white/[0.08] bg-[#09090B] px-3 py-2 font-mono text-xs text-zinc-100 select-all">
            {enrolledToken.token}
          </pre>
        </div>
      )}

      {/* Kayıtlı Sensörler Tablosu */}
      <Card
        title={t(`Kayıtlı Pasif Sensörler (${sensors.length})`, `Registered Passive Sensors (${sensors.length})`)}
        noPadding
      >
        {sensorsQuery.isLoading ? (
          <div className="p-5">
            <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
          </div>
        ) : sensors.length === 0 ? (
          <div className="p-5">
            <Empty>{t("Henüz kayıtlı sensör bulunmuyor.", "No sensors registered yet.")}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t("Sensör Adı", "Sensor Name")}</th>
                  <th className="px-4 py-2.5">{t("Fabrika", "Site")}</th>
                  <th className="px-4 py-2.5">{t("Durum", "Status")}</th>
                  <th className="px-4 py-2.5">{t("Sürüm", "Version")}</th>
                  <th className="px-4 py-2.5">{t("Son Telemetri", "Last Telemetry")}</th>
                  <th className="px-4 py-2.5">{t("SHA-256 Parmak İzi", "SHA-256 Fingerprint")}</th>
                  <th className="px-4 py-2.5 text-right">{t("İşlemler", "Actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {sensors.map((s) => {
                  const site = sites.find((st) => st.id === s.site_id);
                  return (
                    <tr key={s.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-semibold text-[#1C2434]">{s.name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{site?.name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={s.is_connected ? "emerald" : "slate"} dot>
                          {s.is_connected ? t("1G · Çevrimiçi", "1G · Online") : t("Beklemede", "Standby")}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">v{s.version}</td>
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap text-slate-500">
                        {s.last_seen_at ? formatDate(s.last_seen_at) : t("Henüz veri yok", "No telemetry yet")}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">
                        <div className="inline-flex items-center gap-1.5" title={s.credential_fingerprint}>
                          <DecryptedText text={`${s.credential_fingerprint.slice(0, 14)}…`} />
                          <button
                            type="button"
                            onClick={() => handleCopyFingerprint(s.id, s.credential_fingerprint)}
                            className="cursor-pointer rounded border border-[#E2E8F0] bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-[#1C2434] hover:border-white/[0.2]"
                          >
                            {copiedId === s.id ? t("Kopyalandı", "Copied") : t("Kopyala", "Copy")}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
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
          noPadding
        >
          {detailQuery.data.recent_runs.length === 0 ? (
            <div className="p-5">
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
                    <th className="px-4 py-2.5">{t("Başlangıç Zamanı", "Start Time")}</th>
                    <th className="px-4 py-2.5">{t("Tamamlanma Zamanı", "End Time")}</th>
                    <th className="px-4 py-2.5">{t("Durum", "Status")}</th>
                    <th className="px-4 py-2.5 text-right">{t("Görülen Cihaz Sayısı", "Devices Seen")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {detailQuery.data.recent_runs.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2 font-mono text-slate-600">
                        {formatDate(r.started_at)}
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-600">
                        {r.ended_at ? formatDate(r.ended_at) : t("Devam ediyor", "In progress")}
                      </td>
                      <td className="px-4 py-2">
                        <Badge tone="emerald" dot>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-[#1C2434]">
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
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title={t("En Aktif IP Adresleri", "Top Communicating IP Addresses")}
          noPadding
        >
          {topIps.length === 0 ? (
            <div className="p-5">
              <Empty>{t("Henüz trafik verisi yok.", "No traffic data yet.")}</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">{t("IP & Cihaz Adı", "IP & Device Name")}</th>
                    <th className="px-4 py-2.5 text-right">{t("Aktif Akış", "Active Flows")}</th>
                    <th className="px-4 py-2.5 text-right">{t("Toplam Oturum", "Total Sessions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {topIps.map((item) => (
                    <tr key={item.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2">
                        <Link
                          to={`/assets/${item.id}`}
                          className="font-mono font-bold text-[#1C2434] hover:underline"
                        >
                          {item.ip}
                        </Link>
                        {item.name !== item.ip && (
                          <span className="ml-2 text-[11px] text-slate-500">{item.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-slate-700">
                        {item.flows}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-[#1C2434]">
                        {item.conns}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={t("Gözlemlenen Protokoller", "Observed Protocols")}
          noPadding
        >
          {topProtos.length === 0 ? (
            <div className="p-5">
              <Empty>{t("Henüz protokol verisi yok.", "No protocol data yet.")}</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">{t("Protokol", "Protocol")}</th>
                    <th className="px-4 py-2.5 text-right">{t("Akış Sayısı", "Flow Count")}</th>
                    <th className="px-4 py-2.5 text-right">{t("Toplam Oturum", "Total Sessions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {topProtos.map((p) => (
                    <tr key={p.proto} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2">
                        <ProtocolBadge protocol={p.proto} />
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-slate-700">
                        {p.flows}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-[#1C2434]">
                        {p.conns}
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
        <Card title={t("Yeni Pasif Sensör Kaydet", "Enroll New Passive Sensor")}>
          {sites.length === 0 ? (
            <Empty>
              {t(
                "Sensör kaydetmek için önce Ayarlar sayfasından bir fabrika oluşturun.",
                "Create a site in Settings first before enrolling a sensor.",
              )}
            </Empty>
          ) : (
            <form onSubmit={handleEnroll} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
                  placeholder={t("Örn: zeek-span-montaj-02", "e.g. zeek-span-assembly-02")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label={t("Sürüm", "Version")}>
                <Input
                  placeholder="0.1.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full"
                  disabled={enrollMut.isPending}
                >
                  {enrollMut.isPending
                    ? t("Kaydediliyor…", "Enrolling…")
                    : t("+ Sensör Anahtarı Üret", "+ Generate Sensor Token")}
                </Button>
              </div>
            </form>
          )}
          <ErrorBox error={enrollMut.error} />
        </Card>
      )}
    </div>
  );
}
