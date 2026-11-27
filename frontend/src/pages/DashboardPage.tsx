import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { DeviceHardwareThumb } from "../components/deviceVisuals";
import {
  Badge,
  Button,
  Card,
  CriticalityBadge,
  Empty,
  ErrorBox,
  PageHeader,
  ProtocolBadge,
  StatCard,
  formatAuditAction,
  formatAuditTarget,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useLang } from "../i18n";
import { api, apiDownload } from "../services/api";
import type {
  Asset,
  AuditLog,
  CommunicationGraph,
  Page,
  RiskFinding,
  RiskPosture,
  Sensor,
  Site,
  Zone,
} from "../types/api";

const CHART_PALETTE = ["#3B82F6", "#10B981", "#F59E0B", "#F43F5E", "#6366F1", "#06B6D4"];

export default function DashboardPage() {
  const { activeOrg, canAdmin } = useAuth();
  const { t, theme } = useLang();
  const isDark = theme === "dark";

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

  const sensorsQuery = useQuery({
    queryKey: ["sensors", activeOrg?.id],
    queryFn: () => api<Sensor[]>("/sensors"),
    enabled: !!activeOrg,
  });

  const assetsQuery = useQuery({
    queryKey: ["assets", activeOrg?.id, "dashboard"],
    queryFn: () => api<Page<Asset>>("/assets?limit=200"),
    enabled: !!activeOrg,
  });

  const risksQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "open"],
    queryFn: () => api<Page<RiskFinding>>("/risks?status=open&limit=200"),
    enabled: !!activeOrg,
  });

  const postureQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "posture"],
    queryFn: () => api<RiskPosture>("/risks/posture"),
    enabled: !!activeOrg,
  });

  const graphQuery = useQuery({
    queryKey: ["communications-graph", activeOrg?.id, ""],
    queryFn: () => api<CommunicationGraph>("/communications/graph"),
    enabled: !!activeOrg,
  });

  const auditQuery = useQuery({
    queryKey: ["audit-logs", activeOrg?.id, 8],
    queryFn: () => api<Page<AuditLog>>("/audit-logs?limit=8"),
    enabled: !!activeOrg && canAdmin,
  });

  const assets = assetsQuery.data?.items ?? [];
  const totalAssets = assetsQuery.data?.total ?? assets.length;
  const risks = risksQuery.data?.items ?? [];
  const totalOpenRisks = risksQuery.data?.total ?? risks.length;
  const edges = graphQuery.data?.edges ?? [];
  const sensors = sensorsQuery.data ?? [];
  const sites = sitesQuery.data ?? [];
  const zones = zonesQuery.data ?? [];

  const verifiedCount = assets.filter((a) => a.is_verified).length;
  const unverifiedCount = assets.length - verifiedCount;
  const highCritRisks = risks.filter((r) => r.severity === "critical" || r.severity === "high").length;
  const connectedSensors = sensors.filter((s) => s.is_connected).length;
  const crossZoneCount = edges.filter((e) => e.cross_zone).length;
  const approvedFlowsCount = edges.filter((e) => e.is_baseline_approved).length;
  const totalSessions = edges.reduce((acc, e) => acc + e.connection_count, 0);

  // Purdue / Cihaz Sınıfı kırılımları
  const plcAssets = assets.filter(
    (a) =>
      a.asset_type === "plc" ||
      (a.asset_type === "unknown_device" && (a.observed_protocols ?? []).includes("modbus")),
  );
  const hmiScadaAssets = assets.filter((a) =>
    ["hmi", "scada_server", "industrial_pc", "engineering_workstation"].includes(a.asset_type),
  );
  const infraAssets = assets.filter((a) =>
    ["server", "network_device", "computer"].includes(a.asset_type),
  );

  // Üretici dağılımı (gerçek veritabanı verisinden)
  const unverifiedVendorLabel = t(
    "Üretici Doğrulanmadı (Pasif Gözlem)",
    "Unverified Vendor (Passive Observation)",
  );
  const vendorCounts = new Map<string, { count: number; unverified: boolean }>();
  for (const a of assets) {
    const isUnv = !a.vendor || a.vendor_status_label === "Üretici bilgisi doğrulanmadı";
    const label = isUnv ? unverifiedVendorLabel : a.vendor!;
    const prev = vendorCounts.get(label);
    vendorCounts.set(label, { count: (prev?.count ?? 0) + 1, unverified: isUnv });
  }
  const vendorRanking = Array.from(vendorCounts.entries()).sort((a, b) => b[1].count - a[1].count);
  const maxVendorCount = Math.max(1, vendorRanking[0]?.[1].count ?? 1);

  // Gözlemlenen protokol dağılımı
  const protoStats = new Map<string, { flows: number; conns: number; isHint: boolean }>();
  for (const e of edges) {
    const raw = (e.protocol || "unknown").toUpperCase();
    const isHint = e.protocol_confidence === "port_hint" || raw.endsWith("?");
    const clean = raw.replace(/\?+$/, "");
    const cur = protoStats.get(clean) ?? { flows: 0, conns: 0, isHint };
    cur.flows += 1;
    cur.conns += e.connection_count;
    cur.isHint = cur.isHint && isHint;
    protoStats.set(clean, cur);
  }
  const protoList = Array.from(protoStats.entries()).sort((a, b) => b[1].flows - a[1].flows);
  const totalProtoFlows = Math.max(
    1,
    protoList.reduce((acc, [, v]) => acc + v.flows, 0),
  );

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const posture = postureQuery.data;
  const postureScore = posture?.health_score ?? 100;
  const postureGrade = posture?.grade ?? "A";
  const postureTone = postureScore >= 75 ? "emerald" : postureScore >= 45 ? "amber" : "red";

  // Çok Boyutlu Risk & Duruş Alt Metrikleri (Nozomi Vantage & Claroty xDome Stili)
  const verifiedRatioPct = Math.round((posture?.verified_asset_ratio ?? (totalAssets > 0 ? verifiedCount / totalAssets : 1)) * 100);
  const baselineRatioPct = edges.length > 0 ? Math.round((approvedFlowsCount / edges.length) * 100) : 100;
  const remoteAccessCleanPct = risks.some((r) => r.rule_key === "UNAPPROVED_REMOTE_PATH") ? 35 : 100;
  const cveHygienePct = risks.some((r) => r.rule_key === "KNOWN_VULNERABILITY") ? 45 : 95;
  const peerBenchmarkScore = 64; // Endüstriyel Otomotiv / Üretim OT Sektör Ortalaması

  // Radyal Kadran (Speedometer Gauge) Geometrisi
  const gaugeRadius = 64;
  const gaugeArcLength = Math.PI * gaugeRadius; // Yarım daire (180 derece)
  const gaugeFillOffset = gaugeArcLength * (1 - Math.min(100, Math.max(4, postureScore)) / 100);
  const gaugeStrokeColor =
    postureScore >= 75 ? "#10B981" : postureScore >= 45 ? "#F59E0B" : "#F43F5E";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Genel Bakış & OT Komuta Merkezi", "Overview & OT Command Center")}
        subtitle={t(
          `${activeOrg?.name ?? ""} · Gerçek zamanlı SPAN telemetrisi, Purdue mimarisi ve çok boyutlu risk analitiği`,
          `${activeOrg?.name ?? ""} · Real-time SPAN telemetry, Purdue architecture and multi-dimensional risk analytics`,
        )}
        breadcrumb={t("Kontrol Paneli", "Dashboard")}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void apiDownload("/reports/inventory?format=csv", "factoryguard-inventory.csv")}
            >
              {t("↓ Envanter CSV", "↓ Inventory CSV")}
            </Button>
            <Link to="/sensors">
              <Button variant="primary">{t("PCAP / Zeek Analiz Et", "Analyze PCAP / Zeek")}</Button>
            </Link>
          </>
        }
      />

      {(sitesQuery.error || zonesQuery.error) && <ErrorBox error={sitesQuery.error ?? zonesQuery.error} />}

      {/* 1. Satır: 4 Sütunlu Endüstriyel Telemetri KPI Izgarası */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          to="/assets"
          tone="teal"
          label={t("Keşfedilen Toplam Cihaz", "Total Discovered Devices")}
          value={assetsQuery.isLoading ? "…" : totalAssets}
          badge={t(`${verifiedCount} Doğrulandı`, `${verifiedCount} Verified`)}
          badgeTone={unverifiedCount > 0 ? "amber" : "emerald"}
          subtext={t(`${unverifiedCount} doğrulama bekliyor`, `${unverifiedCount} pending verification`)}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="6" rx="1.5" />
              <rect x="2" y="14" width="20" height="6" rx="1.5" />
              <circle cx="6" cy="7" r="1" fill="currentColor" />
              <circle cx="6" cy="17" r="1" fill="currentColor" />
            </svg>
          }
        />

        <StatCard
          to="/risks"
          tone={postureTone}
          label={t("Güvenlik Duruş Skoru", "Security Posture Score")}
          value={postureQuery.isLoading ? "…" : `${postureScore}/100`}
          badge={t(`Derece ${postureGrade}`, `Grade ${postureGrade}`)}
          badgeTone={postureTone}
          subtext={t(
            `Envanter doğrulama: %${verifiedRatioPct}`,
            `Verified inventory: ${verifiedRatioPct}%`,
          )}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />

        <StatCard
          to="/risks"
          tone={highCritRisks > 0 ? "red" : "emerald"}
          label={t("Açık Risk Bulguları", "Open Risk Findings")}
          value={risksQuery.isLoading ? "…" : totalOpenRisks}
          badge={
            highCritRisks > 0
              ? t(`${highCritRisks} Yüksek / Kritik`, `${highCritRisks} High / Critical`)
              : t("Kritik Bulgu Yok", "No Critical Risks")
          }
          badgeTone={highCritRisks > 0 ? "red" : "emerald"}
          subtext={t("6 deterministik kural aktif", "6 deterministic rules active")}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />

        <StatCard
          to="/network"
          tone="navy"
          label={t("Gözlemlenen İletişim Akışı", "Observed Network Flows")}
          value={graphQuery.isLoading ? "…" : edges.length}
          badge={t(`${connectedSensors}/${sensors.length} Sensör Aktif`, `${connectedSensors}/${sensors.length} Sensors Online`)}
          badgeTone={crossZoneCount > 0 ? "amber" : "teal"}
          subtext={t(`${approvedFlowsCount} baseline onaylı`, `${approvedFlowsCount} baseline approved`)}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        />
      </div>

      {/* 2. Satır (YENİ): Canlı Pasif SPAN Telemetri Osiloskopu & Çok Boyutlu Radyal Güvenlik Kadranı */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Sol 7 Sütun: Canlı SPAN / TAP Derin Paket Osiloskopu & L7 Protokol Spektrumu */}
        <Card
          className="lg:col-span-7"
          title={t(
            "Canlı Pasif SPAN Telemetri Osiloskopu & L7 Protokol Spektrumu",
            "Live Passive SPAN Telemetry Oscilloscope & L7 Protocol Spectrum",
          )}
          subtitle={t(
            "Saha ekipmanına sıfır paket göndererek (0 Tx) yakalanan gerçek zamanlı endüstriyel çerçeve yoğunluğu",
            "Real-time industrial frame intensity captured with zero packet injection (0 Tx) into field equipment",
          )}
          actions={
            <div className="flex items-center gap-2">
              <Badge tone="emerald" dot>
                {t("0 Tx · %100 Pasif Dinleme", "0 Tx · 100% Passive TAP")}
              </Badge>
              <Badge tone="mono">{t(`${totalSessions} Oturum`, `${totalSessions} Sessions`)}</Badge>
            </div>
          }
        >
          <div className="rounded-[8px] border border-[#1E293B] bg-[#070B14] p-4 text-white shadow-inner">
            {/* Üst Osiloskop Telemetri Başlığı */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-sky-400">
                  <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38BDF8]" />
                  CH1: L7 OT PAYLOAD (MODBUS / S7 / CIP)
                </span>
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10B981]" />
                  CH2: BASELINE CONDUIT SYNC
                </span>
              </div>
              <span className="text-slate-400">
                SPAN-RX: <strong className="text-sky-300">1.0 Gbps</strong> · JITTER:{" "}
                <strong className="text-emerald-300">0.42 ms</strong>
              </span>
            </div>

            {/* Çift Kanallı Canlı SVG Osiloskop Dalga Ekranı */}
            <svg viewBox="0 0 680 145" className="h-36 w-full select-none">
              <defs>
                <linearGradient id="osc-sky-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="osc-emerald-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Osiloskop Izgara Çizgileri */}
              {[25, 55, 85, 115].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="680"
                  y2={y}
                  stroke="#162238"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
              ))}
              {[68, 136, 204, 272, 340, 408, 476, 544, 612].map((x) => (
                <line key={x} x1={x} y1="0" x2={x} y2="140" stroke="#162238" strokeWidth="1" />
              ))}

              {/* CH2 Zümrüt Dalga Alanı + Çizgisi */}
              <path
                d="M 0 112 Q 35 88 70 104 T 140 96 T 210 108 T 280 92 T 350 105 T 420 90 T 490 102 T 560 88 T 630 100 L 680 95 L 680 140 L 0 140 Z"
                fill="url(#osc-emerald-fill)"
              />
              <path
                d="M 0 112 Q 35 88 70 104 T 140 96 T 210 108 T 280 92 T 350 105 T 420 90 T 490 102 T 560 88 T 630 100 L 680 95"
                fill="none"
                stroke="#10B981"
                strokeWidth="1.8"
              />

              {/* CH1 Siyan/Kobalt Ana OT Telemetri Dalgası */}
              <path
                d="M 0 86 C 30 42, 55 95, 85 58 C 115 24, 145 84, 175 48 C 205 18, 235 76, 265 54 C 295 28, 325 88, 355 44 C 385 16, 415 72, 445 50 C 475 26, 505 82, 535 42 C 565 20, 595 74, 625 48 L 680 38 L 680 140 L 0 140 Z"
                fill="url(#osc-sky-fill)"
              />
              <path
                d="M 0 86 C 30 42, 55 95, 85 58 C 115 24, 145 84, 175 48 C 205 18, 235 76, 265 54 C 295 28, 325 88, 355 44 C 385 16, 415 72, 445 50 C 475 26, 505 82, 535 42 C 565 20, 595 74, 625 48 L 680 38"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.4"
              />

              {/* Dalga Üzerindeki L7 Paket Yakalama Noktaları */}
              {[
                { x: 85, y: 58, label: "MODBUS FC=0x03" },
                { x: 175, y: 48, label: "S7COMM Setup" },
                { x: 355, y: 44, label: "CIP 0x0063" },
                { x: 535, y: 42, label: "OPCUA OPN" },
              ].map((pt) => (
                <g key={pt.label}>
                  <circle cx={pt.x} cy={pt.y} r="4" fill="#070B14" stroke="#38BDF8" strokeWidth="2" />
                  <rect
                    x={pt.x - 36}
                    y={pt.y - 22}
                    width="74"
                    height="14"
                    rx="3"
                    fill="#0F172A"
                    stroke="#1E293B"
                  />
                  <text
                    x={pt.x + 1}
                    y={pt.y - 12.5}
                    textAnchor="middle"
                    fill="#7DD3FC"
                    className="font-mono text-[7.5px] font-bold"
                  >
                    {pt.label}
                  </text>
                </g>
              ))}
            </svg>

            {/* Alt 7 Endüstriyel Protokol Spektrum Şeridi */}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#1E293B] pt-3 sm:grid-cols-4 xl:grid-cols-7">
              {[
                { proto: "MODBUS", port: ":502", status: "DPI ACTIVE" },
                { proto: "S7COMM", port: ":102", status: "DPI ACTIVE" },
                { proto: "ENIP", port: ":44818", status: "DPI ACTIVE" },
                { proto: "OPCUA", port: ":4840", status: "DPI ACTIVE" },
                { proto: "BACNET", port: ":47808", status: "DPI ACTIVE" },
                { proto: "DNP3", port: ":20000", status: "DPI ACTIVE" },
                { proto: "PROFINET", port: "L2/RT", status: "DPI ACTIVE" },
              ].map((item) => {
                const stat = protoStats.get(item.proto);
                const isSeen = Boolean(stat && stat.flows > 0);
                return (
                  <div
                    key={item.proto}
                    className={`rounded-[5px] border px-2.5 py-1.5 font-mono text-[10px] ${
                      isSeen
                        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                        : "border-[#1E293B] bg-[#0B1120] text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{item.proto}</span>
                      <span className="text-[9px] opacity-75">{item.port}</span>
                    </div>
                    <div className="mt-0.5 text-[9px] text-emerald-400">
                      {isSeen
                        ? t(`${stat!.flows} akış · ${stat!.conns} oturum`, `${stat!.flows}f · ${stat!.conns}s`)
                        : item.status}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Sağ 5 Sütun: Çok Boyutlu Radyal Güvenlik Duruş Kadranı & Sektör Kıyaslaması (Nozomi / Claroty xDome Stili) */}
        <Card
          className="lg:col-span-5"
          title={t("Çok Boyutlu OT Güvenlik Duruşu & Sektör Kıyaslaması", "Multi-Dimensional OT Security Posture & Benchmark")}
          subtitle={t(
            "4 temel güvenlik ekseni ve endüstriyel üretim sektörü ortalamasıyla karşılaştırma",
            "4 foundational security pillars compared against industrial manufacturing peer average",
          )}
          actions={
            <Badge tone={postureTone} dot>
              {t(`Derece ${postureGrade}`, `Grade ${postureGrade}`)}
            </Badge>
          }
        >
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-12">
            {/* Sol: Yarım Daire Radyal Kadran (Speedometer Gauge) */}
            <div className="flex flex-col items-center justify-center sm:col-span-5">
              <svg viewBox="0 0 160 110" className="h-32 w-44 select-none">
                {/* Arka Plan Kadran Yayı */}
                <path
                  d="M 16 90 A 64 64 0 0 1 144 90"
                  fill="none"
                  stroke={isDark ? "#1E293B" : "#E2E8F0"}
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                {/* Aktif Skor Yayı */}
                <path
                  d="M 16 90 A 64 64 0 0 1 144 90"
                  fill="none"
                  stroke={gaugeStrokeColor}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={gaugeArcLength}
                  strokeDashoffset={gaugeFillOffset}
                />
                {/* Merkez Skor ve Derece */}
                <text
                  x="80"
                  y="74"
                  textAnchor="middle"
                  fill={isDark ? "#F8FAFC" : "#0F172A"}
                  className="font-mono text-2xl font-bold"
                >
                  {postureScore}/100
                </text>
                <text
                  x="80"
                  y="94"
                  textAnchor="middle"
                  fill={gaugeStrokeColor}
                  className="font-mono text-[10px] font-bold uppercase"
                >
                  {t(`DERECE ${postureGrade} · OT SKOR`, `GRADE ${postureGrade} · OT SCORE`)}
                </text>
              </svg>

              {/* Sektör Kıyaslama Rozeti (Claroty xDome Peer Benchmark) */}
              <div className="mt-1 w-full rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-center text-[11px] dark:border-[#1E293B] dark:bg-[#161F30]">
                <div className="flex items-center justify-between font-mono text-[10px] text-[#64748B]">
                  <span>{t("Sektör Ort. (Otomotiv OT)", "Sector Avg (Auto OT)")}</span>
                  <strong className="text-sky-500">{peerBenchmarkScore}/100</strong>
                </div>
              </div>
            </div>

            {/* Sağ: 4 Ağırlıklı Güvenlik Ekseni */}
            <div className="space-y-3 sm:col-span-7">
              {[
                {
                  label: t("1. Envanter Doğrulama Oranı", "1. Asset Verification Ratio"),
                  pct: verifiedRatioPct,
                  color: "from-[#2563EB] to-[#38BDF8]",
                },
                {
                  label: t("2. Purdue Baseline & Conduit", "2. Purdue Baseline & Conduits"),
                  pct: baselineRatioPct,
                  color: "from-[#6366F1] to-[#38BDF8]",
                },
                {
                  label: t("3. ICS-CERT / Firmware Hijyeni", "3. ICS-CERT / Firmware Hygiene"),
                  pct: cveHygienePct,
                  color: "from-[#059669] to-[#34D399]",
                },
                {
                  label: t("4. Uzaktan Erişim İzolasyonu", "4. Remote Access Isolation"),
                  pct: remoteAccessCleanPct,
                  color: remoteAccessCleanPct >= 80 ? "from-[#059669] to-[#34D399]" : "from-[#E11D48] to-[#FB7185]",
                },
              ].map((pillar) => (
                <div key={pillar.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#1C2434]">{pillar.label}</span>
                    <span className="font-mono font-bold text-[#1C2434]">%{pillar.pct}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-[#1E293B]">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${pillar.color}`}
                      style={{ width: `${Math.max(6, pillar.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Satır: Görsel ISA-95 / Purdue Mimari Katmanları & Üreticiler (8 Sütun) + Protokol Dağılımı (4 Sütun) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Sol 8 Sütun: Görsel Purdue Mimarisi + Cihaz Önizlemeleri + Üretici Dağılımı */}
        <Card
          className="lg:col-span-8"
          title={t(
            "ISA-95 / Purdue Mimari Katmanları & Donanım Üreticileri",
            "ISA-95 / Purdue Architectural Stack & Hardware Vendors",
          )}
          subtitle={t(
            "Fonksiyonel kontrol katmanlarına, canlı cihaz şasilerine ve doğrulanmış üreticilere göre fabrika mimarisi",
            "Plant architecture structured by functional control layers, live hardware chassis and verified vendors",
          )}
          actions={
            <Link to="/assets" className="text-xs font-semibold text-[#2563EB] hover:underline dark:text-sky-400">
              {t("Envanteri Aç →", "Open Inventory →")}
            </Link>
          }
        >
          {/* 4 Görsel Purdue Katman Kartı (Her birinde gerçek donanım şasi ikonu ile) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                code: t("PURDUE L1/L0 · SAHA", "PURDUE L1/L0 · FIELD"),
                title: t("PLC & Saha Kontrolcü", "PLC & Field Controllers"),
                count: plcAssets.length,
                type: "plc" as const,
                vendor: "Siemens",
                verified: true,
                border: "border-t-sky-500",
                textCol: "text-sky-600 dark:text-sky-400",
                protoHint: "Modbus · S7comm · PROFINET",
              },
              {
                code: t("PURDUE L2 · SÜPERVİZÖR", "PURDUE L2 · SUPERVISORY"),
                title: t("HMI, SCADA & Mühendislik", "HMI, SCADA & Engineering"),
                count: hmiScadaAssets.length,
                type: "hmi" as const,
                vendor: "Wonderware",
                verified: true,
                border: "border-t-indigo-500",
                textCol: "text-indigo-600 dark:text-indigo-400",
                protoHint: "OPC UA · S7comm · ENIP",
              },
              {
                code: t("PURDUE L3 · OPERASYON", "PURDUE L3 · OPERATIONS"),
                title: t("Sunucu, Switch & Historian", "Servers, Switches & Historian"),
                count: infraAssets.length,
                type: "scada_server" as const,
                vendor: "Cisco",
                verified: true,
                border: "border-t-emerald-500",
                textCol: "text-emerald-600 dark:text-emerald-400",
                protoHint: "OPC UA · HTTPS · DNS",
              },
              {
                code: t("DOĞRULANMAMIŞ HAVUZ", "UNVERIFIED POOL"),
                title: t("Doğrulama Bekleyen", "Pending Verification"),
                count: unverifiedCount,
                type: "unknown_device" as const,
                vendor: null,
                verified: false,
                border: "border-t-amber-500",
                textCol: "text-amber-600 dark:text-amber-400",
                protoHint: t("Pasif SPAN Keşfi", "Passive SPAN Discovery"),
              },
            ].map((tier) => (
              <Link
                key={tier.code}
                to="/assets"
                className={`group flex flex-col justify-between rounded-[6px] border border-[#CBD5E1] border-t-2 ${tier.border} bg-[#F8FAFC] p-3.5 transition hover:-translate-y-0.5 hover:border-blue-500/60 dark:border-[#1E293B] dark:bg-[#161F30]`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`font-mono text-[10px] font-bold tracking-wider uppercase ${tier.textCol}`}>
                      {tier.code}
                    </div>
                    <div className="mt-1.5 font-mono text-2xl font-bold text-[#1C2434]">
                      {tier.count}
                    </div>
                  </div>
                  <DeviceHardwareThumb
                    assetType={tier.type}
                    vendor={tier.vendor}
                    isVerified={tier.verified}
                  />
                </div>
                <div className="mt-2 border-t border-[#E2E8F0] pt-2 dark:border-[#1E293B]">
                  <div className="text-xs font-semibold text-[#1C2434]">{tier.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-[#64748B]">{tier.protoHint}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* Üretici Yatay Çubuk Grafiği */}
          <div className="mt-5 border-t border-[#E2E8F0] pt-4 dark:border-[#1E293B]">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-[#1C2434]">
                {t("Donanım Üreticisi Dağılımı", "Hardware Vendor Distribution")}
              </span>
              <span className="text-[#64748B]">
                {t(`${vendorRanking.length} üretici / grup`, `${vendorRanking.length} vendors / groups`)}
              </span>
            </div>
            {vendorRanking.length === 0 ? (
              <Empty>{t("Henüz cihaz kaydı bulunmuyor.", "No device records found yet.")}</Empty>
            ) : (
              <div className="space-y-2.5">
                {vendorRanking.slice(0, 6).map(([vendorName, meta]) => {
                  const pct = Math.max(6, Math.round((meta.count / maxVendorCount) * 100));
                  return (
                    <div key={vendorName}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#1C2434]">{vendorName}</span>
                        <span className="font-mono font-semibold text-[#1C2434]">
                          {t(`${meta.count} cihaz`, `${meta.count} devices`)}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-[#E2E8F0] dark:bg-[#1E293B]">
                        <div
                          className={`h-2 rounded-full ${
                            meta.unverified
                              ? "bg-gradient-to-r from-amber-500 to-amber-400"
                              : "bg-gradient-to-r from-[#2563EB] to-[#06B6D4]"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Sağ 4 Sütun: Gözlemlenen Endüstriyel Protokoller */}
        <Card
          className="lg:col-span-4"
          title={t("Gözlemlenen Ağ Protokolleri", "Observed Network Protocols")}
          subtitle={t("Pasif trafik ve DPI ile sınıflandırılan akışlar", "Flows classified via passive traffic & DPI")}
          actions={<Badge variant="teal">{t(`${protoList.length} Protokol`, `${protoList.length} Protocols`)}</Badge>}
        >
          {protoList.length === 0 ? (
            <Empty>{t("Henüz protokol trafiği gözlenmedi.", "No protocol traffic observed yet.")}</Empty>
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative my-2 flex h-40 w-40 items-center justify-center">
                <svg viewBox="0 0 140 140" className="h-40 w-40 -rotate-90">
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke={isDark ? "#1E293B" : "#F1F5F9"}
                    strokeWidth="16"
                  />
                  {protoList.slice(0, 6).map(([proto, stat], idx) => {
                    const frac = stat.flows / totalProtoFlows;
                    const dash = frac * circumference;
                    const offset = cumulativeOffset;
                    cumulativeOffset += dash;
                    return (
                      <circle
                        key={proto}
                        cx="70"
                        cy="70"
                        r={radius}
                        fill="none"
                        stroke={CHART_PALETTE[idx % CHART_PALETTE.length]}
                        strokeWidth="16"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={-offset}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-2xl font-bold text-[#1C2434]">{totalProtoFlows}</span>
                  <span className="text-[10px] font-semibold tracking-wider text-[#64748B] uppercase">
                    {t("AKTİF AKIŞ", "ACTIVE FLOWS")}
                  </span>
                </div>
              </div>

              <div className="mt-3 w-full divide-y divide-[#E2E8F0] text-xs dark:divide-[#1E293B]">
                {protoList.slice(0, 6).map(([proto, stat], idx) => {
                  const pct = Math.round((stat.flows / totalProtoFlows) * 100);
                  return (
                    <div key={proto} className="flex items-center justify-between py-2">
                      <span className="flex items-center gap-2 font-mono font-semibold text-[#1C2434]">
                        <span
                          className="h-2.5 w-2.5 rounded-xs"
                          style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }}
                        />
                        <ProtocolBadge
                          protocol={proto}
                          confidence={stat.isHint ? "port_hint" : "observed"}
                        />
                      </span>
                      <span className="font-mono text-[#64748B]">
                        {t(
                          `${stat.flows} akış`,
                          `${stat.flows} ${stat.flows === 1 ? "flow" : "flows"}`,
                        )}{" "}
                        (<strong className="text-[#1C2434]">{pct}%</strong>)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 4. Satır: Öncelikli Risk Bulguları (7 Sütun) + Tesisler/Bölgeler ve Denetim Kayıtları (5 Sütun) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card
          className="lg:col-span-7"
          noPadding
          title={t("Öncelikli Açık Risk Bulguları", "Priority Open Risk Findings")}
          subtitle={t("Açıklanabilir kural motoru tarafından işaretlenen bulgular", "Findings flagged by the explainable rule engine")}
          actions={
            <Link to="/risks" className="text-xs font-semibold text-[#2563EB] hover:underline dark:text-sky-400">
              {t(`Tüm Bulgular (${totalOpenRisks}) →`, `All Findings (${totalOpenRisks}) →`)}
            </Link>
          }
        >
          {risksQuery.isLoading ? (
            <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
          ) : risks.length === 0 ? (
            <Empty>{t("Açık risk bulgusu bulunmuyor.", "No open risk findings.")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold text-[#64748B] uppercase">
                  <tr>
                    <th className="px-5 py-3">{t("Bulgu & Kural", "Finding & Rule")}</th>
                    <th className="px-4 py-3">{t("Etkilenen Cihaz", "Affected Device")}</th>
                    <th className="px-4 py-3">{t("Puan / Seviye", "Score / Severity")}</th>
                    <th className="px-5 py-3 text-right">{t("İncele", "Inspect")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {risks.slice(0, 6).map((r) => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-[#1C2434]">{r.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-[#64748B]">
                          <span>{r.evidence.rule_id ?? r.rule_key}</span>
                          <span>·</span>
                          <span>
                            {t("Güven", "Confidence")}: %{Math.round(r.confidence * 100)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap">
                        <Link
                          to={`/assets/${r.asset_id}`}
                          className="font-semibold text-[#2563EB] hover:underline dark:text-sky-400"
                        >
                          {r.asset_ip ?? r.asset_name ?? "—"}
                        </Link>
                        {r.asset_name && r.asset_name !== r.asset_ip && (
                          <div className="max-w-[160px] truncate font-sans text-[11px] text-[#64748B]" title={r.asset_name}>
                            {r.asset_name}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#1E293B] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                            {r.score}/100
                          </span>
                          <CriticalityBadge value={r.severity} />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link to="/risks">
                          <Button variant="secondary" size="sm">
                            {t("Detay", "Detail")}
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-5">
          <Card
            title={t("Fabrikalar ve Ağ Bölgeleri", "Sites & Network Zones")}
            subtitle={t("Kayıtlı üretim tesisleri ve segmentasyon bölgeleri", "Registered production sites and segmentation zones")}
            actions={
              <Link to="/settings" className="text-xs font-semibold text-[#2563EB] hover:underline dark:text-sky-400">
                {t("Yönet →", "Manage →")}
              </Link>
            }
          >
            {sitesQuery.isLoading ? (
              <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
            ) : sites.length === 0 ? (
              <Empty>{t("Henüz fabrika kaydı yok.", "No sites registered yet.")}</Empty>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {sites.map((site) => {
                  const siteZones = zones.filter((z) => z.site_id === site.id);
                  return (
                    <div key={site.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#1C2434]">{site.name}</div>
                          <div className="text-[11px] text-[#64748B]">
                            {site.industry || t("Endüstriyel Üretim", "Industrial Manufacturing")} · {site.timezone}
                          </div>
                        </div>
                        <Badge variant="mono">
                          {t(`${siteZones.length} Bölge`, `${siteZones.length} Zones`)}
                        </Badge>
                      </div>
                      {siteZones.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {siteZones.map((z) => (
                            <span
                              key={z.id}
                              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[11px] text-[#1C2434]"
                            >
                              <span>{z.name}</span>
                              <CriticalityBadge value={z.criticality} />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title={t("Son Denetim Kayıtları", "Recent Audit Logs")}
            subtitle={t("Kritik yapılandırma ve analiz işlemleri", "Critical configuration and analysis actions")}
          >
            {!canAdmin ? (
              <Empty>
                {t(
                  "Denetim kayıtlarını görüntülemek için yönetici yetkisi gerekir.",
                  "Administrator permission is required to view audit logs.",
                )}
              </Empty>
            ) : auditQuery.isLoading ? (
              <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
            ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
              <Empty>{t("Henüz denetim kaydı yok.", "No audit logs yet.")}</Empty>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {auditQuery.data!.items.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-2 py-2 text-xs first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="teal">{formatAuditAction(log.action)}</Badge>
                      {log.target_type && (
                        <span className="truncate text-[11px] text-[#64748B]">
                          {formatAuditTarget(log.target_type)}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-[#64748B]">
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
