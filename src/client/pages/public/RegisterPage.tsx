import { ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

export function RegisterPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");

    if (password !== String(form.get("passwordConfirmation") ?? "")) {
      setError("Les deux mots de passe ne correspondent pas.");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim().toLowerCase(),
          phone: String(form.get("phone") ?? "").trim(),
          memberNumber: String(form.get("memberNumber") ?? "").trim().toUpperCase(),
          password,
        }),
      });

      if (!response.ok) {
        setError("Création impossible. Vérifiez les informations saisies.");
        return;
      }

      const signInResponse = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim().toLowerCase(),
          password,
          rememberMe: true,
        }),
      });

      if (!signInResponse.ok) {
        setError("Si cette adresse possède déjà un compte, utilisez la page de connexion.");
        return;
      }

      await refresh();
      navigate("/validation", { replace: true });
    } catch {
      setError("Le service est momentanément indisponible. Réessayez dans quelques instants.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-medium outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="min-h-dvh bg-slate-100 p-4 text-slate-950">
      <main className="mx-auto w-full max-w-[520px] rounded-3xl bg-white p-6 shadow-xl">
        <p className="text-sm font-black tracking-[0.16em] text-[#173B57]">AADM</p>
        <h1 className="mt-5 text-3xl font-black">Créer mon compte</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">Vos informations seront rapprochées du registre des membres par une personne autorisée.</p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-bold">Nom et prénom<input name="name" autoComplete="name" minLength={2} maxLength={100} required className={inputClass} /></label>
          <label className="block text-sm font-bold">Numéro de membre AADM<input name="memberNumber" autoCapitalize="characters" maxLength={20} required className={inputClass} placeholder="Exemple : 00482" /></label>
          <label className="block text-sm font-bold">Téléphone<input name="phone" type="tel" autoComplete="tel" minLength={8} maxLength={25} required className={inputClass} placeholder="+33…" /></label>
          <label className="block text-sm font-bold">Adresse e-mail<input name="email" type="email" autoComplete="email" required className={inputClass} /></label>
          <label className="block text-sm font-bold">Mot de passe<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required className={inputClass} /><small className="mt-1 block font-medium text-slate-500">Au moins 10 caractères.</small></label>
          <label className="block text-sm font-bold">Confirmer le mot de passe<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} maxLength={128} required className={inputClass} /></label>

          {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p> : null}

          <button disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-extrabold text-white disabled:opacity-60"><ShieldCheck size={18} /> {submitting ? "Création…" : "Envoyer ma demande"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">Déjà inscrit ? <Link to="/connexion" className="font-extrabold text-blue-800">Se connecter</Link></p>
      </main>
    </div>
  );
}
