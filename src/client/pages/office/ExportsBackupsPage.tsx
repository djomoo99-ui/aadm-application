import { DatabaseBackup, Download, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { ExportSummary } from "../../../shared/audit";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { usePrivateApi } from "../../hooks/usePrivateApi";

const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm";

async function downloadFile(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "Le fichier n’a pas pu être créé.");
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "AADM-export";
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = objectUrl; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Aucune sauvegarde créée";
}

export function ExportsBackupsPage() {
  const { data, loading, error, reload } = usePrivateApi<ExportSummary>("/api/office/exports/summary");
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const execute = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setNotice("");
    try { await action(); setIsError(false); setNotice(success); await reload(); }
    catch (caught) { setIsError(true); setNotice(caught instanceof Error ? caught.message : "Erreur."); }
    finally { setBusy(false); }
  };
  const exportCsv = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void execute(() => downloadFile("/api/office/exports/csv", { type: form.get("type"), confirmation: form.get("confirmation"), reason: form.get("reason") }), "Export créé et téléchargement lancé.");
  };
  const backup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void execute(() => downloadFile("/api/office/backups", { confirmation: form.get("confirmation"), reason: form.get("reason") }), "Sauvegarde créée et téléchargement lancé.");
  };
  return <AppFrame area="office" title="Exports et sauvegardes" subtitle="Copies administratives sécurisées" activePath="/bureau/plus">
    <div className="space-y-4">
      {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée."} retry={() => void reload()} /> : <section className="grid grid-cols-2 gap-3">{[["Membres", data.members], ["Foyers", data.households], ["Cotisations", data.contributions], ["Paiements", data.payments]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="text-2xl font-black text-blue-950">{value}</p></div>)}</section>}
      <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-black text-blue-900"><FileSpreadsheet size={20} /> Exporter un fichier CSV</summary>
        <p className="mt-2 text-xs text-slate-500">Fichier lisible dans Excel. Les cellules sont protégées contre l’exécution de formules importées.</p>
        <form onSubmit={exportCsv} className="mt-4 grid gap-3"><select name="type" className={inputClass}><option value="members">Membres et foyers</option><option value="contributions">Cotisations</option><option value="payments">Paiements et annulations</option></select><input name="confirmation" required placeholder="Recopiez EXPORTER" className={inputClass} /><input name="reason" required minLength={5} maxLength={300} placeholder="Raison du téléchargement" className={inputClass} /><button disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-800 font-black text-white disabled:opacity-40"><Download size={18} /> Télécharger le CSV</button></form>
      </details>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><ShieldAlert className="shrink-0 text-amber-800" /><div><h2 className="font-black text-amber-950">Fichier sensible</h2><p className="mt-1 text-xs text-amber-900">La sauvegarde contient des noms, téléphones et données financières. Conservez-la dans un espace privé protégé. Ne l’envoyez jamais sur WhatsApp.</p></div></div></section>
      <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-black text-blue-900"><DatabaseBackup size={20} /> Créer une sauvegarde métier</summary>
        <p className="mt-2 text-xs text-slate-500">Dernière sauvegarde : {formatDate(data?.lastBackupAt ?? null)}{data?.lastBackupBy ? ` par ${data.lastBackupBy}` : ""}.</p><p className="mt-1 text-xs text-slate-500">Le fichier exclut les mots de passe, comptes de connexion, sessions, secrets et codes QR.</p>
        <form onSubmit={backup} className="mt-4 grid gap-3"><input name="confirmation" required placeholder="CREER UNE SAUVEGARDE" className={inputClass} /><input name="reason" required minLength={5} maxLength={300} placeholder="Raison de la sauvegarde" className={inputClass} /><button disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-700 font-black text-white disabled:opacity-40"><DatabaseBackup size={18} /> Créer et télécharger</button></form>
      </details>
      {notice ? <p role="status" className={`rounded-xl p-3 text-sm font-bold ${isError ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{notice}</p> : null}
    </div>
  </AppFrame>;
}
