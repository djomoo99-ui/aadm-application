import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

export function LoginPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim().toLowerCase(),
          password: String(form.get("password") ?? ""),
          rememberMe: true,
        }),
      });

      if (!response.ok) {
        setError("Adresse e-mail ou mot de passe incorrect.");
        return;
      }

      await refresh();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/membre", { replace: true });
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau puis réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-100 p-4 text-slate-950">
      <main className="mx-auto min-h-[calc(100dvh-2rem)] w-full max-w-[520px] rounded-3xl bg-white p-6 shadow-xl">
        <div className="mx-auto mt-6 grid size-16 place-items-center rounded-2xl bg-[#173B57] text-xl font-black tracking-wider text-white">AADM</div>
        <h1 className="mt-7 text-center text-3xl font-black">Connexion</h1>
        <p className="mt-2 text-center text-sm text-slate-600">Accédez uniquement à vos informations AADM.</p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-bold">
            Adresse e-mail
            <input name="email" type="email" autoComplete="email" required className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-medium outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block text-sm font-bold">
            Mot de passe
            <span className="relative mt-2 block">
              <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="min-h-12 w-full rounded-xl border border-slate-300 px-4 pr-12 font-medium outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button>
            </span>
          </label>

          {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p> : null}

          <button disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-extrabold text-white disabled:opacity-60">
            <LockKeyhole size={18} /> {submitting ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-600">Pas encore de compte ? <Link to="/inscription" className="font-extrabold text-blue-800">Créer mon compte</Link></p>
        <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">L’accès aux cotisations et au QR nécessite une validation par le bureau.</p>
      </main>
    </div>
  );
}

