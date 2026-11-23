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
import { bi, useLang } from "../i18n";
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

const RULE_LABELS: Record<RiskRuleKey, string> = bi({
  NEW_ASSET: ["Yeni / Doğrulanmamış Cihaz", "New / Unverified Device"],
  UNKNOWN_OT_ASSET: ["Doğrulanmamış OT Cihazı", "Unverified OT Device"],
  UNEXPECTED_COMMUNICATION: ["Beklenmeyen İletişim", "Unexpected Communication"],
  UNAPPROVED_REMOTE_PATH: ["Onaysız Uzaktan Erişim", "Unapproved Remote Access"],
  KNOWN_VULNERABILITY: ["Doğrulanmış Zafiyet (CVE)", "Verified Vulnerability (CVE)"],
  ASSET_NOT_SEEN: ["Uzun Süredir Gözlemlenmeyen Cihaz", "Device Not Seen Recently"],
});

const STATUS_LABELS: Record<RiskStatus, string> = bi({
  open: ["Açık", "Open"],
  investigating: ["İnceleniyor", "Investigating"],
  accepted: ["Kabul Edildi", "Accepted"],
  resolved: ["Çözüldü", "Resolved"],
  false_positive: ["Yanlış Alarm", "False Positive"],
});

export default function ReportsPage() {
  const { activeOrg } = useAuth();
  const { t } = useLang();
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
        breadcrumb={t("Raporlar & SIEM", "Reports & SIEM")}
        title={t("Kurumsal Denetim Raporları & SIEM Dışa Aktarım", "Enterprise Audit Reports & SIEM Export")}
        subtitle={t(
          "ISO/IEC 62443 denetimleri için PDF/CSV envanter raporları, açıklanabilir risk çıktıları ve SIEM CEF akışı",
          "PDF/CSV inventory reports, explainable risk exports and SIEM CEF feeds for ISO/IEC 62443 audits",
        )}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              onClick={() => window.print()}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>{t("Yönetici & IEC 62443 Özetini Yazdır", "Print Executive & IEC 62443 Brief")}</span>
            </Button>
            <div className="w-56">
              <Select
                aria-label={t("Fabrika kapsamı", "Site scope")}
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  setInvZoneId("");
                }}
              >
                <option value="">{t("Tüm Fabrikalar", "All Sites")}</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        }
      />

      <ErrorBox error={downloadErr || summaryQuery.error} />

      {/* 4 TailAdmin StatCard — Canlı Yönetici Özeti */}
      {s && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t("Rapor Kapsamındaki Varlık", "Assets in Report Scope")}
            value={s.assets.total}
            hint={t(
              `Doğrulanan: ${s.assets.verified} · Bekleyen: ${s.assets.unverified}`,
              `Verified: ${s.assets.verified} · Pending: ${s.assets.unverified}`,
            )}
            tone="teal"
            badge={{
              text: s.site_name ?? t("Tüm Tesisler", "All Sites"),
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
            label={t("Kritik / Yüksek Riskler", "Critical / High Risks")}
            value={
              (s.risks.by_severity.critical ?? 0) + (s.risks.by_severity.high ?? 0)
            }
            hint={t(
              `Kritik: ${s.risks.by_severity.critical ?? 0} · Yüksek: ${s.risks.by_severity.high ?? 0}`,
              `Critical: ${s.risks.by_severity.critical ?? 0} · High: ${s.risks.by_severity.high ?? 0}`,
            )}
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
            label={t("Açık Risk Bulgusu", "Open Risk Findings")}
            value={s.risks.open_total}
            hint={t(
              `Toplam kayıt: ${s.risks.total} · Maks puan: ${s.risks.max_score}`,
              `Total findings: ${s.risks.total} · Max score: ${s.risks.max_score}`,
            )}
            tone="amber"
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            }
          />

          <StatCard
            label={t("Gözlemlenen İletişim Akışı", "Observed Network Flows")}
            value={s.communications.total_flows}
            hint={t(
              `${s.sensors.active}/${s.sensors.total} aktif sensör`,
              `${s.sensors.active}/${s.sensors.total} active sensors`,
            )}
            tone="navy"
            badge={{ text: t("SIEM CEF Hazır", "SIEM CEF Ready"), tone: "teal" }}
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
          title={t("1. OT Cihaz Envanteri Raporu (CSV / PDF)", "1. OT Device Inventory Report (CSV / PDF)")}
          subtitle={t(
            "Keşfedilen varlıkları bölge, Purdue katmanı, üretici, protokol ve doğrulama durumuyla dışa aktarın",
            "Export discovered assets with zone, Purdue level, vendor, protocol and verification status",
          )}
          actions={<Badge tone="teal">{t("ISO/IEC 62443 Envanter", "ISO/IEC 62443 Inventory")}</Badge>}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("Bölge", "Zone")}>
              <Select value={invZoneId} onChange={(e) => setInvZoneId(e.target.value)}>
                <option value="">{t("Tüm Bölgeler", "All Zones")}</option>
                {filteredZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Kritiklik", "Criticality")}>
              <Select
                value={invCriticality}
                onChange={(e) => setInvCriticality(e.target.value)}
              >
                <option value="">{t("Tümü", "All")}</option>
                <option value="critical">{CRITICALITY_LABEL.critical}</option>
                <option value="high">{CRITICALITY_LABEL.high}</option>
                <option value="medium">{CRITICALITY_LABEL.medium}</option>
                <option value="low">{CRITICALITY_LABEL.low}</option>
              </Select>
            </Field>
            <Field label={t("Doğrulama", "Verification")}>
              <Select value={invVerified} onChange={(e) => setInvVerified(e.target.value)}>
                <option value="">{t("Tümü", "All")}</option>
                <option value="true">{t("Doğrulanmış", "Verified")}</option>
                <option value="false">{t("Doğrulanmamış", "Unverified")}</option>
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
              {busyKey === "inv-pdf"
                ? t("Hazırlanıyor…", "Generating…")
                : t("Envanter PDF İndir", "Download Inventory PDF")}
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
              {busyKey === "inv-csv"
                ? t("Hazırlanıyor…", "Generating…")
                : t("Envanter CSV İndir", "Download Inventory CSV")}
            </Button>
          </div>
        </Card>

        <Card
          title={t("2. Açıklanabilir Risk & SIEM Raporu (PDF / CSV / CEF)", "2. Explainable Risk & SIEM Report (PDF / CSV / CEF)")}
          subtitle={t(
            "Yönetici özeti, bulgu kanıtları, çözüm önerileri ve kurumsal SIEM sistemleri için CEF çıktısı",
            "Executive summary, finding evidence, remediation steps and CEF export for enterprise SIEMs",
          )}
          actions={<Badge tone="navy">{t("SIEM & Denetim", "SIEM & Audit")}</Badge>}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("Durum", "Status")}>
              <Select value={riskStatus} onChange={(e) => setRiskStatus(e.target.value)}>
                <option value="">{t("Tümü", "All")}</option>
                {(Object.keys(STATUS_LABELS) as RiskStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Önem Derecesi", "Severity")}>
              <Select value={riskSeverity} onChange={(e) => setRiskSeverity(e.target.value)}>
                <option value="">{t("Tümü", "All")}</option>
                <option value="critical">{CRITICALITY_LABEL.critical}</option>
                <option value="high">{CRITICALITY_LABEL.high}</option>
                <option value="medium">{CRITICALITY_LABEL.medium}</option>
                <option value="low">{CRITICALITY_LABEL.low}</option>
              </Select>
            </Field>
            <Field label={t("Kural", "Rule")}>
              <Select value={riskRuleKey} onChange={(e) => setRiskRuleKey(e.target.value)}>
                <option value="">{t("Tüm Kurallar", "All Rules")}</option>
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
              {busyKey === "risk-pdf"
                ? t("Hazırlanıyor…", "Generating…")
                : t("Risk Raporu PDF İndir", "Download Risk PDF")}
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
              {busyKey === "risk-csv"
                ? t("Hazırlanıyor…", "Generating…")
                : t("Risk Bulguları CSV İndir", "Download Risk CSV")}
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
              {busyKey === "risk-cef"
                ? t("Hazırlanıyor…", "Generating…")
                : t("SIEM (CEF) Dışa Aktar", "Export SIEM (CEF)")}
            </Button>
          </div>
        </Card>
      </div>

      {/* IEC 62443-3-3 & NIST SP 800-82 Endüstriyel Uyumluluk Matrisi (FR1–FR7) */}
      {s && (
        <Card
          title={t(
            "IEC 62443-3-3 & NIST SP 800-82 Endüstriyel Uyumluluk Matrisi (FR1 – FR7)",
            "IEC 62443-3-3 & NIST SP 800-82 Industrial Compliance Matrix (FR1 – FR7)",
          )}
          subtitle={t(
            "Canlı fabrika envanteri, ağ segmentasyonu ve açık risk bulgularına göre 7 Temel Gereksinim (Foundational Requirements) değerlendirmesi",
            "Live assessment of the 7 Foundational Requirements based on plant inventory, network segmentation and open risk findings",
          )}
          actions={
            <Badge
              tone={
                (s.risks.by_severity.critical ?? 0) === 0 && s.assets.verified >= s.assets.unverified
                  ? "emerald"
                  : "amber"
              }
              dot
            >
              {t(
                `Hedef Güvenlik Seviyesi: SL-2 / Mevcut: ${
                  (s.risks.by_severity.critical ?? 0) === 0 ? "SL-2 Uyumlu" : "SL-1 (İyileştirme Gerekli)"
                }`,
                `Target Security Level: SL-2 / Current: ${
                  (s.risks.by_severity.critical ?? 0) === 0 ? "SL-2 Compliant" : "SL-1 (Action Required)"
                }`,
              )}
            </Badge>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                code: "FR 1 · IAC",
                title: t("Kimlik Doğrulama & Envanter", "Identification & Auth Control"),
                score:
                  s.assets.total > 0
                    ? Math.round((s.assets.verified / s.assets.total) * 100)
                    : 100,
                detail: t(
                  `${s.assets.verified}/${s.assets.total} OT varlığı doğrulandı (Yeni cihaz bulgusu: ${s.risks.by_rule.NEW_ASSET ?? 0})`,
                  `${s.assets.verified}/${s.assets.total} OT assets verified (New asset findings: ${s.risks.by_rule.NEW_ASSET ?? 0})`,
                ),
              },
              {
                code: "FR 2 · UC",
                title: t("Kullanım & Uzaktan Erişim Kontrolü", "Use & Remote Access Control"),
                score: (s.risks.by_rule.UNAPPROVED_REMOTE_PATH ?? 0) === 0 ? 100 : 45,
                detail: t(
                  `Onaysız uzaktan erişim (RDP/SSH/VNC) bulgusu: ${s.risks.by_rule.UNAPPROVED_REMOTE_PATH ?? 0}`,
                  `Unapproved remote access (RDP/SSH/VNC) findings: ${s.risks.by_rule.UNAPPROVED_REMOTE_PATH ?? 0}`,
                ),
              },
              {
                code: "FR 3 · SI",
                title: t("Sistem Bütünlüğü & Zafiyet (CVE)", "System Integrity & Patching"),
                score: (s.risks.by_rule.KNOWN_VULNERABILITY ?? 0) === 0 ? 95 : 40,
                detail: t(
                  `ICS-CERT / CVE doğrulanmış zafiyet bulgusu: ${s.risks.by_rule.KNOWN_VULNERABILITY ?? 0}`,
                  `ICS-CERT / CVE verified vulnerability findings: ${s.risks.by_rule.KNOWN_VULNERABILITY ?? 0}`,
                ),
              },
              {
                code: "FR 5 · RDF",
                title: t("Kısıtlı Veri Akışı (Zone & Conduit)", "Restricted Data Flow (Conduits)"),
                score: (s.risks.by_rule.UNEXPECTED_COMMUNICATION ?? 0) === 0 ? 92 : 55,
                detail: t(
                  `${s.communications.total_flows} akış izleniyor · Beklenmeyen akış bulgusu: ${s.risks.by_rule.UNEXPECTED_COMMUNICATION ?? 0}`,
                  `${s.communications.total_flows} flows monitored · Unexpected flow findings: ${s.risks.by_rule.UNEXPECTED_COMMUNICATION ?? 0}`,
                ),
              },
            ].map((fr) => {
              const toneColor =
                fr.score >= 80
                  ? "border-t-emerald-500 text-emerald-600 dark:text-emerald-400"
                  : fr.score >= 50
                    ? "border-t-amber-500 text-amber-600 dark:text-amber-400"
                    : "border-t-rose-500 text-rose-600 dark:text-rose-400";
              return (
                <div
                  key={fr.code}
                  className={`rounded-[6px] border border-[#CBD5E1] border-t-2 bg-[#F8FAFC] p-4 dark:border-[#1E293B] dark:bg-[#161F30] ${toneColor}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold uppercase">{fr.code}</span>
                    <span className="font-mono text-sm font-bold">%{fr.score}</span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-[#1C2434]">{fr.title}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">{fr.detail}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Canlı Yönetici Özeti Dağılım Kartları */}
      {s && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card
            title={t("Cihaz Türü Dağılımı", "Device Type Distribution")}
            subtitle={t("Envanterdeki endüstriyel rol kırılımı", "Industrial role breakdown across inventory")}
          >
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

          <Card
            title={t("Risk Önem Derecesi Dağılımı", "Risk Severity Distribution")}
            subtitle={t("Tüm bulguların kritiklik özeti", "Severity summary across all findings")}
          >
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
                {t("Durum özeti", "Status summary")}:{" "}
                {(Object.keys(STATUS_LABELS) as RiskStatus[])
                  .map((st) => `${STATUS_LABELS[st]}: ${s.risks.by_status[st] ?? 0}`)
                  .join(" · ")}
              </div>
            </div>
          </Card>

          <Card
            title={t("Tetiklenen Kural Özeti", "Triggered Rule Summary")}
            subtitle={t("Deterministik kurallara göre bulgular", "Findings grouped by deterministic rule")}
          >
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
                {t("Son hesaplama", "Last generated")}: {formatDate(s.generated_at)} ·{" "}
                {s.site_name ?? t("Tüm Fabrikalar", "All Sites")}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
