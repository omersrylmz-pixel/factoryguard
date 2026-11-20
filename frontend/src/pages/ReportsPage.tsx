import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ASSET_TYPE_LABEL,
  Badge,
  Button,
  Card,
  CRITICALITY_LABEL,
  CriticalityBadge,
  ErrorBox,
  Field,
  PageHeader,
  Select,
  StatCard,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api, apiDownload } from "../services/api";
import type {
  AssetType,
  Criticality,
  ReportSummary,
  RiskRuleKey,
  RiskStatus,
  Site,
  Zone,
} from "../types/api";

const RULE_LABELS: Record<RiskRuleKey, string> = {
  NEW_ASSET: "Yeni / Doğrulanmamış Cihaz",
  UNKNOWN_OT_ASSET: "Doğrulanmamış OT Cihazı",
  UNEXPECTED_COMMUNICATION: "Beklenmeyen İletişim",
  UNAPPROVED_REMOTE_PATH: "Onaysız Uzaktan Erişim",
  KNOWN_VULNERABILITY: "Doğrulanmış Zafiyet (CVE)",
  ASSET_NOT_SEEN: "Uzun Süredir Gözlemlenmeyen Cihaz",
};

const STATUS_LABELS: Record<RiskStatus, string> = {
  open: "Açık",
  investigating: "İnceleniyor",
  accepted: "Kabul Edildi",
  resolved: "Çözüldü",
  false_positive: "Yanlış Pozitif",
};

export default function ReportsPage() {
  const { activeOrg } = useAuth();
  const [siteId, setSiteId] = useState("");

  // Cihaz Envanteri raporu filtreleri
  const [invZoneId, setInvZoneId] = useState("");
  const [invCriticality, setInvCriticality] = useState("");
  const [invVerified, setInvVerified] = useState("");

  // Risk raporu filtreleri
  const [riskStatus, setRiskStatus] = useState("");
  const [riskSeverity, setRiskSeverity] = useState("");
  const [riskRuleKey, setRiskRuleKey] = useState("");

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [downloadErr, setDownloadErr] = useState<unknown>(null);

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

  const summaryQuery = useQuery({
    queryKey: ["report-summary", activeOrg?.id, siteId],
    queryFn: () =>
      api<ReportSummary>(`/reports/summary${siteId ? `?site_id=${siteId}` : ""}`),
    enabled: !!activeOrg,
  });

  const sites = sitesQuery.data ?? [];
  const allZones = zonesQuery.data ?? [];
  const filteredZones = siteId ? allZones.filter((z) => z.site_id === siteId) : allZones;
  const s = summaryQuery.data;

  function buildInventoryQuery(): string {
    const p = new URLSearchParams();
    if (siteId) p.set("site_id", siteId);
    if (invZoneId) p.set("zone_id", invZoneId);
    if (invCriticality) p.set("criticality", invCriticality);
    if (invVerified === "true") p.set("is_verified", "true");
    if (invVerified === "false") p.set("is_verified", "false");
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }

  function buildRisksQuery(): string {
    const p = new URLSearchParams();
    if (siteId) p.set("site_id", siteId);
    if (riskStatus) p.set("status", riskStatus);
    if (riskSeverity) p.set("severity", riskSeverity);
    if (riskRuleKey) p.set("rule_key", riskRuleKey);
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }

  async function handleDownload(key: string, path: string, fallbackFilename: string) {
    setBusyKey(key);
    setDownloadErr(null);
    try {
      await apiDownload(path, fallbackFilename);
    } catch (err) {
      setDownloadErr(err);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Reports & SIEM"
        title="Kurumsal Denetim Raporları & SIEM Dışa Aktarım"
        subtitle="ISO/IEC 62443 ve iç denetim süreçleri için PDF/CSV envanter raporları, açıklanabilir risk çıktıları ve ArcSight/QRadar/Splunk CEF akışı"
        actions={
          <div className="w-60">
            <Select
              aria-label="Fabrika kapsamı"
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setInvZoneId("");
              }}
            >
              <option value="">Tüm Fabrikalar</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <ErrorBox error={downloadErr || summaryQuery.error} />

      {/* 4 TailAdmin StatCard — Canlı Yönetici Özeti */}
      {s && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Rapor Kapsamındaki Varlık"
            value={s.assets.total}
            hint={`Doğrulanan: ${s.assets.verified} · Doğrulanmamış: ${s.assets.unverified}`}
            tone="teal"
            badge={{
              text: s.site_name ?? "Tüm Tesisler",
              tone: "teal",
            }}
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="4" width="20" height="6" rx="1.5" />
                <rect x="2" y="14" width="20" height="6" rx="1.5" />
              </svg>
            }
          />

          <StatCard
            label="Kritik / Yüksek Riskler"
            value={
              (s.risks.by_severity.critical ?? 0) + (s.risks.by_severity.high ?? 0)
            }
            hint={`Kritik: ${s.risks.by_severity.critical ?? 0} · Yüksek: ${s.risks.by_severity.high ?? 0}`}
            tone={
              (s.risks.by_severity.critical ?? 0) + (s.risks.by_severity.high ?? 0) > 0
                ? "red"
                : "emerald"
            }
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            }
          />

          <StatCard
            label="Toplam Risk Bulgusu"
            value={s.risks.total}
            hint={`Açık: ${s.risks.open_total} · Maks Puan: ${s.risks.max_score}`}
            tone="amber"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            }
          />

          <StatCard
            label="İletişim & Sensör Kapsamı"
            value={s.communications.total_flows}
            hint={`${s.sensors.active}/${s.sensors.total} aktif pasif sensör`}
            tone="navy"
            badge={{ text: "SIEM CEF Hazır", tone: "teal" }}
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="6" cy="6" r="3" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="12" cy="18" r="3" />
              </svg>
            }
          />
        </div>
      )}

      {/* Rapor İndirme Kartları */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="1. OT Cihaz Envanteri Raporu (CSV / PDF)"
          subtitle="Tüm pasif keşfedilen varlıkları, bölge, Purdue katmanı, üretici, protokol ve doğrulama durumuyla dışa aktarın"
          actions={<Badge tone="teal">ISO/IEC 62443 Envanter</Badge>}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Bölge (Zone)">
              <Select value={invZoneId} onChange={(e) => setInvZoneId(e.target.value)}>
                <option value="">Tüm Bölgeler</option>
                {filteredZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kritiklik">
              <Select
                value={invCriticality}
                onChange={(e) => setInvCriticality(e.target.value)}
              >
                <option value="">Tümü</option>
                <option value="critical">Kritik</option>
                <option value="high">Yüksek</option>
                <option value="medium">Orta</option>
                <option value="low">Düşük</option>
              </Select>
            </Field>
            <Field label="Doğrulama">
              <Select value={invVerified} onChange={(e) => setInvVerified(e.target.value)}>
                <option value="">Tümü</option>
                <option value="true">Doğrulanmış</option>
                <option value="false">Doğrulanmamış</option>
              </Select>
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5 border-t border-[#E2E8F0] pt-4">
            <Button
              variant="primary"
              disabled={busyKey !== null}
              onClick={() =>
                handleDownload(
                  "inv-pdf",
                  `/reports/inventory.pdf${buildInventoryQuery()}`,
                  "factoryguard-inventory.pdf",
                )
              }
            >
              {busyKey === "inv-pdf" ? "Hazırlanıyor…" : "Envanter PDF İndir"}
            </Button>
            <Button
              variant="secondary"
              disabled={busyKey !== null}
              onClick={() =>
                handleDownload(
                  "inv-csv",
                  `/reports/inventory.csv${buildInventoryQuery()}`,
                  "factoryguard-inventory.csv",
                )
              }
            >
              {busyKey === "inv-csv" ? "Hazırlanıyor…" : "Envanter CSV İndir"}
            </Button>
          </div>
        </Card>

        <Card
          title="2. Açıklanabilir Risk & SIEM Raporu (PDF / CSV / CEF)"
          subtitle="Yönetici özeti, bulgu kanıtları, çözüm önerileri ve kurumsal SIEM sistemleri için Common Event Format (CEF)"
          actions={<Badge tone="navy">SIEM & Denetim</Badge>}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Durum">
              <Select value={riskStatus} onChange={(e) => setRiskStatus(e.target.value)}>
                <option value="">Tümü</option>
                {(Object.keys(STATUS_LABELS) as RiskStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Önem Derecesi">
              <Select value={riskSeverity} onChange={(e) => setRiskSeverity(e.target.value)}>
                <option value="">Tümü</option>
                <option value="critical">Kritik</option>
                <option value="high">Yüksek</option>
                <option value="medium">Orta</option>
                <option value="low">Düşük</option>
              </Select>
            </Field>
            <Field label="Kural">
              <Select value={riskRuleKey} onChange={(e) => setRiskRuleKey(e.target.value)}>
                <option value="">Tüm Kurallar</option>
                {(Object.keys(RULE_LABELS) as RiskRuleKey[]).map((rk) => (
                  <option key={rk} value={rk}>
                    {RULE_LABELS[rk]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5 border-t border-[#E2E8F0] pt-4">
            <Button
              variant="primary"
              disabled={busyKey !== null}
              onClick={() =>
                handleDownload(
                  "risk-pdf",
                  `/reports/risks.pdf${buildRisksQuery()}`,
                  "factoryguard-risks.pdf",
                )
              }
            >
              {busyKey === "risk-pdf" ? "Hazırlanıyor…" : "Risk Raporu PDF İndir"}
            </Button>
            <Button
              variant="secondary"
              disabled={busyKey !== null}
              onClick={() =>
                handleDownload(
                  "risk-csv",
                  `/reports/risks.csv${buildRisksQuery()}`,
                  "factoryguard-risks.csv",
                )
              }
            >
              {busyKey === "risk-csv" ? "Hazırlanıyor…" : "Risk Bulguları CSV İndir"}
            </Button>
            <Button
              variant="outline"
              disabled={busyKey !== null}
              onClick={() =>
                handleDownload(
                  "risk-cef",
                  `/reports/risks.cef${buildRisksQuery()}`,
                  "factoryguard-risks.cef",
                )
              }
            >
              {busyKey === "risk-cef" ? "Hazırlanıyor…" : "SIEM (CEF) Dışa Aktar"}
            </Button>
          </div>
        </Card>
      </div>

      {/* Canlı Yönetici Özeti Dağılım Kartları */}
      {s && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Cihaz Türü Dağılımı" subtitle="Envanterdeki endüstriyel rol kırılımı">
            <div className="space-y-2 text-xs">
              {Object.entries(s.assets.by_type).map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center justify-between border-b border-[#E2E8F0] pb-2"
                >
                  <span className="font-medium text-slate-700">
                    {ASSET_TYPE_LABEL[type as AssetType] ?? type}
                  </span>
                  <span className="font-mono font-bold text-[#1C2434]">{count}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Risk Önem Derecesi Dağılımı" subtitle="Tüm bulguların kritiklik özeti">
            <div className="space-y-2.5 text-xs">
              {(["critical", "high", "medium", "low"] as Criticality[]).map((sev) => (
                <div
                  key={sev}
                  className="flex items-center justify-between border-b border-[#E2E8F0] pb-2"
                >
                  <CriticalityBadge value={sev} />
                  <span className="font-mono font-bold text-[#1C2434]">
                    {s.risks.by_severity[sev] ?? 0}
                  </span>
                </div>
              ))}
              <div className="pt-1 text-[11px] text-slate-500">
                Durum özeti:{" "}
                {(Object.keys(STATUS_LABELS) as RiskStatus[])
                  .map((st) => `${STATUS_LABELS[st]}: ${s.risks.by_status[st] ?? 0}`)
                  .join(" · ")}
              </div>
            </div>
          </Card>

          <Card title="Tetiklenen Kural Özeti" subtitle="Deterministik kurallara göre bulgular">
            <div className="space-y-2 text-xs">
              {(Object.keys(RULE_LABELS) as RiskRuleKey[]).map((rk) => (
                <div
                  key={rk}
                  className="flex items-center justify-between border-b border-[#E2E8F0] pb-2"
                >
                  <span className="text-slate-700">{RULE_LABELS[rk]}</span>
                  <span className="font-mono font-bold text-[#1C2434]">
                    {s.risks.by_rule[rk] ?? 0}
                  </span>
                </div>
              ))}
              <div className="pt-1 text-[11px] text-slate-500">
                Son hesaplama: {formatDate(s.generated_at)} · Kapsam:{" "}
                {s.site_name ?? "Tüm Fabrikalar"} ({CRITICALITY_LABEL.high} /{" "}
                {CRITICALITY_LABEL.critical} öncelikli)
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
