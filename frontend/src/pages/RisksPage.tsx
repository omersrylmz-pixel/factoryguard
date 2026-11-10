import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import {
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
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { Criticality, Page, RiskFinding, RiskRuleKey, RiskStatus } from "../types/api";

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  open: "Open (Açık)",
  investigating: "Investigating (İnceleniyor)",
  accepted: "Accepted (Kabul Edildi)",
  resolved: "Resolved (Çözüldü)",
  false_positive: "False Positive (Yanlış Alarm)",
};

export const RISK_RULE_LABEL: Record<RiskRuleKey, string> = {
  NEW_ASSET: "NEW_ASSET · Yeni Keşfedilen Cihaz",
  UNKNOWN_OT_ASSET: "UNKNOWN_OT_ASSET · Doğrulanmamış Endüstriyel Cihaz",
  UNEXPECTED_COMMUNICATION: "UNEXPECTED_COMMUNICATION · Beklenmeyen İletişim",
  UNAPPROVED_REMOTE_PATH: "UNAPPROVED_REMOTE_PATH · Onaylanmamış Uzaktan Erişim",
  KNOWN_VULNERABILITY: "KNOWN_VULNERABILITY · Bilinen Güvenlik Açığı",
};

const BREAKDOWN_LABELS: Record<string, string> = {
  production_criticality: "Üretim Kritiklik Seviyesi (Maks 30)",
  network_exposure: "Ağ Erişilebilirliği ve Maruziyet (Maks 25)",
  verified_vulnerability: "Doğrulanmış Güvenlik Açığı (Maks 25)",
  unexpected_behavior: "Beklenmeyen Davranış / İletişim (Maks 10)",
  inventory_gap: "Envanter ve Sahiplik Eksikliği (Maks 10)",
};

export default function RisksPage() {
  const { activeOrg, canEditAssets } = useAuth();
  const qc = useQueryClient();

  // Filtreler (Bölüm 10.6: Severity, Status, Asset, Rule, Tarih)
  const [severity, setSeverity] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ruleKey, setRuleKey] = useState("");
  const [sinceDate, setSinceDate] = useState("");
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (severity) params.set("severity", severity);
  if (statusFilter) params.set("status", statusFilter);
  if (ruleKey) params.set("rule_key", ruleKey);
  if (sinceDate) params.set("since", new Date(sinceDate).toISOString());
  params.set("limit", "100");

  const risksQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, params.toString()],
    queryFn: () => api<Page<RiskFinding>>(`/risks?${params.toString()}`),
    enabled: !!activeOrg,
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RiskStatus }) =>
      api<RiskFinding>(`/risks/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] });
    },
  });

  const evaluateMut = useMutation({
    mutationFn: () => api("/risks/evaluate", { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["risks", activeOrg?.id] });
    },
  });

  const risks = risksQuery.data?.items ?? [];
  const total = risksQuery.data?.total ?? 0;
  const selected = risks.find((r) => r.id === selectedRiskId) ?? risks[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Risk Merkezi"
          subtitle="Açıklanabilir, kanıta dayalı kurallarla tespit edilen güvenlik riskleri ve aksiyon önerileri"
        />
        {canEditAssets && (
          <Button variant="secondary" onClick={() => evaluateMut.mutate()} disabled={evaluateMut.isPending}>
            {evaluateMut.isPending ? "Değerlendiriliyor…" : "Kuralları Şimdi Yeniden Çalıştır"}
          </Button>
        )}
      </div>

      <Card title="Filtreler">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Risk Seviyesi (Severity)">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">Tümü</option>
              {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((c) => (
                <option key={c} value={c}>
                  {CRITICALITY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Durum (Status)">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tümü</option>
              {(Object.keys(RISK_STATUS_LABEL) as RiskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {RISK_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kural (Rule)">
            <Select value={ruleKey} onChange={(e) => setRuleKey(e.target.value)}>
              <option value="">Tüm Kurallar</option>
              {(Object.keys(RISK_RULE_LABEL) as RiskRuleKey[]).map((rk) => (
                <option key={rk} value={rk}>
                  {RISK_RULE_LABEL[rk]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Son Görülme Tarihi (Başlangıç)">
            <Input type="date" value={sinceDate} onChange={(e) => setSinceDate(e.target.value)} />
          </Field>
        </div>
      </Card>

      <ErrorBox error={risksQuery.error ?? statusMut.error ?? evaluateMut.error} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Sol: Risk Listesi */}
        <div className="lg:col-span-3">
          <Card title={`Risk Bulguları (Toplam: ${total})`}>
            {risksQuery.isLoading ? (
              <Empty>Yükleniyor…</Empty>
            ) : risks.length === 0 ? (
              <Empty>Seçilen filtrelere uygun risk bulgusu yok.</Empty>
            ) : (
              <div className="divide-y divide-slate-200">
                {risks.map((r) => {
                  const isSelected = selected?.id === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRiskId(r.id)}
                      className={`cursor-pointer p-3 transition-colors ${
                        isSelected ? "bg-blue-50/70" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{r.title}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            Kural: <span className="font-mono font-medium text-slate-700">{r.rule_key}</span> · Cihaz:{" "}
                            <span className="font-mono text-slate-700">{r.asset_ip ?? r.asset_name ?? "—"}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                            {r.score} / 100
                          </span>
                          <CriticalityBadge value={r.severity} />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>Durum: {RISK_STATUS_LABEL[r.status]}</span>
                        <span>Bulgu Güveni: %{Math.round(r.confidence * 100)}</span>
                        <span>{formatDate(r.last_seen_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Sağ: Açıklanabilir Risk Detay Paneli (Bölüm 10.6) */}
        <div className="lg:col-span-2">
          <Card title="Açıklanabilir Risk İncelemesi">
            {!selected ? (
              <Empty>Detaylarını incelemek için listeden bir risk bulgusu seçin.</Empty>
            ) : (
              <div className="space-y-4 text-sm">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-blue-700">{selected.rule_key}</span>
                    <CriticalityBadge value={selected.severity} />
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">{selected.title}</h3>
                  <div className="mt-1 text-xs text-slate-500">
                    Etkilenen Cihaz:{" "}
                    <Link to={`/assets/${selected.asset_id}`} className="font-mono text-blue-700 hover:underline">
                      {selected.asset_ip || selected.asset_name || selected.asset_id.slice(0, 8)}
                    </Link>
                  </div>
                </div>

                {/* Durum Yönetimi */}
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <Field label="Bulgu Durumu (Değişiklikler denetim kaydına yazılır)">
                    <Select
                      disabled={!canEditAssets || statusMut.isPending}
                      value={selected.status}
                      onChange={(e) =>
                        statusMut.mutate({ id: selected.id, status: e.target.value as RiskStatus })
                      }
                    >
                      {(Object.keys(RISK_STATUS_LABEL) as RiskStatus[]).map((st) => (
                        <option key={st} value={st}>
                          {RISK_STATUS_LABEL[st]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                {/* 1. Ne gözlendi? */}
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">1. Ne Gözlendi?</div>
                  <p className="mt-1 text-xs text-slate-800">
                    {selected.evidence.what_observed || selected.description}
                  </p>
                </div>

                {/* 2. Neden önemli? */}
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">2. Neden Önemli?</div>
                  <p className="mt-1 text-xs text-slate-800">
                    {selected.evidence.why_important || selected.description}
                  </p>
                </div>

                {/* 3. Önerilen aksiyon nedir? */}
                <div className="rounded-md border border-blue-200 bg-blue-50/70 p-3">
                  <div className="text-xs font-semibold uppercase text-blue-900">3. Önerilen Aksiyon</div>
                  <p className="mt-1 text-xs text-blue-950">{selected.recommendation}</p>
                </div>

                {/* 4. Risk Puanı ve Güven Seviyesi (Birbirinden ayrı) */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
                    <span>4. Risk Puanı: {selected.score}/100</span>
                    <span>Bulgu Güveni: %{Math.round(selected.confidence * 100)}</span>
                  </div>
                  {selected.evidence.score_breakdown && (
                    <div className="mt-2 space-y-1 rounded border border-slate-200 bg-slate-50 p-2.5 text-xs">
                      {Object.entries(BREAKDOWN_LABELS).map(([k, label]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-slate-600">{label}</span>
                          <span className="font-mono font-medium text-slate-900">
                            +{selected.evidence.score_breakdown?.[k] ?? 0}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-slate-200 pt-1 text-[11px] text-slate-500">
                        Not: Bu ağırlık modeli önceliklendirme amaçlı ürün hipotezidir; bulgu güven seviyesinden ayrıdır.
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. Hangi kanıta dayanıyor? */}
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">5. Teknik Kanıt (Evidence)</div>
                  <pre className="mt-1 max-h-44 overflow-auto rounded border border-slate-200 bg-slate-900 p-2.5 font-mono text-[11px] text-slate-100">
                    {JSON.stringify(selected.evidence.supporting_data ?? selected.evidence, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
