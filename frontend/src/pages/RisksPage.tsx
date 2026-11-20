import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
} from "../types/api";

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  open: "Açık (Open)",
  investigating: "İnceleniyor",
  accepted: "Kabul Edildi",
  resolved: "Çözüldü",
  false_positive: "Yanlış Alarm",
};

export const RISK_RULE_LABEL: Record<RiskRuleKey, string> = {
  NEW_ASSET: "NEW_ASSET · Yeni Keşfedilen Cihaz",
  UNKNOWN_OT_ASSET: "UNKNOWN_OT_ASSET · Doğrulanmamış Endüstriyel Cihaz",
  UNEXPECTED_COMMUNICATION: "UNEXPECTED_COMMUNICATION · Beklenmeyen İletişim",
  UNAPPROVED_REMOTE_PATH: "UNAPPROVED_REMOTE_PATH · Onaylanmamış Uzaktan Erişim",
  KNOWN_VULNERABILITY: "KNOWN_VULNERABILITY · Bilinen Güvenlik Açığı",
  ASSET_NOT_SEEN: "ASSET_NOT_SEEN · Uzun Süredir Gözlemlenmeyen Cihaz",
};

const BREAKDOWN_LABELS: Record<string, { label: string; max: number }> = {
  production_criticality: { label: "Üretim Kritiklik Seviyesi", max: 30 },
  network_exposure: { label: "Ağ Erişilebilirliği ve Maruziyet", max: 25 },
  verified_vulnerability: { label: "Doğrulanmış Güvenlik Açığı", max: 25 },
  unexpected_behavior: { label: "Beklenmeyen Davranış / İletişim", max: 10 },
  inventory_gap: { label: "Envanter Doğrulama Eksikliği", max: 10 },
};

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
  const { activeOrg, canEditAssets } = useAuth();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [ruleFilter, setRuleFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [showRulesCatalog, setShowRulesCatalog] = useState(false);

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

  function toggleChecked(id: string) {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Events & Risk Findings"
        title="Olaylar, Gözlemler & Açıklanabilir Risk Merkezi"
        subtitle="Kara kutu skorlar yerine her bulgunun teknik kanıtı, tetiklenen deterministik kuralı ve sahada uygulanabilir çözüm adımı"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowRulesCatalog((v) => !v)}
            >
              {showRulesCatalog ? "Kural Kataloğunu Gizle" : "Deterministik Kural Kataloğu (6 Kural)"}
            </Button>
            {canEditAssets && (
              <Button
                variant="primary"
                disabled={evalMut.isPending}
                onClick={() => evalMut.mutate()}
              >
                {evalMut.isPending ? "Hesaplanıyor…" : "Risk Motorunu Çalıştır"}
              </Button>
            )}
          </>
        }
      />

      {/* 4 TailAdmin StatCard — Fabrika Güvenlik Duruşu & Risk Özeti */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Fabrika Güvenlik Duruşu"
          value={posture ? `${posture.health_score}/100` : "—"}
          hint={
            posture
              ? `${posture.status_label} · %${Math.round(posture.verified_asset_ratio * 100)} doğrulanmış varlık`
              : "Hesaplanıyor…"
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
                  text: `Derece ${posture.grade}`,
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
          label="Kritik & Yüksek Bulgular"
          value={posture ? posture.open_critical + posture.open_high : "—"}
          hint={
            posture
              ? `${posture.open_critical} Kritik · ${posture.open_high} Yüksek`
              : "Açık bulgular"
          }
          tone={
            posture && posture.open_critical + posture.open_high > 0 ? "red" : "emerald"
          }
          badge={{
            text: "Öncelikli Müdahale",
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
          label="Orta & Düşük Bulgular"
          value={posture ? posture.open_medium + posture.open_low : "—"}
          hint={
            posture
              ? `${posture.open_medium} Orta · ${posture.open_low} Düşük`
              : "İzlenen bulgular"
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
          label="Aktif Deterministik Kural"
          value={rulesList.length || 6}
          hint="FG-RULE-001 .. FG-RULE-006"
          tone="teal"
          badge={{ text: "%100 Açıklanabilir", tone: "teal" }}
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
          title={`FactoryGuard Deterministik OT Risk Kural Kataloğu (${rulesList.length} Aktif Kural)`}
          subtitle="Yapay zeka tahmini değil; kanıta dayalı deterministik endüstriyel güvenlik kuralları"
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

      {/* Filtre & Toplu İşlem Çubuğu */}
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Durum">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tümü</option>
              {(Object.keys(RISK_STATUS_LABEL) as RiskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {RISK_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Önem Derecesi">
            <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">Tümü</option>
              {(["critical", "high", "medium", "low"] as Criticality[]).map((c) => (
                <option key={c} value={c}>
                  {CRITICALITY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tetiklenen Kural">
            <Select value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)}>
              <option value="">Tümü</option>
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
              Filtreleri Sıfırla
            </Button>
          </div>
        </div>

        {canEditAssets && checkedIds.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-teal-200 bg-teal-50/70 px-4 py-2.5 text-xs">
            <span className="font-semibold text-[#0F766E]">
              {checkedIds.length} risk bulgusu seçildi
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
                        resolution_note: "Toplu durum güncellemesi",
                      })
                    }
                  >
                    Toplu → {RISK_STATUS_LABEL[st]}
                  </Button>
                ),
              )}
              <Button size="sm" variant="ghost" onClick={() => setCheckedIds([])}>
                Seçimi Temizle
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ErrorBox error={risksQuery.error || evalMut.error || statusMut.error || bulkStatusMut.error} />

      {/* 12 Sütunlu Bulgular Tablosu + Açıklanabilir Risk İnceleme Paneli */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Card
            title={`Bulgular Listesi (${risksQuery.data?.total ?? 0})`}
            subtitle="Detaylı kanıt ve çözüm adımlarını incelemek için bir bulguya tıklayın"
            noPadding
          >
            {risksQuery.isLoading ? (
              <div className="p-6">
                <Empty>Yükleniyor…</Empty>
              </div>
            ) : findings.length === 0 ? (
              <div className="p-6">
                <Empty>Seçilen kriterlere uygun risk bulgusu yok.</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      {canEditAssets && <th className="w-8 px-4 py-3" />}
                      <th className="px-4 py-3">Önem & Puan</th>
                      <th className="px-4 py-3">Bulgu Başlığı & Kural</th>
                      <th className="px-4 py-3">Durum</th>
                      <th className="px-4 py-3 text-right">Son Görülme</th>
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

        {/* Sağ: Açıklanabilir Risk İnceleme Paneli (5 Soru Modeli) */}
        <div className="lg:col-span-5">
          <Card
            title="Açıklanabilir Risk İnceleme Paneli"
            subtitle="5 adımlı kanıt ve aksiyon doğrulaması"
          >
            {!selected ? (
              <Empty>İncelemek için soldaki tablodan bir bulgu seçin.</Empty>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="border-b border-[#E2E8F0] pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CriticalityBadge value={selected.severity} />
                    <Badge tone="navy">Puan: {selected.score}/100</Badge>
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
                        İlgili Cihaz Konsoluna Git ({selected.asset_ip ?? selected.asset_name ?? "Cihaz"}) →
                      </Link>
                    )}
                  </div>
                </div>

                {/* 1. Ne tespit edildi? */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    1. Ne Tespit Edildi?
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#1C2434]">
                    {selected.evidence.what_observed ?? selected.description}
                  </p>
                </div>

                {/* 2. Neden önemli? */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    2. Üretim Güvenliği İçin Neden Önemli?
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    {selected.evidence.why_important ?? selected.description}
                  </p>
                </div>

                {/* 3. Ne yapılmalı? */}
                <div className="rounded-[4px] border border-teal-200 bg-teal-50/70 p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#0F766E]">
                    3. Önerilen Müdahale (Ne Yapılmalı?)
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-800">
                    {selected.recommendation}
                  </p>
                </div>

                {/* 4. Puan Kırılımı ve Güven */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <span>4. Puan Kırılımı ({selected.score}/100)</span>
                    <span className="text-[#0D9488]">
                      Bulgu Güveni: %{Math.round(selected.confidence * 100)}
                    </span>
                  </div>
                  {selected.evidence.score_breakdown && (
                    <div className="mt-2 space-y-2 rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
                      {Object.entries(BREAKDOWN_LABELS).map(([k, meta]) => {
                        const val = selected.evidence.score_breakdown?.[k] ?? 0;
                        const pct = Math.min(100, Math.round((val / meta.max) * 100));
                        return (
                          <div key={k}>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-600">
                                {meta.label} (Maks {meta.max})
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

                {/* 5. Teknik Kanıt */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    5. Ham Teknik Kanıt (Evidence JSON)
                  </div>
                  <pre className="mt-1.5 max-h-40 overflow-auto rounded-[4px] border border-[#E2E8F0] bg-[#1C2434] p-3 font-mono text-[11px] text-slate-100">
                    {JSON.stringify(
                      selected.evidence.supporting_data ?? selected.evidence,
                      null,
                      2,
                    )}
                  </pre>
                </div>

                {/* Durum Güncelleme */}
                {canEditAssets && (
                  <div className="border-t border-[#E2E8F0] pt-3">
                    <Field label="Çözüm / İnceleme Notu">
                      <Input
                        placeholder="Örn: Bakım ekibi PLC erişimini doğruladı..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </Field>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {(
                        ["open", "investigating", "accepted", "resolved", "false_positive"] as RiskStatus[]
                      ).map((st) => (
                        <Button
                          key={st}
                          size="sm"
                          variant={selected.status === st ? "primary" : "secondary"}
                          disabled={statusMut.isPending || selected.status === st}
                          onClick={() =>
                            statusMut.mutate({
                              id: selected.id,
                              status: st,
                              resolution_note: note,
                            })
                          }
                        >
                          {RISK_STATUS_LABEL[st]}
                        </Button>
                      ))}
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
