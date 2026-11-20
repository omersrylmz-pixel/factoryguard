import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { Button, ErrorBox, Field, Input } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { status, login } = useAuth();
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
                <div className="text-xs text-[#8A99AF]">Industrial OT Asset & Risk Visibility</div>
              </div>
            </div>

            <h2 className="mt-8 text-xl font-bold leading-snug text-white">
              Endüstriyel Üretim Ağları İçin Pasif Varlık Görünürlüğü ve Açıklanabilir Risk Yönetimi
            </h2>
            <p className="mt-3 text-xs leading-relaxed text-[#DEE4EE]">
              SPAN / Port Mirror ve Zeek telemetrisi üzerinden PLC, HMI, SCADA ve saha cihazlarını üretim
              sürekliliğine müdahale etmeden keşfedin, topolojiyi izleyin ve kanıta dayalı riskleri yönetin.
            </p>
          </div>

          <div className="mt-8 space-y-2 border-t border-[#2E3A47] pt-4 text-xs text-[#8A99AF]">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#14B8A6]" />
              <span>%100 Pasif Gözlem · Sıfır Aktif Ağ Taraması</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#14B8A6]" />
              <span>Kanıta Dayalı Sınıflandırma ve 100 Puanlık Açıklanabilir Risk Motoru</span>
            </div>
          </div>
        </div>

        {/* Sağ: Giriş Formu */}
        <div className="flex flex-col justify-center p-8 md:col-span-6">
          <div className="mb-6">
            <span className="text-xs font-semibold tracking-wider text-[#0D9488] uppercase">
              OT Security Console
            </span>
            <h1 className="mt-1 text-xl font-bold text-[#1C2434]">Hesabınıza Giriş Yapın</h1>
            <p className="mt-1 text-xs text-[#64748B]">
              Fabrika envanteri ve risk merkezine erişmek için kimlik bilgilerinizi girin.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Kurumsal E-posta Adresi">
              <Input
                type="email"
                autoComplete="username"
                placeholder="admin@factoryguard.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Parola">
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
              {busy ? "Oturum Açılıyor…" : "Giriş Yap"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
