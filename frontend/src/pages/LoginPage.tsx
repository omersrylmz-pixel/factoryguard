import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { Button, ErrorBox, Field, Input } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useLang } from "../i18n";

export default function LoginPage() {
  const { status, login } = useAuth();
  const { lang, setLang, t } = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="flex min-h-screen items-center justify-center bg-[#F1F5F9] p-4">
      <div className="grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-[4px] border border-[#E2E8F0] bg-white shadow-[0px_8px_13px_-3px_rgba(0,0,0,0.07)] md:grid-cols-12">
        {/* Sol: TailAdmin Koyu Lacivert Marka Paneli */}
        <div className="flex flex-col justify-between bg-[#1C2434] p-8 text-white md:col-span-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[4px] bg-[#0D9488] text-white">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight">FactoryGuard Lite</div>
                <div className="text-xs text-[#8A99AF]">
                  {t("Endüstriyel OT Varlık & Risk Görünürlüğü", "Industrial OT Asset & Risk Visibility")}
                </div>
              </div>
            </div>

            <h2 className="mt-8 text-xl font-bold leading-snug text-white">
              {t(
                "Üretim Ağları İçin Pasif Varlık Görünürlüğü ve Açıklanabilir Risk Yönetimi",
                "Passive Asset Visibility and Explainable Risk Management for OT Networks",
              )}
            </h2>
            <p className="mt-3 text-xs leading-relaxed text-[#DEE4EE]">
              {t(
                "SPAN / TAP ve Zeek telemetrisi üzerinden PLC, HMI, SCADA ve saha cihazlarını üretim sürekliliğine müdahale etmeden keşfedin, topolojiyi izleyin ve kanıta dayalı riskleri yönetin.",
                "Discover PLC, HMI, SCADA and field devices passively via SPAN / TAP and Zeek telemetry without disrupting production continuity.",
              )}
            </p>
          </div>

          <div className="mt-8 space-y-2 border-t border-[#2E3A47] pt-4 text-xs text-[#8A99AF]">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#14B8A6]" />
              <span>
                {t("Yalnızca Pasif Gözlem · Sıfır Aktif Tarama", "Passive Observation Only · Zero Active Scanning")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#14B8A6]" />
              <span>
                {t(
                  "Kanıta Dayalı Sınıflandırma ve Açıklanabilir Risk Motoru",
                  "Evidence-Based Classification & Explainable Risk Engine",
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Sağ: Giriş Formu */}
        <div className="flex flex-col justify-center p-8 md:col-span-6">
          <div className="mb-6 flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-semibold tracking-wider text-[#0D9488] uppercase">
                {t("OT Güvenlik Konsolu", "OT Security Console")}
              </span>
              <h1 className="mt-1 text-xl font-bold text-[#1C2434]">
                {t("Hesabınıza Giriş Yapın", "Sign In to Your Account")}
              </h1>
              <p className="mt-1 text-xs text-[#64748B]">
                {t(
                  "Envanter ve risk merkezine erişmek için kimlik bilgilerinizi girin.",
                  "Enter your credentials to access the inventory and risk console.",
                )}
              </p>
            </div>

            <div
              role="group"
              aria-label={t("Arayüz dili", "Interface language")}
              className="flex h-8 shrink-0 items-center rounded-[4px] border border-[#E2E8F0] bg-[#F8FAFC] p-0.5"
            >
              {(["tr", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`h-full rounded-[3px] px-2 text-[11px] font-semibold uppercase transition-colors ${
                    lang === l ? "bg-[#1C2434] text-white" : "text-[#64748B] hover:text-[#1C2434]"
                  }`}
                >
                  {l}
                </button>
              ))}
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
              {busy ? t("Oturum Açılıyor…", "Signing In…") : t("Giriş Yap", "Sign In")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
