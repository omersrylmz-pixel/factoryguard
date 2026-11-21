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
  formatAuditAction,
  formatAuditTarget,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useLang } from "../i18n";
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
  const { t } = useLang();
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

  // Yeni Fabrika (Site) — placeholder ile gösterilir, önceden doldurulmuş koyu değer kullanılmaz
  const [siteName, setSiteName] = useState("");
  const [siteIndustry, setSiteIndustry] = useState("");
  const [siteTimezone, setSiteTimezone] = useState("");
  const createSiteMut = useMutation({
    mutationFn: (body: { name: string; industry: string | null; timezone: string }) =>
      api<Site>("/sites", { method: "POST", body }),
    onSuccess: async () => {
      setSiteName("");
      setSiteIndustry("");
      setSiteTimezone("");
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
  const planUpper = (orgQuery.data?.plan ?? "starter").toUpperCase();

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

  function formatMetadataEntries(meta: Record<string, unknown>): { k: string; v: string; full: string }[] {
    return Object.entries(meta)
      .filter(([, val]) => val !== null && val !== undefined && val !== "")
      .slice(0, 4)
      .map(([k, val]) => {
        const str = typeof val === "object" ? JSON.stringify(val) : String(val);
        const short = str.length > 24 ? `${str.slice(0, 12)}…` : str;
        return { k, v: short, full: str };
      });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={t("Ayarlar & Bölgeler", "Settings & Zones")}
        title={t("Organizasyon, Fabrika, Bölge & RBAC Ayarları", "Organization, Site, Zone & RBAC Settings")}
        subtitle={t(
          "Çok kiracılı fabrika hiyerarşisi, üretim hattı güvenlik bölgeleri, kullanıcı yetkileri ve denetim izleri",
          "Multi-tenant plant hierarchy, production line security zones, user roles and audit logs",
        )}
      />

      {/* 4 TailAdmin StatCard (Sayısal veya kısa metrik değerler, tek satır) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("Aktif Lisans Planı", "Active License Plan")}
          value={planUpper}
          hint={orgQuery.data?.name ?? activeOrg?.name ?? "—"}
          badge={{
            text: ROLE_LABEL[activeOrg?.role ?? "owner"],
            tone: "teal",
          }}
          tone="teal"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        />
        <StatCard
          label={t("Kayıtlı Fabrikalar", "Registered Sites")}
          value={sites.length}
          hint={t("Fiziksel üretim tesisleri", "Physical manufacturing plants")}
          tone="navy"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 21h18M5 21V7l7-4 7 4v14" />
            </svg>
          }
        />
        <StatCard
          label={t("Üretim Bölgeleri", "Production Zones")}
          value={zones.length}
          hint={t("ISA/IEC 62443 güvenlik segmentleri", "ISA/IEC 62443 security segments")}
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
          label={t("Yetkili Kullanıcılar", "Authorized Members")}
          value={membersQuery.data?.length ?? 1}
          hint={t(
            `${auditQuery.data?.total ?? 0} kayıtlı denetim izi`,
            `${auditQuery.data?.total ?? 0} recorded audit events`,
          )}
          tone="emerald"
          badge={{ text: t("RBAC Aktif", "RBAC Active"), tone: "emerald" }}
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
        title={t("Organizasyon Kimliği", "Organization Identity")}
        subtitle={t(
          "Kurumsal kiracı adı ve sistem tanımlayıcıları",
          "Enterprise tenant name and system identifiers",
        )}
      >
        {orgQuery.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-3">
              <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[11px] font-medium text-slate-400 uppercase">
                  {t("Organizasyon Adı", "Organization Name")}
                </div>
                <div className="mt-1 text-sm font-bold text-[#1C2434]">{orgQuery.data.name}</div>
              </div>
              <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[11px] font-medium text-slate-400 uppercase">
                  {t("Lisans Planı & Rol", "License Plan & Role")}
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#0D9488]">
                  {planUpper} · {ROLE_LABEL[orgQuery.data.role]}
                </div>
              </div>
              <div className="rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[11px] font-medium text-slate-400 uppercase">
                  {t("Oluşturulma Tarihi", "Created At")}
                </div>
                <div className="mt-1 font-mono text-xs text-slate-700">
                  {formatDate(orgQuery.data.created_at)}
                </div>
              </div>
            </div>

            {canAdmin && (
              <form onSubmit={handleUpdateOrg} className="flex max-w-md items-end gap-2 pt-1">
                <div className="flex-1">
                  <Field label={t("Organizasyon Adını Güncelle", "Update Organization Name")}>
                    <Input
                      placeholder={orgQuery.data.name}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                    />
                  </Field>
                </div>
                <Button type="submit" disabled={updateOrgMut.isPending || !orgName.trim()}>
                  {t("Kaydet", "Save")}
                </Button>
              </form>
            )}
            <ErrorBox error={updateOrgMut.error} />
          </div>
        )}
      </Card>

      {/* Fabrikalar (Sites) */}
      <Card
        title={t(`Fabrikalar / Tesisler (${sites.length})`, `Sites / Plants (${sites.length})`)}
        subtitle={t(
          "Pasif sensörlerin ve üretim bölgelerinin bağlı olduğu fiziksel lokasyonlar",
          "Physical locations hosting passive sensors and production zones",
        )}
      >
        <div className="space-y-4">
          {canAdmin && (
            <form
              onSubmit={handleCreateSite}
              className="grid grid-cols-1 gap-3 rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-4"
            >
              <Field label={t("Fabrika Adı *", "Site Name *")}>
                <Input
                  required
                  placeholder={t("Örn: Gebze Ana Üretim Tesisi", "e.g. Gebze Main Plant")}
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                />
              </Field>
              <Field label={t("Endüstri / Sektör", "Industry / Sector")}>
                <Input
                  placeholder={t("Örn: Otomotiv & Yan Sanayi", "e.g. Automotive Manufacturing")}
                  value={siteIndustry}
                  onChange={(e) => setSiteIndustry(e.target.value)}
                />
              </Field>
              <Field label={t("Zaman Dilimi", "Timezone")}>
                <Input
                  placeholder="Europe/Istanbul"
                  value={siteTimezone}
                  onChange={(e) => setSiteTimezone(e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={createSiteMut.isPending}>
                  {t("+ Fabrika Ekle", "+ Add Site")}
                </Button>
              </div>
            </form>
          )}

          <ErrorBox error={createSiteMut.error || deleteSiteMut.error} />

          {sitesQuery.isLoading ? (
            <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
          ) : sites.length === 0 ? (
            <Empty>{t("Henüz fabrika tanımlanmadı.", "No sites defined yet.")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">{t("Fabrika Adı", "Site Name")}</th>
                    <th className="px-4 py-3">{t("Sektör", "Industry")}</th>
                    <th className="px-4 py-3">{t("Zaman Dilimi", "Timezone")}</th>
                    <th className="px-4 py-3">{t("Oluşturulma", "Created At")}</th>
                    {canAdmin && <th className="px-4 py-3 text-right">{t("İşlem", "Action")}</th>}
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
                            {t("Sil", "Delete")}
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
        title={t(
          `Üretim Güvenlik Bölgeleri / Hücreler (${zones.length})`,
          `Production Security Zones / Cells (${zones.length})`,
        )}
        subtitle={t(
          "Purdue ve ISA/IEC 62443 segmentasyonuna göre üretim hatları ve kritiklik seviyeleri",
          "Production lines and criticality levels segmented according to Purdue and ISA/IEC 62443",
        )}
      >
        <div className="space-y-4">
          {canAdmin && sites.length > 0 && (
            <form
              onSubmit={handleCreateZone}
              className="grid grid-cols-1 gap-3 rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-5"
            >
              <Field label={t("Fabrika *", "Site *")}>
                <Select value={effectiveSiteId} onChange={(e) => setZoneSiteId(e.target.value)}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("Bölge / Hat Adı *", "Zone / Line Name *")}>
                <Input
                  required
                  placeholder={t("Örn: Gövde Kaynak Hattı", "e.g. Body Welding Line")}
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                />
              </Field>
              <Field label={t("Üretim Kritikliği", "Production Criticality")}>
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
              <Field label={t("Açıklama", "Description")}>
                <Input
                  placeholder={t("VLAN / Hücre bilgisi", "VLAN / Cell details")}
                  value={zoneDesc}
                  onChange={(e) => setZoneDesc(e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={createZoneMut.isPending}>
                  {t("+ Bölge Ekle", "+ Add Zone")}
                </Button>
              </div>
            </form>
          )}

          <ErrorBox error={createZoneMut.error || deleteZoneMut.error} />

          {zonesQuery.isLoading ? (
            <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
          ) : zones.length === 0 ? (
            <Empty>{t("Henüz üretim bölgesi tanımlanmadı.", "No production zones defined yet.")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">{t("Bölge Adı", "Zone Name")}</th>
                    <th className="px-4 py-3">{t("Fabrika", "Site")}</th>
                    <th className="px-4 py-3">{t("Kritiklik", "Criticality")}</th>
                    <th className="px-4 py-3">{t("Açıklama", "Description")}</th>
                    {canAdmin && <th className="px-4 py-3 text-right">{t("İşlem", "Action")}</th>}
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
                              {t("Sil", "Delete")}
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
          title={t("Organizasyon Üyeleri & Rol Tabanlı Erişim (RBAC)", "Organization Members & Role-Based Access (RBAC)")}
          subtitle={t(
            "Platforma erişim yetkisi olan kullanıcılar ve görev rolleri",
            "Users authorized to access the platform and their assigned roles",
          )}
          noPadding
        >
          {membersQuery.isLoading ? (
            <div className="p-6">
              <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-5 py-3">{t("Ad Soyad", "Full Name")}</th>
                    <th className="px-4 py-3">{t("E-posta", "Email")}</th>
                    <th className="px-4 py-3">{t("Rol", "Role")}</th>
                    <th className="px-5 py-3 text-right">{t("Durum", "Status")}</th>
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
                          {m.is_active ? t("Aktif", "Active") : t("Pasif", "Inactive")}
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

      {/* Denetim Kayıtları (Audit Logs) — Okunur metin ve kompakt özet rozetleri */}
      {canAdmin && (
        <Card
          title={t(
            `Güvenlik Denetim Kayıtları (Toplam: ${auditQuery.data?.total ?? 0})`,
            `Security Audit Logs (Total: ${auditQuery.data?.total ?? 0})`,
          )}
          subtitle={t(
            "Sistemde gerçekleştirilen kritik yapılandırma, doğrulama ve sensör işlemlerinin değiştirilemez kaydı",
            "Immutable record of critical configuration, verification and sensor operations",
          )}
          noPadding
        >
          {auditQuery.isLoading ? (
            <div className="p-6">
              <Empty>{t("Yükleniyor…", "Loading…")}</Empty>
            </div>
          ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
            <div className="p-6">
              <Empty>{t("Kayıt yok.", "No records.")}</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="px-5 py-3">{t("Zaman", "Timestamp")}</th>
                    <th className="px-4 py-3">{t("İşlem", "Action")}</th>
                    <th className="px-4 py-3">{t("Hedef Türü", "Target Type")}</th>
                    <th className="px-4 py-3">{t("Kaynak IP", "Source IP")}</th>
                    <th className="px-5 py-3">{t("İşlem Özeti", "Operation Summary")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {auditQuery.data!.items.map((a) => {
                    const entries = formatMetadataEntries(a.metadata);
                    return (
                      <tr key={a.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-5 py-2.5 font-mono whitespace-nowrap text-slate-500">
                          {formatDate(a.created_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-[#1C2434]">
                            {formatAuditAction(a.action)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {formatAuditTarget(a.target_type)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-500">
                          {a.ip_address ?? "—"}
                        </td>
                        <td className="px-5 py-2.5">
                          {entries.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {entries.map((item) => (
                                <span
                                  key={item.k}
                                  title={`${item.k}: ${item.full}`}
                                  className="inline-flex items-center gap-1 rounded-[3px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 font-mono text-[11px] text-[#1C2434]"
                                >
                                  <span className="text-slate-500">{item.k}:</span>
                                  <span>{item.v}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
