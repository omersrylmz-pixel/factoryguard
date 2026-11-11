import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ASSET_TYPE_LABEL,
  Button,
  Card,
  CRITICALITY_LABEL,
  CriticalityBadge,
  ErrorBox,
  Field,
  PageHeader,
  Select,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api, apiDownload } from "../services/api";
import type { AssetType, Criticality, ReportSummary, RiskRuleKey, RiskStatus, Site, Zone } from "../types/api";

const RULE_LABELS: Record<RiskRuleKey, string> = {
  NEW_ASSET: "Yeni / Doğrulanmamış Cihaz",
  UNKNOWN_OT_ASSET: "Doğrulanmamış OT Cihazı",
  UNEXPECTED_COMMUNICATION: "Beklenmeyen İletişim",
  UNAPPROVED_REMOTE_PATH: "Onaysız Uzaktan Erişim",
  KNOWN_VULNERABILITY: "Doğrulanmış Zafiyet (CVE)",
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

  const summaryParams = new URLSearchParams();
  if (siteId) summaryParams.set("site_id", siteId);

  const summaryQuery = useQuery({
    queryKey: ["report-summary", activeOrg?.id, siteId],
    queryFn: () =>
      api<ReportSummary>(
        `/reports/summary${summaryParams.toString() ? `?${summaryParams.toString()}` : ""}`,
      ),
    enabled: !!activeOrg,
  });

  async function handleInventoryExport(format: "csv" | "pdf") {
    setDownloadErr(null);
    const key = `inv-${format}`;
    setBusyKey(key);
    try {
      const p = new URLSearchParams({ format });
      if (siteId) p.set("site_id", siteId);
      if (invZoneId) p.set("zone_id", invZoneId);
      if (invCriticality) p.set("criticality", invCriticality);
      if (invVerified !== "") p.set("is_verified", invVerified);
      await apiDownload(`/reports/inventory?${p.toString()}`, `factoryguard-envanter.${format}`);
    } catch (err) {
      setDownloadErr(err);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRisksExport(format: "csv" | "pdf") {
    setDownloadErr(null);
    const key = `risk-${format}`;
    setBusyKey(key);
    try {
      const p = new URLSearchParams({ format });
      if (siteId) p.set("site_id", siteId);
      if (riskStatus) p.set("status", riskStatus);
      if (riskSeverity) p.set("severity", riskSeverity);
      if (riskRuleKey) p.set("rule_key", riskRuleKey);
      await apiDownload(`/reports/risks?${p.toString()}`, `factoryguard-risk-raporu.${format}`);
    } catch (err) {
      setDownloadErr(err);
    } finally {
      setBusyKey(null);
    }
  }

  const s = summaryQuery.data;
  const visibleZones = (zonesQuery.data ?? []).filter((z) => !siteId || z.site_id === siteId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raporlar ve Dışa Aktarma"
        subtitle="Yönetici özeti, OT cihaz envanteri ve açıklanabilir risk bulgularını CSV veya PDF olarak dışa aktarın."
        actions={
          <div className="w-60">
            <Select
              aria-label="Fabrika Kapsamı"
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setInvZoneId("");
              }}
            >
              <option value="">Tüm Fabrikalar</option>
              {(sitesQuery.data ?? []).map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {downloadErr != null && <ErrorBox error={downloadErr} />}
      {summaryQuery.error != null && <ErrorBox error={summaryQuery.error} />}

      {/* Dışa Aktarma Kartları */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="1. OT Cihaz Envanteri Raporu"
          actions={<span className="text-xs text-slate-500">CSV (UTF-8 BOM) &amp; A4 PDF</span>}
        >
          <p className="mb-4 text-xs text-slate-600">
            Pasif ağ gözlemleriyle keşfedilen ve doğrulanmış tüm varlıkları; IP/MAC, kanıta dayalı
            sınıflandırma etiketi, güven yüzdesi, bölge ve gözlemlenen protokollerle birlikte dışa aktarır.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Bölge">
              <Select value={invZoneId} onChange={(e) => setInvZoneId(e.target.value)}>
                <option value="">Tüm Bölgeler</option>
                {visibleZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kritiklik">
              <Select value={invCriticality} onChange={(e) => setInvCriticality(e.target.value)}>
                <option value="">Tümü</option>
                <option value="critical">Kritik</option>
                <option value="high">Yüksek</option>
                <option value="medium">Orta</option>
                <option value="low">Düşük</option>
              </Select>
            </Field>
            <Field label="Doğrulama Durumu">
              <Select value={invVerified} onChange={(e) => setInvVerified(e.target.value)}>
                <option value="">Tümü</option>
                <option value="true">Doğrulanmış</option>
                <option value="false">Doğrulanmamış</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button
              variant="secondary"
              disabled={busyKey !== null}
              onClick={() => void handleInventoryExport("csv")}
            >
              {busyKey === "inv-csv" ? "CSV Hazırlanıyor…" : "Envanter CSV İndir"}
            </Button>
            <Button
              disabled={busyKey !== null}
              onClick={() => void handleInventoryExport("pdf")}
            >
              {busyKey === "inv-pdf" ? "PDF Hazırlanıyor…" : "Envanter PDF İndir"}
            </Button>
          </div>
        </Card>

        <Card
          title="2. Yönetici ve Teknik Risk Raporu"
          actions={<span className="text-xs text-slate-500">CSV (UTF-8 BOM) &amp; A4 PDF</span>}
        >
          <p className="mb-4 text-xs text-slate-600">
            Üst yönetim için özet metrikleri ve saha/OT mühendisleri için her bulgunun{" "}
            <span className="font-medium">Ne Gözlendi, Neden Önemli, Puan Kırılımı ve Önerilen Aksiyon</span>{" "}
            detaylarını içerir.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Bulgu Durumu">
              <Select value={riskStatus} onChange={(e) => setRiskStatus(e.target.value)}>
                <option value="">Tümü</option>
                <option value="open">Açık</option>
                <option value="investigating">İnceleniyor</option>
                <option value="accepted">Kabul Edildi</option>
                <option value="resolved">Çözüldü</option>
                <option value="false_positive">Yanlış Pozitif</option>
              </Select>
            </Field>
            <Field label="Ciddiyet">
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
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button
              variant="secondary"
              disabled={busyKey !== null}
              onClick={() => void handleRisksExport("csv")}
            >
              {busyKey === "risk-csv" ? "CSV Hazırlanıyor…" : "Risk Bulguları CSV İndir"}
            </Button>
            <Button
              disabled={busyKey !== null}
              onClick={() => void handleRisksExport("pdf")}
            >
              {busyKey === "risk-pdf" ? "PDF Hazırlanıyor…" : "Yönetici + Teknik PDF İndir"}
            </Button>
          </div>
        </Card>
      </div>

      {/* Canlı Yönetici Özeti Önizlemesi */}
      {s && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Toplam Varlık (Doğrulanmış / Bekleyen)</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {s.assets.total}{" "}
                <span className="text-sm font-normal text-slate-500">
                  ({s.assets.verified} / {s.assets.unverified})
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Aktif Risk Bulgusu (Maks. Puan)</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {s.risks.open_total}{" "}
                <span className="text-sm font-normal text-slate-500">
                  (Maks: {s.risks.max_score}/100 · Ort: {s.risks.avg_open_score})
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Gözlenen İletişim Akışı (Bölgeler Arası)</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {s.communications.total_flows}{" "}
                <span className="text-sm font-normal text-amber-700">
                  ({s.communications.cross_zone_flows} bölgeler arası)
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Pasif Sensör Durumu</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {s.sensors.active} aktif{" "}
                <span className="text-sm font-normal text-slate-500">
                  / {s.sensors.total} toplam ({s.sensors.offline} çevrimdışı)
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card title="Cihaz Türü Dağılımı">
              <div className="space-y-2 text-sm">
                {Object.entries(s.assets.by_type).length === 0 ? (
                  <div className="text-xs text-slate-500">Henüz cihaz kaydı yok.</div>
                ) : (
                  Object.entries(s.assets.by_type).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-slate-700">
                        {ASSET_TYPE_LABEL[type as AssetType] ?? type}
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-900">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card title="Aktif Risk Ciddiyet Dağılımı">
              <div className="space-y-2 text-sm">
                {(["critical", "high", "medium", "low"] as Criticality[]).map((sev) => (
                  <div key={sev} className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <CriticalityBadge value={sev} />
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {s.risks.by_severity[sev] ?? 0}
                    </span>
                  </div>
                ))}
                <div className="pt-2 text-xs text-slate-500">
                  Durum özeti:{" "}
                  {(Object.keys(STATUS_LABELS) as RiskStatus[])
                    .map((st) => `${STATUS_LABELS[st]}: ${s.risks.by_status[st] ?? 0}`)
                    .join(" · ")}
                </div>
              </div>
            </Card>

            <Card title="Kural ve Protokol Özeti">
              <div className="space-y-2 text-sm">
                {(Object.keys(RULE_LABELS) as RiskRuleKey[]).map((rk) => (
                  <div key={rk} className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-xs text-slate-700">{RULE_LABELS[rk]}</span>
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {s.risks.by_rule[rk] ?? 0}
                    </span>
                  </div>
                ))}
                <div className="pt-2 text-xs text-slate-500">
                  Son hesaplama: {formatDate(s.generated_at)} · Kapsam:{" "}
                  {s.site_name ?? "Tüm Fabrikalar"} ({CRITICALITY_LABEL.high} / {CRITICALITY_LABEL.critical} öncelikli)
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
