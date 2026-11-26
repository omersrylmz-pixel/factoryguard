import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { InteractiveDotGrid, SpotlightCard } from "../components/reactBits";
import { Button, ErrorBox, Field, Input } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useLang } from "../i18n";

export default function LoginPage() {
  const { status, login } = useAuth();
  const { lang, setLang, theme, toggleTheme, t } = useLang();
  const [email, setEmail] = useState("admin@factoryguard.com");
  const [password, setPassword] = useState("FactoryGuard2026!");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#F1F5F9] p-4 dark:bg-[#0B0F19]">
      <InteractiveDotGrid dotColor="rgba(56, 189, 248, 0.16)" />
      <SpotlightCard
        tone="teal"
        className="relative z-10 grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-[10px] border border-[#CBD5E1] bg-white shadow-[0px_20px_45px_-10px_rgba(15,23,42,0.22)] md:grid-cols-12 dark:border-[#1E293B] dark:bg-[#111827] dark:shadow-[0px_24px_60px_rgba(0,0,0,0.65)]"
      >
        {/* Sol: Endüstriyel Komuta Marka Paneli */}
        <div className="relative flex flex-col justify-between overflow-hidden border-b border-[#1E293B] bg-[#070B14] p-8 text-white md:col-span-6 md:border-r md:border-b-0">
          <InteractiveDotGrid dotColor="rgba(56, 189, 248, 0.14)" />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-blue-400/30 bg-gradient-to-br from-[#2563EB] to-[#0284C7] text-white shadow-[0_2px_12px_rgba(37,99,235,0.4)]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <div className="font-display text-lg font-bold tracking-tight text-white">
                  FactoryGuard Lite
                </div>
                <div className="font-mono text-[10px] font-semibold tracking-wider text-sky-400 uppercase">
                  {t("OT KOMUTA & AÇIKLANABİLİR RİSK", "OT COMMAND & EXPLAINABLE RISK")}
                </div>
              </div>
            </div>

            <h1 className="font-display mt-8 text-xl leading-snug font-bold text-white">
              {t(
                "Saha Ekipmanına Dokunmadan Tam OT Görünürlüğü.",
                "Complete OT Visibility Without Touching Field Devices.",
              )}
            </h1>
            <p className="mt-3 text-xs leading-relaxed text-[#94A3B8]">
              {t(
                "SPAN / Port Mirroring ve PCAP kayıtlarından 7 endüstriyel protokolde (Modbus, S7comm, EtherNet/IP, OPC UA, BACnet, DNP3, PROFINET) pasif varlık keşfi ve kanıta dayalı risk analizi.",
                "Passive asset discovery and evidence-based risk analysis across 7 industrial protocols (Modbus, S7comm, EtherNet/IP, OPC UA, BACnet, DNP3, PROFINET) from SPAN / mirror traffic.",
              )}
            </p>
          </div>

          <div className="relative z-10 mt-8 space-y-2.5 border-t border-[#1E293B] pt-5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#94A3B8]">{t("Saha Güvenlik Modu", "Field Safety Mode")}</span>
              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t("%100 PASİF · 0 PAKET ENJEKSİYONU", "100% PASSIVE · 0 PACKET INJECTION")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#94A3B8]">{t("Uyumluluk Çerçevesi", "Compliance Framework")}</span>
              <span className="font-mono text-[11px] font-semibold text-sky-300">
                ISA/IEC 62443 · Purdue L0–L3
              </span>
            </div>
          </div>
        </div>

        {/* Sağ: Giriş Formu */}
        <div className="flex flex-col justify-center p-8 md:col-span-6">
          <div className="mb-6 flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-[#1C2434]">
                {t("Komuta Konsoluna Giriş", "Sign In to Command Console")}
              </h2>
              <p className="mt-1 text-xs text-[#64748B]">
                {t(
                  "Envanter ve risk merkezine erişmek için kimlik bilgilerinizi girin.",
                  "Enter your credentials to access the inventory and risk console.",
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={toggleTheme}
                title={t("Koyu / Açık Mod", "Toggle Dark / Light Mode")}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[5px] border border-[#CBD5E1] bg-[#F8FAFC] text-[#1C2434] transition hover:border-blue-500 dark:border-[#334155] dark:bg-[#161F30] dark:text-[#F8FAFC]"
              >
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
              <div
                role="group"
                aria-label={t("Arayüz dili", "Interface language")}
                className="flex h-8 shrink-0 items-center rounded-[5px] border border-[#CBD5E1] bg-[#F8FAFC] p-0.5 dark:border-[#334155] dark:bg-[#161F30]"
              >
                {(["tr", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    aria-pressed={lang === l}
                    className={`h-full cursor-pointer rounded-[4px] px-2 text-[11px] font-bold uppercase transition-colors ${
                      lang === l
                        ? "bg-[#2563EB] text-white"
                        : "text-[#64748B] hover:text-[#1C2434] dark:text-[#94A3B8] dark:hover:text-white"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label={t("Kurumsal E-posta Adresi", "Corporate Email Address")}>
              <Input
                type="email"
                autoComplete="username"
                placeholder="admin@factoryguard.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label={t("Parola", "Password")}>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorBox error={error} />
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? t("Oturum Açılıyor…", "Signing In…") : t("Konsola Giriş Yap →", "Sign In to Console →")}
            </Button>

            <div className="flex items-center justify-between rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#64748B] dark:border-[#1E293B] dark:bg-[#161F30]">
              <span className="font-mono">admin@factoryguard.com</span>
              <button
                type="button"
                onClick={() => {
                  setEmail("admin@factoryguard.com");
                  setPassword("FactoryGuard2026!");
                }}
                className="cursor-pointer font-semibold text-[#2563EB] hover:underline dark:text-sky-400"
              >
                {t("Demo Bilgilerini Doldur", "Fill Demo Credentials")}
              </button>
            </div>
          </form>
        </div>
      </SpotlightCard>
    </div>
  );
}
