import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  Badge,
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
  StatCard,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { bi, useLang } from "../i18n";
import { api } from "../services/api";
import type {
  Criticality,
  Page,
  RiskBulkStatusResult,
  RiskFinding,
  RiskPosture,
  RiskRuleKey,
  RiskRulesCatalog,
  RiskStatus,
  VulnerabilityCatalogItem,
} from "../types/api";

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = bi({
  open: ["Açık", "Open"],
  investigating: ["İnceleniyor", "Investigating"],
  accepted: ["Kabul Edildi", "Accepted"],
  resolved: ["Çözüldü", "Resolved"],
  false_positive: ["Yanlış Alarm", "False Positive"],
});

export const RISK_RULE_LABEL: Record<RiskRuleKey, string> = bi({
  NEW_ASSET: ["NEW_ASSET · Yeni Keşfedilen Cihaz", "NEW_ASSET · Newly Discovered Device"],
  UNKNOWN_OT_ASSET: ["UNKNOWN_OT_ASSET · Doğrulanmamış Endüstriyel Cihaz", "UNKNOWN_OT_ASSET · Unverified Industrial Device"],
  UNEXPECTED_COMMUNICATION: ["UNEXPECTED_COMMUNICATION · Beklenmeyen İletişim", "UNEXPECTED_COMMUNICATION · Unexpected Communication"],
  UNAPPROVED_REMOTE_PATH: ["UNAPPROVED_REMOTE_PATH · Onaylanmamış Uzaktan Erişim", "UNAPPROVED_REMOTE_PATH · Unapproved Remote Access"],
  KNOWN_VULNERABILITY: ["KNOWN_VULNERABILITY · Bilinen Güvenlik Açığı", "KNOWN_VULNERABILITY · Known Vulnerability"],
  ASSET_NOT_SEEN: ["ASSET_NOT_SEEN · Uzun Süredir Gözlemlenmeyen Cihaz", "ASSET_NOT_SEEN · Device Not Seen Recently"],
});

function statusTone(st: RiskStatus): "red" | "amber" | "teal" | "emerald" | "slate" {
  switch (st) {
    case "open":
      return "red";
    case "investigating":
      return "amber";
    case "accepted":
      return "teal";
    case "resolved":
      return "emerald";
    case "false_positive":
      return "slate";
  }
}

export default function RisksPage() {
  const { activeOrg, canAdmin, canEditAssets } = useAuth();
  const { t } = useLang();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [ruleFilter, setRuleFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [showRulesCatalog, setShowRulesCatalog] = useState(false);
  const [showCveCatalog, setShowCveCatalog] = useState(false);

  // Yeni CVE ekleme formu
  const [cveId, setCveId] = useState("");
  const [cveVendor, setCveVendor] = useState("");
  const [cveProduct, setCveProduct] = useState("");
  const [cveVersion, setCveVersion] = useState("");
  const [cveCvss, setCveCvss] = useState("8.8");
  const [cveDesc, setCveDesc] = useState("");
  const [cveRec, setCveRec] = useState("");

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (severityFilter) params.set("severity", severityFilter);
  if (ruleFilter) params.set("rule_key", ruleFilter);
  params.set("limit", "200");

  const risksQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, params.toString()],
    queryFn: () => api<Page<RiskFinding>>(`/risks?${params.toString()}`),
    enabled: !!activeOrg,
  });

  const postureQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "posture"],
    queryFn: () => api<RiskPosture>("/risks/posture"),
    enabled: !!activeOrg,
  });

  const rulesCatalogQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "rules-catalog"],
    queryFn: () => api<RiskRulesCatalog>("/risks/rules"),
    enabled: !!activeOrg,
  });

  const cveCatalogQuery = useQuery({
    queryKey: ["vulnerabilities-catalog", activeOrg?.id],
    queryFn: () => api<VulnerabilityCatalogItem[]>("/vulnerabilities/catalog"),
    enabled: !!activeOrg,
  });

  const addCveMut = useMutation({
    mutationFn: (body: {
      cve_id: string;
      vendor: string;
      product: string;
      version_exact: string;
      cvss: number;
      description: string;
      recommendation: string | null;
    }) => api<VulnerabilityCatalogItem>("/vulnerabilities/catalog", { method: "POST", body }),
    onSuccess: async () => {
      setCveId("");
      setCveVendor("");
      setCveProduct("");
      setCveVersion("");
      setCveDesc("");
      setCveRec("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["vulnerabilities-catalog", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] }),
      ]);
    },
  });

  const evalMut = useMutation({
    mutationFn: () => api<Record<string, number>>("/risks/evaluate", { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] });
    },
  });

  const statusMut = useMutation({
    mutationFn: (args: { id: string; status: RiskStatus; resolution_note?: string }) =>
      api<RiskFinding>(`/risks/${args.id}/status`, {
        method: "PATCH",
        body: { status: args.status, resolution_note: args.resolution_note || null },
      }),
    onSuccess: async () => {
      setNote("");
      await qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] });
    },
  });

  const bulkStatusMut = useMutation({
    mutationFn: (args: { finding_ids: string[]; status: RiskStatus; resolution_note?: string }) =>
      api<RiskBulkStatusResult>("/risks/bulk-status", {
        method: "POST",
        body: args,
      }),
    onSuccess: async () => {
      setCheckedIds([]);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] });
    },
  });

  const findings = risksQuery.data?.items ?? [];
  const selected = findings.find((f) => f.id === selectedId) ?? findings[0] ?? null;
  const posture = postureQuery.data;
  const rulesList = rulesCatalogQuery.data?.rules ?? [];

  const breakdownLabels: Record<string, { label: string; max: number }> = {
    production_criticality: {
      label: t("Üretim Kritiklik Seviyesi", "Production Criticality"),
      max: 30,
    },
    network_exposure: {
      label: t("Ağ Erişilebilirliği ve Maruziyet", "Network Exposure"),
      max: 25,
    },
    verified_vulnerability: {
      label: t("Doğrulanmış Güvenlik Açığı", "Verified Vulnerability"),
      max: 25,
    },
    unexpected_behavior: {
      label: t("Beklenmeyen Davranış / İletişim", "Unexpected Behavior / Flow"),
      max: 10,
    },
    inventory_gap: {
      label: t("Envanter Doğrulama Eksikliği", "Inventory Verification Gap"),
      max: 10,
    },
  };

  function toggleChecked(id: string) {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleAddCve(e: FormEvent) {
    e.preventDefault();
    if (!cveId.trim() || !cveVendor.trim() || !cveProduct.trim() || !cveVersion.trim()) return;
    addCveMut.mutate({
      cve_id: cveId.trim().toUpperCase(),
      vendor: cveVendor.trim(),
      product: cveProduct.trim(),
      version_exact: cveVersion.trim(),
      cvss: Math.min(10, Math.max(0, Number(cveCvss) || 7.5)),
      description: cveDesc.trim() || t("Endüstriyel firmware güvenlik açığı", "Industrial firmware vulnerability"),
      recommendation: cveRec.trim() || null,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={t("Olaylar & Risk Bulguları", "Events & Risk Findings")}
        title={t("Olaylar, Gözlemler & Açıklanabilir Risk Merkezi", "Events, Observations & Explainable Risk Center")}
        subtitle={t(
          "Her bulgunun teknik kanıtı, tetiklenen deterministik kuralı ve önerilen müdahale adımı",
          "Technical evidence, triggered deterministic rule and recommended remediation for every finding",
        )}
        actions={
          <>
            <Button
              variant={showCveCatalog ? "outline" : "secondary"}
              onClick={() => setShowCveCatalog((v) => !v)}
            >
              {showCveCatalog
                ? t("CVE Kataloğunu Gizle", "Hide CVE Catalog")
                : t(
                    `ICS-CERT / CVE Kataloğu (${cveCatalogQuery.data?.length ?? 0})`,
                    `ICS-CERT / CVE Catalog (${cveCatalogQuery.data?.length ?? 0})`,
                  )}
            </Button>
            <Button
              variant={showRulesCatalog ? "outline" : "secondary"}
              onClick={() => setShowRulesCatalog((v) => !v)}
            >
              {showRulesCatalog
                ? t("Kural Kataloğunu Gizle", "Hide Rule Catalog")
                : t("Deterministik Kural Kataloğu (6)", "Deterministic Rule Catalog (6)")}
            </Button>
            {canEditAssets && (
              <Button
                variant="primary"
                disabled={evalMut.isPending}
                onClick={() => evalMut.mutate()}
              >
                {evalMut.isPending
                  ? t("Hesaplanıyor…", "Evaluating…")
                  : t("Risk Motorunu Çalıştır", "Run Risk Engine")}
              </Button>
            )}
          </>
        }
      />

      {/* 4 TailAdmin StatCard — Fabrika Güvenlik Duruşu & Risk Özeti */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("Güvenlik Duruş Skoru", "Security Posture Score")}
          value={posture ? `${posture.health_score}/100` : "—"}
          hint={
            posture
              ? t(
                  `%${Math.round(posture.verified_asset_ratio * 100)} doğrulanmış varlık`,
                  `${Math.round(posture.verified_asset_ratio * 100)}% verified assets`,
                )
              : t("Hesaplanıyor…", "Calculating…")
          }
          tone={
            !posture
              ? "teal"
              : posture.health_score >= 85
                ? "emerald"
                : posture.health_score >= 65
                  ? "amber"
                  : "red"
          }
          badge={
            posture
              ? {
                  text: t(`Derece ${posture.grade}`, `Grade ${posture.grade}`),
                  tone:
                    posture.health_score >= 85
                      ? "emerald"
                      : posture.health_score >= 65
                        ? "amber"
                        : "red",
                }
              : undefined
          }
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />

        <StatCard
          label={t("Kritik & Yüksek Bulgular", "Critical & High Findings")}
          value={posture ? posture.open_critical + posture.open_high : "—"}
          hint={
            posture
              ? t(
                  `${posture.open_critical} Kritik · ${posture.open_high} Yüksek`,
                  `${posture.open_critical} Critical · ${posture.open_high} High`,
                )
              : t("Açık bulgular", "Open findings")
          }
          tone={
            posture && posture.open_critical + posture.open_high > 0 ? "red" : "emerald"
          }
          badge={{
            text: t("Öncelikli Müdahale", "Priority Action"),
            tone: posture && posture.open_critical + posture.open_high > 0 ? "red" : "emerald",
          }}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />

        <StatCard
          label={t("Orta & Düşük Bulgular", "Medium & Low Findings")}
          value={posture ? posture.open_medium + posture.open_low : "—"}
          hint={
            posture
              ? t(
                  `${posture.open_medium} Orta · ${posture.open_low} Düşük`,
                  `${posture.open_medium} Medium · ${posture.open_low} Low`,
                )
              : t("İzlenen bulgular", "Monitored findings")
          }
          tone="amber"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
        />

        <StatCard
          label={t("Aktif Deterministik Kural", "Active Deterministic Rules")}
          value={rulesList.length || 6}
          hint="FG-RULE-001 .. FG-RULE-006"
          tone="teal"
          badge={{ text: t("Kanıta Dayalı", "Evidence-Based"), tone: "teal" }}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        />
      </div>

      {/* Deterministik 6 Kural Kataloğu */}
      {showRulesCatalog && rulesList.length > 0 && (
        <Card
          title={t(
            `Deterministik OT Risk Kural Kataloğu (${rulesList.length} Aktif Kural)`,
            `Deterministic OT Risk Rule Catalog (${rulesList.length} Active Rules)`,
          )}
          subtitle={t(
            "Kara kutu tahmin değil; kanıta dayalı deterministik endüstriyel güvenlik kuralları",
            "Evidence-based deterministic industrial security rules without black-box guessing",
          )}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rulesList.map((r) => (
              <div
                key={r.rule_id}
                className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-[#0D9488]">{r.rule_id}</span>
                  <Badge tone="teal">{r.finding_category}</Badge>
                </div>
                <div className="mt-1.5 font-semibold text-[#1C2434]">{r.name}</div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-500">{r.rule_key}</div>
                <p className="mt-2 leading-relaxed text-slate-600">{r.triggering_condition}</p>
                <div className="mt-2 border-t border-[#E2E8F0] pt-1.5 text-[11px] text-slate-700">
                  {r.description}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ICS-CERT / CVE Endüstriyel Zafiyet Kataloğu & Firmware Eşleştirme */}
      {showCveCatalog && (
        <Card
          title={t(
            `Endüstriyel Zafiyet Kataloğu (ICS-CERT / CVE) — ${cveCatalogQuery.data?.length ?? 0} Kayıt`,
            `Industrial Vulnerability Catalog (ICS-CERT / CVE) — ${cveCatalogQuery.data?.length ?? 0} Advisories`,
          )}
          subtitle={t(
            "Üretici, model ve tam firmware sürümü eşleştiğinde otomatik KNOWN_VULNERABILITY bulgusu üretilir",
            "Automatically generates KNOWN_VULNERABILITY findings when vendor, model and exact firmware version match",
          )}
        >
          <div className="space-y-4">
            {canAdmin && (
              <form
                onSubmit={handleAddCve}
                className="space-y-3 rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#1C2434]">
                    {t(
                      "Kataloğa Yeni Endüstriyel CVE Ekle & Envanteri Tara",
                      "Add New Industrial CVE Advisory & Scan Inventory",
                    )}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCveId("CVE-2023-28489");
                      setCveVendor("Siemens");
                      setCveProduct("SIMATIC HMI Comfort");
                      setCveVersion("17.0.0");
                      setCveCvss("8.8");
                      setCveDesc(
                        t(
                          "Siemens SIMATIC HMI Comfort panellerinde kimlik doğrulama atlama ve uzaktan kod çalıştırma zafiyeti.",
                          "Authentication bypass and remote code execution vulnerability in Siemens SIMATIC HMI Comfort panels.",
                        ),
                      );
                      setCveRec(
                        t(
                          "TIA Portal üzerinden HMI firmware sürümünü V17.0.0.6 veya üstüne güncelleyin ve mühendislik erişimini kısıtlayın.",
                          "Update HMI firmware to V17.0.0.6 or later via TIA Portal and restrict engineering access.",
                        ),
                      );
                    }}
                  >
                    {t("Örnek Siemens HMI CVE Doldur", "Fill Sample Siemens HMI CVE")}
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                  <Field label="CVE ID *">
                    <Input
                      required
                      placeholder="CVE-2023-28489"
                      value={cveId}
                      onChange={(e) => setCveId(e.target.value)}
                    />
                  </Field>
                  <Field label={t("Üretici *", "Vendor *")}>
                    <Input
                      required
                      placeholder="Siemens"
                      value={cveVendor}
                      onChange={(e) => setCveVendor(e.target.value)}
                    />
                  </Field>
                  <Field label={t("Model / Ürün *", "Model / Product *")}>
                    <Input
                      required
                      placeholder="SIMATIC HMI Comfort"
                      value={cveProduct}
                      onChange={(e) => setCveProduct(e.target.value)}
                    />
                  </Field>
                  <Field label={t("Tam Firmware Sürümü *", "Exact Firmware *")}>
                    <Input
                      required
                      placeholder="17.0.0"
                      value={cveVersion}
                      onChange={(e) => setCveVersion(e.target.value)}
                    />
                  </Field>
                  <Field label="CVSS (0-10) *">
                    <Input
                      required
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={cveCvss}
                      onChange={(e) => setCveCvss(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label={t("Zafiyet Açıklaması *", "Vulnerability Description *")}>
                    <Input
                      required
                      placeholder={t("Teknik etki özeti...", "Technical impact summary...")}
                      value={cveDesc}
                      onChange={(e) => setCveDesc(e.target.value)}
                    />
                  </Field>
                  <Field label={t("Önerilen Yama / Önlem", "Recommended Patch / Mitigation")}>
                    <Input
                      placeholder={t("Firmware güncelleme veya ağ izolasyonu...", "Firmware update or network isolation...")}
                      value={cveRec}
                      onChange={(e) => setCveRec(e.target.value)}
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button type="submit" className="w-full" disabled={addCveMut.isPending}>
                      {addCveMut.isPending
                        ? t("Eşleştiriliyor…", "Matching…")
                        : t("+ CVE Ekle & Otomatik Eşleştir", "+ Add CVE & Match Firmware")}
                    </Button>
                  </div>
                </div>
                <ErrorBox error={addCveMut.error} />
              </form>
            )}

            {(cveCatalogQuery.data ?? []).length === 0 ? (
              <Empty>{t("Katalogda kayıtlı CVE yok.", "No CVEs registered in catalog.")}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5">CVE ID</th>
                      <th className="px-4 py-2.5">CVSS</th>
                      <th className="px-4 py-2.5">{t("Üretici & Model", "Vendor & Model")}</th>
                      <th className="px-4 py-2.5">Firmware</th>
                      <th className="px-4 py-2.5">{t("Açıklama & Çözüm", "Description & Mitigation")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {(cveCatalogQuery.data ?? []).map((v) => (
                      <tr key={v.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-2.5 font-mono font-bold whitespace-nowrap text-[#0D9488]">
                          {v.cve_id}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Badge tone={v.cvss >= 9 ? "red" : v.cvss >= 7 ? "amber" : "teal"}>
                            CVSS {v.cvss.toFixed(1)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-semibold text-[#1C2434]">{v.vendor}</span> ·{" "}
                          <span className="text-slate-600">{v.product}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap text-[#1C2434]">
                          v{v.version_exact}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          <div>{v.description}</div>
                          {v.recommendation && (
                            <div className="mt-0.5 text-[11px] font-medium text-[#0F766E]">
                              {t("Öneri", "Mitigation")}: {v.recommendation}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Filtre & Toplu İşlem Çubuğu */}
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label={t("Durum", "Status")}>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t("Tümü", "All")}</option>
              {(Object.keys(RISK_STATUS_LABEL) as RiskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {RISK_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Önem Derecesi", "Severity")}>
            <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">{t("Tümü", "All")}</option>
              {(["critical", "high", "medium", "low"] as Criticality[]).map((c) => (
                <option key={c} value={c}>
                  {CRITICALITY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Tetiklenen Kural", "Triggered Rule")}>
            <Select value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)}>
              <option value="">{t("Tümü", "All")}</option>
              {(Object.keys(RISK_RULE_LABEL) as RiskRuleKey[]).map((r) => (
                <option key={r} value={r}>
                  {RISK_RULE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setStatusFilter("");
                setSeverityFilter("");
                setRuleFilter("");
              }}
            >
              {t("Filtreleri Sıfırla", "Reset Filters")}
            </Button>
          </div>
        </div>

        {canEditAssets && checkedIds.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-teal-200 bg-teal-50/70 px-4 py-2.5 text-xs">
            <span className="font-semibold text-[#0F766E]">
              {t(`${checkedIds.length} risk bulgusu seçildi`, `${checkedIds.length} risk findings selected`)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(["investigating", "accepted", "resolved", "false_positive"] as RiskStatus[]).map(
                (st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant="secondary"
                    disabled={bulkStatusMut.isPending}
                    onClick={() =>
                      bulkStatusMut.mutate({
                        finding_ids: checkedIds,
                        status: st,
                        resolution_note: t("Toplu durum güncellemesi", "Bulk status update"),
                      })
                    }
                  >
                    → {RISK_STATUS_LABEL[st]}
                  </Button>
                ),
              )}
              <Button size="sm" variant="ghost" onClick={() => setCheckedIds([])}>
                {t("Seçimi Temizle", "Clear Selection")}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ErrorBox error={risksQuery.error || evalMut.error || statusMut.error || bulkStatusMut.error} />

      {/* 12 Sütunlu Bulgular Tablosu + Sabit (Sticky) Açıklanabilir Risk İnceleme Paneli */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Card
            title={t(
              `Bulgular Listesi (${risksQuery.data?.total ?? 0})`,
              `Findings List (${risksQuery.data?.total ?? 0})`,
            )}
            subtitle={t(
              "Detaylı kanıt ve çözüm adımlarını incelemek için bir bulguya tıklayın",
              "Click any finding to inspect detailed evidence and remediation steps",
            )}
            noPadding
          >
            {risksQuery.isLoading ? (
              <div className="p-6">
                <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
              </div>
            ) : findings.length === 0 ? (
              <div className="p-6">
                <Empty>{t("Seçilen kriterlere uygun risk bulgusu yok.", "No risk findings match the selected filters.")}</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    <tr>
                      {canEditAssets && <th className="w-8 px-4 py-3" />}
                      <th className="px-4 py-3">{t("Önem & Puan", "Severity & Score")}</th>
                      <th className="px-4 py-3">{t("Bulgu Başlığı & Kural", "Finding Title & Rule")}</th>
                      <th className="px-4 py-3">{t("Durum", "Status")}</th>
                      <th className="px-4 py-3 text-right">{t("Son Görülme", "Last Seen")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {findings.map((f) => {
                      const active = selected?.id === f.id;
                      const isChecked = checkedIds.includes(f.id);
                      return (
                        <tr
                          key={f.id}
                          onClick={() => setSelectedId(f.id)}
                          className={`cursor-pointer transition-colors ${
                            active ? "bg-teal-50/60" : "hover:bg-[#F8FAFC]"
                          }`}
                        >
                          {canEditAssets && (
                            <td
                              className="px-4 py-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleChecked(f.id)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0D9488] focus:ring-[#0D9488]"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <CriticalityBadge value={f.severity} />
                              <span className="font-mono font-bold text-[#1C2434]">
                                {f.score}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-[#1C2434]">{f.title}</div>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                              {f.rule_key} {f.asset_ip ? `· ${f.asset_ip}` : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge tone={statusTone(f.status)}>
                              {RISK_STATUS_LABEL[f.status]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[11px] whitespace-nowrap text-slate-500">
                            {formatDate(f.last_seen_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Sağ: Sabit (Sticky) Açıklanabilir Risk İnceleme Paneli */}
        <div className="self-start lg:sticky lg:top-20 lg:col-span-5">
          <Card
            title={t("Açıklanabilir Risk İnceleme Paneli", "Explainable Risk Inspection Panel")}
            subtitle={t("5 adımlı kanıt ve aksiyon doğrulaması", "5-step evidence and action verification")}
          >
            {!selected ? (
              <Empty>{t("İncelemek için soldaki tablodan bir bulgu seçin.", "Select a finding from the table on the left to inspect.")}</Empty>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="border-b border-[#E2E8F0] pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CriticalityBadge value={selected.severity} />
                    <Badge tone="navy">
                      {t("Puan", "Score")}: {selected.score}/100
                    </Badge>
                    <Badge tone={statusTone(selected.status)}>
                      {RISK_STATUS_LABEL[selected.status]}
                    </Badge>
                  </div>
                  <h3 className="mt-2 text-base font-bold text-[#1C2434]">{selected.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="font-mono">{selected.rule_key}</span>
                    {selected.asset_id && (
                      <Link
                        to={`/assets/${selected.asset_id}`}
                        className="font-semibold text-[#0D9488] hover:underline"
                      >
                        {t("Cihaz Konsoluna Git", "Open Device Console")} (
                        {selected.asset_ip ?? selected.asset_name ?? t("Cihaz", "Device")}) →
                      </Link>
                    )}
                  </div>
                </div>

                {/* 1. Ne tespit edildi? */}
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {t("1. Ne Tespit Edildi?", "1. What Was Detected?")}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#1C2434]">
                    {selected.evidence.what_observed ?? selected.description}
                  </p>
                </div>

                {/* 2. Neden önemli? */}
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {t("2. Üretim Güvenliği İçin Neden Önemli?", "2. Why Does It Matter for OT Safety?")}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    {selected.evidence.why_important ?? selected.description}
                  </p>
                </div>

                {/* 3. Ne yapılmalı? */}
                <div className="rounded-[4px] border border-teal-200 bg-teal-50/70 p-3.5">
                  <div className="text-[11px] font-bold tracking-wider text-[#0F766E] uppercase">
                    {t("3. Önerilen Müdahale", "3. Recommended Action")}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-800">
                    {selected.recommendation}
                  </p>
                </div>

                {/* 4. Puan Kırılımı ve Güven */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    <span>
                      {t(`4. Puan Kırılımı (${selected.score}/100)`, `4. Score Breakdown (${selected.score}/100)`)}
                    </span>
                    <span className="text-[#0D9488]">
                      {t("Güven", "Confidence")}: %{Math.round(selected.confidence * 100)}
                    </span>
                  </div>
                  {selected.evidence.score_breakdown && (
                    <div className="mt-2 space-y-2 rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
                      {Object.entries(breakdownLabels).map(([k, meta]) => {
                        const val = selected.evidence.score_breakdown?.[k] ?? 0;
                        const pct = Math.min(100, Math.round((val / meta.max) * 100));
                        return (
                          <div key={k}>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-600">
                                {meta.label} ({t("Maks", "Max")} {meta.max})
                              </span>
                              <span className="font-mono font-bold text-[#1C2434]">+{val}</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-[#0D9488]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 5. Teknik Kanıt (Varsayılan kapalı <details>) */}
                <details className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-[#1C2434] hover:text-[#0D9488]">
                    {t("5. Teknik Kanıtı Göster", "5. Show Technical Evidence")}
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded-[4px] bg-[#1C2434] p-3 font-mono text-[11px] text-slate-100">
                    {JSON.stringify(
                      selected.evidence.supporting_data ?? selected.evidence,
                      null,
                      2,
                    )}
                  </pre>
                </details>

                {/* Durum Güncelleme */}
                {canEditAssets && (
                  <div className="border-t border-[#E2E8F0] pt-3">
                    <Field label={t("Çözüm / İnceleme Notu", "Resolution / Review Note")}>
                      <Input
                        placeholder={t(
                          "Örn: Bakım ekibi PLC erişimini doğruladı...",
                          "e.g. Maintenance team verified PLC access...",
                        )}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </Field>
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {(
                        ["open", "investigating", "accepted", "resolved", "false_positive"] as RiskStatus[]
                      ).map((st) => {
                        const isCurrent = selected.status === st;
                        return (
                          <Button
                            key={st}
                            size="sm"
                            variant={isCurrent ? "dark" : "secondary"}
                            disabled={statusMut.isPending || isCurrent}
                            onClick={() =>
                              statusMut.mutate({
                                id: selected.id,
                                status: st,
                                resolution_note: note,
                              })
                            }
                          >
                            {isCurrent ? `✓ ${RISK_STATUS_LABEL[st]}` : RISK_STATUS_LABEL[st]}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
