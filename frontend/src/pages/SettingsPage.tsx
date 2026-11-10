import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
  ROLE_LABEL,
  Select,
  formatDate,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { AuditLog, Criticality, Member, Organization, Page, Site, Zone } from "../types/api";

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
      api<Organization>(`/organizations/${activeOrg!.id}`, { method: "PATCH", body: { name } }),
    onSuccess: async () => {
      setOrgName("");
      await reloadMe();
      await qc.invalidateQueries({ queryKey: ["org", activeOrg?.id] });
      await qc.invalidateQueries({ queryKey: ["audit-logs", activeOrg?.id] });
    },
  });

  // Yeni fabrika (site) oluşturma
  const [siteName, setSiteName] = useState("");
  const [siteIndustry, setSiteIndustry] = useState("");
  const [siteTimezone, setSiteTimezone] = useState("Europe/Istanbul");

  const createSiteMut = useMutation({
    mutationFn: (body: { name: string; industry: string | null; timezone: string }) =>
      api<Site>("/sites", { method: "POST", body }),
    onSuccess: async () => {
      setSiteName("");
      setSiteIndustry("");
      await qc.invalidateQueries({ queryKey: ["sites", activeOrg?.id] });
      await qc.invalidateQueries({ queryKey: ["audit-logs", activeOrg?.id] });
    },
  });

  const deleteSiteMut = useMutation({
    mutationFn: (siteId: string) => api<void>(`/sites/${siteId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sites", activeOrg?.id] });
      await qc.invalidateQueries({ queryKey: ["audit-logs", activeOrg?.id] });
    },
  });

  // Yeni bölge (zone) oluşturma
  const [zoneSiteId, setZoneSiteId] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [zoneDesc, setZoneDesc] = useState("");
  const [zoneCrit, setZoneCrit] = useState<Criticality>("medium");

  const createZoneMut = useMutation({
    mutationFn: (body: { site_id: string; name: string; description: string | null; criticality: Criticality }) =>
      api<Zone>("/zones", { method: "POST", body }),
    onSuccess: async () => {
      setZoneName("");
      setZoneDesc("");
      await qc.invalidateQueries({ queryKey: ["zones", activeOrg?.id] });
      await qc.invalidateQueries({ queryKey: ["audit-logs", activeOrg?.id] });
    },
  });

  const deleteZoneMut = useMutation({
    mutationFn: (zoneId: string) => api<void>(`/zones/${zoneId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["zones", activeOrg?.id] });
      await qc.invalidateQueries({ queryKey: ["audit-logs", activeOrg?.id] });
    },
  });

  const sites = sitesQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const effectiveSiteId = zoneSiteId || sites[0]?.id || "";

  function handleCreateSite(e: FormEvent) {
    e.preventDefault();
    createSiteMut.mutate({
      name: siteName,
      industry: siteIndustry.trim() ? siteIndustry.trim() : null,
      timezone: siteTimezone,
    });
  }

  function handleCreateZone(e: FormEvent) {
    e.preventDefault();
    if (!effectiveSiteId) return;
    createZoneMut.mutate({
      site_id: effectiveSiteId,
      name: zoneName,
      description: zoneDesc.trim() ? zoneDesc.trim() : null,
      criticality: zoneCrit,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ayarlar"
        subtitle="Organizasyon, fabrika (site), üretim hattı/ağ bölgesi (zone), kullanıcılar ve denetim kayıtları"
      />

      {/* Organizasyon Bilgileri */}
      <Card title="Organizasyon">
        {orgQuery.data && (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-slate-500">Ad:</span>{" "}
                <span className="font-medium text-slate-900">{orgQuery.data.name}</span>
              </div>
              <div>
                <span className="text-slate-500">Paket:</span>{" "}
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium uppercase text-blue-800">
                  {orgQuery.data.plan}
                </span>
              </div>
            </div>
            {canAdmin && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (orgName.trim()) updateOrgMut.mutate(orgName.trim());
                }}
                className="flex items-end gap-2"
              >
                <Field label="Organizasyon adını değiştir">
                  <Input
                    placeholder={orgQuery.data.name}
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </Field>
                <Button type="submit" disabled={!orgName.trim() || updateOrgMut.isPending}>
                  Kaydet
                </Button>
              </form>
            )}
          </div>
        )}
        <ErrorBox error={updateOrgMut.error} />
      </Card>

      {/* Fabrikalar (Sites) */}
      <Card title="Fabrikalar (Sites)">
        <div className="space-y-4">
          {canAdmin && (
            <form onSubmit={handleCreateSite} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field label="Fabrika Adı *">
                <Input
                  required
                  placeholder="Örn: Gebze Ana Tesis"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                />
              </Field>
              <Field label="Sektör">
                <Input
                  placeholder="Örn: Plastik Enjeksiyon"
                  value={siteIndustry}
                  onChange={(e) => setSiteIndustry(e.target.value)}
                />
              </Field>
              <Field label="Saat Dilimi">
                <Input value={siteTimezone} onChange={(e) => setSiteTimezone(e.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={createSiteMut.isPending}>
                  Fabrika Ekle
                </Button>
              </div>
            </form>
          )}
          <ErrorBox error={createSiteMut.error ?? deleteSiteMut.error} />

          {sites.length === 0 ? (
            <Empty>Kayıtlı fabrika bulunmuyor.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Ad</th>
                    <th className="py-2 pr-4">Sektör</th>
                    <th className="py-2 pr-4">Saat Dilimi</th>
                    <th className="py-2 pr-4">Oluşturulma</th>
                    {canAdmin && <th className="py-2 text-right">İşlem</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sites.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">{s.name}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{s.industry ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{s.timezone}</td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500">{formatDate(s.created_at)}</td>
                      {canAdmin && (
                        <td className="py-2.5 text-right">
                          <Button
                            variant="danger"
                            onClick={() => deleteSiteMut.mutate(s.id)}
                            disabled={deleteSiteMut.isPending}
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

      {/* Üretim Hatları / Ağ Bölgeleri (Zones) */}
      <Card title="Üretim Hatları ve Ağ Bölgeleri (Zones)">
        <div className="space-y-4">
          {canAdmin && sites.length > 0 && (
            <form onSubmit={handleCreateZone} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
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
                  placeholder="Örn: Paketleme Hattı 1"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                />
              </Field>
              <Field label="Açıklama">
                <Input
                  placeholder="Örn: VLAN 20 - PLC ağı"
                  value={zoneDesc}
                  onChange={(e) => setZoneDesc(e.target.value)}
                />
              </Field>
              <Field label="Kritiklik">
                <Select value={zoneCrit} onChange={(e) => setZoneCrit(e.target.value as Criticality)}>
                  {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((k) => (
                    <option key={k} value={k}>
                      {CRITICALITY_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={createZoneMut.isPending}>
                  Bölge Ekle
                </Button>
              </div>
            </form>
          )}
          <ErrorBox error={createZoneMut.error ?? deleteZoneMut.error} />

          {zones.length === 0 ? (
            <Empty>
              {sites.length === 0 ? "Önce bir fabrika ekleyin." : "Kayıtlı bölge bulunmuyor."}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Bölge / Hat</th>
                    <th className="py-2 pr-4">Fabrika</th>
                    <th className="py-2 pr-4">Kritiklik</th>
                    <th className="py-2 pr-4">Açıklama</th>
                    {canAdmin && <th className="py-2 text-right">İşlem</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {zones.map((z) => {
                    const site = sites.find((s) => s.id === z.site_id);
                    return (
                      <tr key={z.id}>
                        <td className="py-2.5 pr-4 font-medium text-slate-900">{z.name}</td>
                        <td className="py-2.5 pr-4 text-slate-600">{site?.name ?? "—"}</td>
                        <td className="py-2.5 pr-4">
                          <CriticalityBadge value={z.criticality} />
                        </td>
                        <td className="py-2.5 pr-4 text-slate-600">{z.description ?? "—"}</td>
                        {canAdmin && (
                          <td className="py-2.5 text-right">
                            <Button
                              variant="danger"
                              onClick={() => deleteZoneMut.mutate(z.id)}
                              disabled={deleteZoneMut.isPending}
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

      {/* Üyeler ve Roller */}
      {canAdmin && (
        <Card title="Kullanıcılar ve Roller">
          {membersQuery.isLoading ? (
            <Empty>Yükleniyor…</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Ad Soyad</th>
                    <th className="py-2 pr-4">E-posta</th>
                    <th className="py-2 pr-4">Rol</th>
                    <th className="py-2">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(membersQuery.data ?? []).map((m) => (
                    <tr key={m.user_id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">{m.full_name}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{m.email}</td>
                      <td className="py-2.5 pr-4">{ROLE_LABEL[m.role] ?? m.role}</td>
                      <td className="py-2.5">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${m.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                        >
                          {m.is_active ? "Aktif" : "Pasif"}
                        </span>
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
        <Card title={`Denetim Kayıtları (Toplam: ${auditQuery.data?.total ?? 0})`}>
          {auditQuery.isLoading ? (
            <Empty>Yükleniyor…</Empty>
          ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
            <Empty>Kayıt yok.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Zaman</th>
                    <th className="py-2 pr-4">İşlem</th>
                    <th className="py-2 pr-4">Hedef</th>
                    <th className="py-2 pr-4">IP</th>
                    <th className="py-2">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditQuery.data!.items.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 pr-4 whitespace-nowrap text-slate-500">{formatDate(a.created_at)}</td>
                      <td className="py-2 pr-4 font-mono font-medium text-slate-800">{a.action}</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {a.target_type ? `${a.target_type}:${a.target_id?.slice(0, 8) ?? ""}` : "—"}
                      </td>
                      <td className="py-2 pr-4 font-mono text-slate-500">{a.ip_address ?? "—"}</td>
                      <td className="py-2 font-mono text-slate-600">{JSON.stringify(a.metadata)}</td>
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
