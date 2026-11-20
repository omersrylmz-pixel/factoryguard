import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
  ROLE_LABEL,
  Select,
  StatCard,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type {
  AuditLog,
  Criticality,
  Member,
  Organization,
  Page,
  Site,
  Zone,
} from "../types/api";

export default function SettingsPage() {
  const { activeOrg, canAdmin, reloadMe } = useAuth();
  const qc = useQueryClient();

  const orgQuery = useQuery({
    queryKey: ["org", activeOrg?.id],
    queryFn: () => api<Organization>(`/organizations/${activeOrg!.id}`),
    enabled: !!activeOrg,
  });

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

  const membersQuery = useQuery({
    queryKey: ["members", activeOrg?.id],
    queryFn: () => api<Member[]>(`/organizations/${activeOrg!.id}/members`),
    enabled: !!activeOrg && canAdmin,
  });

  const auditQuery = useQuery({
    queryKey: ["audit-logs", activeOrg?.id, 25],
    queryFn: () => api<Page<AuditLog>>("/audit-logs?limit=25"),
    enabled: !!activeOrg && canAdmin,
  });

  // Organizasyon adı güncelleme
  const [orgName, setOrgName] = useState("");
  const updateOrgMut = useMutation({
    mutationFn: (name: string) =>
      api<Organization>(`/organizations/${activeOrg!.id}`, {
        method: "PATCH",
        body: { name },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["org", activeOrg?.id] }),
        reloadMe(),
      ]);
      setOrgName("");
    },
  });

  // Yeni Fabrika (Site)
  const [siteName, setSiteName] = useState("");
  const [siteIndustry, setSiteIndustry] = useState("Otomotiv & Yan Sanayi");
  const [siteTimezone, setSiteTimezone] = useState("Europe/Istanbul");
  const createSiteMut = useMutation({
    mutationFn: (body: { name: string; industry: string | null; timezone: string }) =>
      api<Site>("/sites", { method: "POST", body }),
    onSuccess: async () => {
      setSiteName("");
      await qc.invalidateQueries({ queryKey: ["sites", activeOrg?.id] });
    },
  });

  const deleteSiteMut = useMutation({
    mutationFn: (id: string) => api<void>(`/sites/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sites", activeOrg?.id] }),
        qc.invalidateQueries({ queryKey: ["zones", activeOrg?.id] }),
      ]);
    },
  });

  // Yeni Bölge (Zone)
  const [zoneSiteId, setZoneSiteId] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [zoneCrit, setZoneCrit] = useState<Criticality>("medium");
  const [zoneDesc, setZoneDesc] = useState("");
  const createZoneMut = useMutation({
    mutationFn: (body: {
      site_id: string;
      name: string;
      criticality: Criticality;
      description: string | null;
    }) => api<Zone>("/zones", { method: "POST", body }),
    onSuccess: async () => {
      setZoneName("");
      setZoneDesc("");
      await qc.invalidateQueries({ queryKey: ["zones", activeOrg?.id] });
    },
  });

  const deleteZoneMut = useMutation({
    mutationFn: (id: string) => api<void>(`/zones/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["zones", activeOrg?.id] });
    },
  });

  const sites = sitesQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const effectiveSiteId = zoneSiteId || sites[0]?.id || "";

  function handleUpdateOrg(e: FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    updateOrgMut.mutate(orgName.trim());
  }

  function handleCreateSite(e: FormEvent) {
    e.preventDefault();
    createSiteMut.mutate({
      name: siteName.trim(),
      industry: siteIndustry.trim() || null,
      timezone: siteTimezone.trim() || "Europe/Istanbul",
    });
  }

  function handleCreateZone(e: FormEvent) {
    e.preventDefault();
    if (!effectiveSiteId) return;
    createZoneMut.mutate({
      site_id: effectiveSiteId,
      name: zoneName.trim(),
      criticality: zoneCrit,
      description: zoneDesc.trim() || null,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Settings & Governance"
        title="Organizasyon, Fabrika, Bölge & RBAC Ayarları"
        subtitle="Çok kiracılı (multi-tenant) fabrika hiyerarşisi, üretim hattı güvenlik bölgeleri, kullanıcı yetkileri ve denetim izleri"
      />

      {/* 4 TailAdmin StatCard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Aktif Organizasyon"
          value={orgQuery.data?.name ?? activeOrg?.name ?? "—"}
          hint={`Plan: ${orgQuery.data?.plan ?? "enterprise"} · Rol: ${ROLE_LABEL[activeOrg?.role ?? "owner"]}`}
          tone="teal"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />
        <StatCard
          label="Fabrikalar (Sites)"
          value={sites.length}
          hint="Fiziksel üretim tesisleri"
          tone="navy"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 21h18M5 21V7l7-4 7 4v14" />
            </svg>
          }
        />
        <StatCard
          label="Üretim Bölgeleri (Zones)"
          value={zones.length}
          hint="ISA/IEC 62443 güvenlik segmentleri"
          tone="teal"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
          }
        />
        <StatCard
          label="Yetkili Kullanıcı & Denetim"
          value={membersQuery.data?.length ?? 1}
          hint={`${auditQuery.data?.total ?? 0} kayıtlı denetim izi`}
          tone="emerald"
          badge={{ text: "RBAC Aktif", tone: "emerald" }}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          }
        />
      </div>

      {/* Organizasyon Bilgisi */}
      <Card
        title="Organizasyon Kimliği"
        subtitle="Kurumsal kiracı (tenant) adı ve sistem tanımlayıcıları"
      >
        {orgQuery.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-3">
              <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[11px] font-medium uppercase text-slate-400">Organizasyon Adı</div>
                <div className="mt-1 text-sm font-bold text-[#1C2434]">{orgQuery.data.name}</div>
              </div>
              <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[11px] font-medium uppercase text-slate-400">Lisans Planı & Rol</div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#0D9488]">
                  {orgQuery.data.plan.toUpperCase()} · {ROLE_LABEL[orgQuery.data.role]}
                </div>
              </div>
              <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[11px] font-medium uppercase text-slate-400">Oluşturulma Tarihi</div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  {formatDate(orgQuery.data.created_at)}
                </div>
              </div>
            </div>

            {canAdmin && (
              <form onSubmit={handleUpdateOrg} className="flex max-w-md items-end gap-2 pt-1">
                <div className="flex-1">
                  <Field label="Organizasyon Adını Güncelle">
                    <Input
                      placeholder={orgQuery.data.name}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                    />
                  </Field>
                </div>
                <Button type="submit" disabled={updateOrgMut.isPending || !orgName.trim()}>
                  Kaydet
                </Button>
              </form>
            )}
            <ErrorBox error={updateOrgMut.error} />
          </div>
        )}
      </Card>

      {/* Fabrikalar (Sites) */}
      <Card
        title={`Fabrikalar / Tesisler (${sites.length})`}
        subtitle="Pasif sensörlerin ve üretim bölgelerinin bağlı olduğu fiziksel lokasyonlar"
      >
        <div className="space-y-4">
          {canAdmin && (
            <form
              onSubmit={handleCreateSite}
              className="grid grid-cols-1 gap-3 rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-4"
            >
              <Field label="Fabrika Adı *">
                <Input
                  required
                  placeholder="Örn: Gebze Ana Üretim Tesisi"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                />
              </Field>
              <Field label="Endüstri / Sektör">
                <Input
                  placeholder="Örn: Otomotiv & Yan Sanayi"
                  value={siteIndustry}
                  onChange={(e) => setSiteIndustry(e.target.value)}
                />
              </Field>
              <Field label="Zaman Dilimi">
                <Input
                  placeholder="Europe/Istanbul"
                  value={siteTimezone}
                  onChange={(e) => setSiteTimezone(e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={createSiteMut.isPending}>
                  + Fabrika Ekle
                </Button>
              </div>
            </form>
          )}

          <ErrorBox error={createSiteMut.error || deleteSiteMut.error} />

          {sitesQuery.isLoading ? (
            <Empty>Yükleniyor…</Empty>
          ) : sites.length === 0 ? (
            <Empty>Henüz fabrika tanımlanmadı.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Fabrika Adı</th>
                    <th className="px-4 py-3">Sektör (Industry)</th>
                    <th className="px-4 py-3">Zaman Dilimi</th>
                    <th className="px-4 py-3">Oluşturulma</th>
                    {canAdmin && <th className="px-4 py-3 text-right">İşlem</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {sites.map((s) => (
                    <tr key={s.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 font-semibold text-[#1C2434]">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.industry ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{s.timezone}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {formatDate(s.created_at)}
                      </td>
                      {canAdmin && (
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={deleteSiteMut.isPending}
                            onClick={() => deleteSiteMut.mutate(s.id)}
                          >
                            Sil
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Bölgeler (Zones) */}
      <Card
        title={`Üretim Güvenlik Bölgeleri / Hücreler (${zones.length})`}
        subtitle="Purdue ve ISA/IEC 62443 segmentasyonuna göre üretim hatları ve kritiklik seviyeleri"
      >
        <div className="space-y-4">
          {canAdmin && sites.length > 0 && (
            <form
              onSubmit={handleCreateZone}
              className="grid grid-cols-1 gap-3 rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-5"
            >
              <Field label="Fabrika *">
                <Select value={effectiveSiteId} onChange={(e) => setZoneSiteId(e.target.value)}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bölge / Hat Adı *">
                <Input
                  required
                  placeholder="Örn: Gövde Kaynak Hattı"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                />
              </Field>
              <Field label="Üretim Kritikliği">
                <Select
                  value={zoneCrit}
                  onChange={(e) => setZoneCrit(e.target.value as Criticality)}
                >
                  {(["low", "medium", "high", "critical"] as Criticality[]).map((c) => (
                    <option key={c} value={c}>
                      {CRITICALITY_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Açıklama">
                <Input
                  placeholder="VLAN / Hücre bilgisi"
                  value={zoneDesc}
                  onChange={(e) => setZoneDesc(e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={createZoneMut.isPending}>
                  + Bölge Ekle
                </Button>
              </div>
            </form>
          )}

          <ErrorBox error={createZoneMut.error || deleteZoneMut.error} />

          {zonesQuery.isLoading ? (
            <Empty>Yükleniyor…</Empty>
          ) : zones.length === 0 ? (
            <Empty>Henüz üretim bölgesi tanımlanmadı.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Bölge Adı</th>
                    <th className="px-4 py-3">Fabrika</th>
                    <th className="px-4 py-3">Kritiklik</th>
                    <th className="px-4 py-3">Açıklama</th>
                    {canAdmin && <th className="px-4 py-3 text-right">İşlem</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {zones.map((z) => {
                    const site = sites.find((s) => s.id === z.site_id);
                    return (
                      <tr key={z.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-semibold text-[#1C2434]">{z.name}</td>
                        <td className="px-4 py-3 text-slate-600">{site?.name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <CriticalityBadge value={z.criticality} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">{z.description ?? "—"}</td>
                        {canAdmin && (
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={deleteZoneMut.isPending}
                              onClick={() => deleteZoneMut.mutate(z.id)}
                            >
                              Sil
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Organizasyon Üyeleri (RBAC) */}
      {canAdmin && (
        <Card
          title="Organizasyon Üyeleri & Rol Tabanlı Erişim (RBAC)"
          subtitle="Platforma erişim yetkisi olan kullanıcılar ve görev rolleri"
          noPadding
        >
          {membersQuery.isLoading ? (
            <div className="p-6">
              <Empty>Yükleniyor…</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Ad Soyad</th>
                    <th className="px-4 py-3">E-posta</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-5 py-3 text-right">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {(membersQuery.data ?? []).map((m) => (
                    <tr key={m.user_id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3 font-semibold text-[#1C2434]">{m.full_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{m.email}</td>
                      <td className="px-4 py-3">
                        <Badge tone="teal">{ROLE_LABEL[m.role]}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Badge tone={m.is_active ? "emerald" : "slate"} dot>
                          {m.is_active ? "Aktif" : "Pasif"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Denetim Kayıtları (Audit Logs) */}
      {canAdmin && (
        <Card
          title={`Güvenlik Denetim Kayıtları (Toplam: ${auditQuery.data?.total ?? 0})`}
          subtitle="Sistemde gerçekleştirilen kritik yapılandırma, doğrulama ve sensör işlemlerinin değiştirilemez kaydı"
          noPadding
        >
          {auditQuery.isLoading ? (
            <div className="p-6">
              <Empty>Yükleniyor…</Empty>
            </div>
          ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
            <div className="p-6">
              <Empty>Kayıt yok.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Zaman</th>
                    <th className="px-4 py-3">İşlem Kodu</th>
                    <th className="px-4 py-3">Hedef Varlık</th>
                    <th className="px-4 py-3">Kaynak IP</th>
                    <th className="px-5 py-3">Detay (Metadata)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {auditQuery.data!.items.map((a) => (
                    <tr key={a.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-5 py-2.5 font-mono whitespace-nowrap text-slate-500">
                        {formatDate(a.created_at)}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold text-[#1C2434]">
                        {a.action}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {a.target_type
                          ? `${a.target_type}:${a.target_id?.slice(0, 8) ?? ""}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">
                        {a.ip_address ?? "—"}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-[11px] text-slate-600">
                        {JSON.stringify(a.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
