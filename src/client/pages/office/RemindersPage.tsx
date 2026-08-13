import { AlertTriangle, CheckCircle2, Clock3, History, MessageCircle, PhoneOff, Send } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  PreparedReminder,
  ReminderCandidate,
  ReminderCandidatesData,
  ReminderHistoryData,
  ReminderKind,
} from "../../../shared/reminders";
import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { StatusBadge } from "../../components/StatusBadge";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatDate, formatEuros } from "../../utils/format";

function candidateKey(candidate: ReminderCandidate) {
  return `${candidate.householdReference}:${candidate.kind}`;
}

export function RemindersPage() {
  const { access } = useAuth();
  const candidatesApi = usePrivateApi<ReminderCandidatesData>("/api/office/reminders/candidates");
  const historyApi = usePrivateApi<ReminderHistoryData>("/api/office/reminders/history");
  const [tab, setTab] = useState<"candidates" | "history">("candidates");
  const [filter, setFilter] = useState<"all" | ReminderKind>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prepared, setPrepared] = useState<PreparedReminder[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [loadingAction, setLoadingAction] = useState(false);
  const [actionError, setActionError] = useState("");
  const canPrepare = access?.roles.some((role) => role === "treasurer" || role === "admin") ?? false;
  const visible = useMemo(() => candidatesApi.data?.candidates.filter((item) => filter === "all" || item.kind === filter) ?? [], [candidatesApi.data, filter]);

  function toggle(candidate: ReminderCandidate) {
    const key = candidateKey(candidate);
    setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else if (next.size < 20) next.add(key); return next; });
  }

  async function prepareSelected() {
    if (!candidatesApi.data || selected.size === 0) return;
    const chosen = candidatesApi.data.candidates.filter((candidate) => selected.has(candidateKey(candidate)));
    setLoadingAction(true); setActionError("");
    try {
      const response = await fetch("/api/office/reminders/prepare", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosen.map((candidate) => ({ householdReference: candidate.householdReference, kind: candidate.kind, idempotencyKey: crypto.randomUUID() })) }),
      });
      const body = (await response.json().catch(() => ({}))) as { prepared?: PreparedReminder[]; message?: string };
      if (!response.ok || !body.prepared) throw new Error(body.message ?? "Impossible de préparer les rappels.");
      setPrepared(body.prepared); setSelected(new Set());
      await Promise.all([candidatesApi.reload(), historyApi.reload()]);
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : "Une erreur est survenue."); }
    finally { setLoadingAction(false); }
  }

  async function markSent(reminder: PreparedReminder) {
    setLoadingAction(true); setActionError("");
    try {
      const response = await fetch(`/api/office/reminders/${encodeURIComponent(reminder.id)}/sent`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Impossible de confirmer l’envoi.");
      setSent((current) => new Set(current).add(reminder.id));
      await historyApi.reload();
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : "Une erreur est survenue."); }
    finally { setLoadingAction(false); }
  }

  return (
    <AppFrame area="office" title="Rappels WhatsApp" subtitle="Préparation gratuite et envoi manuel" activePath="/bureau/plus">
      <div className="space-y-4">
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4"><div className="flex gap-3"><MessageCircle className="shrink-0 text-green-700" /><div><h2 className="font-black text-green-950">Aucun envoi automatique</h2><p className="mt-1 text-sm text-green-800">WhatsApp s’ouvre avec le texte préparé. Vérifiez-le, puis appuyez vous-même sur Envoyer.</p></div></div></section>
        <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1"><button onClick={() => setTab("candidates")} className={`rounded-lg px-3 py-2 text-sm font-extrabold ${tab === "candidates" ? "bg-white text-blue-900 shadow" : "text-slate-600"}`}>À préparer</button><button onClick={() => setTab("history")} className={`rounded-lg px-3 py-2 text-sm font-extrabold ${tab === "history" ? "bg-white text-blue-900 shadow" : "text-slate-600"}`}>Historique</button></div>
        {actionError ? <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle size={18} className="shrink-0" /> {actionError}</p> : null}

        {prepared.length && tab === "candidates" ? <section className="space-y-3 rounded-2xl border-2 border-green-300 bg-green-50 p-4"><div><h2 className="font-black text-green-950">Messages prêts</h2><p className="text-xs text-green-800">Ouvrez et envoyez chaque message séparément.</p></div>{prepared.map((reminder) => <article key={reminder.id} className="rounded-xl bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{reminder.householdName}</p><p className="text-xs text-slate-500">{formatEuros(reminder.amountCents)} · {reminder.periodLabel}</p></div>{sent.has(reminder.id) ? <CheckCircle2 className="text-green-700" /> : null}</div>{!sent.has(reminder.id) ? <><a href={reminder.whatsappUrl} target="_blank" rel="noreferrer" onClick={() => setOpened((current) => new Set(current).add(reminder.id))} className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 font-extrabold text-white"><MessageCircle size={19} /> Ouvrir WhatsApp</a>{opened.has(reminder.id) ? <button type="button" disabled={loadingAction} onClick={() => void markSent(reminder)} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-700 bg-white text-sm font-extrabold text-green-800 disabled:opacity-50"><Send size={17} /> J’ai réellement envoyé le message</button> : null}</> : <p className="mt-3 text-sm font-bold text-green-800">Envoi confirmé dans l’historique.</p>}</article>)}</section> : null}

        {tab === "candidates" ? <>{candidatesApi.loading ? <MemberLoading /> : candidatesApi.error || !candidatesApi.data ? <MemberError message={candidatesApi.error || "Aucune donnée reçue."} retry={() => void candidatesApi.reload()} /> : <><section className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center"><p className="text-2xl font-black text-red-950">{candidatesApi.data.overdueCount}</p><p className="text-xs font-bold text-red-800">Impayés</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4 text-center"><p className="text-2xl font-black">{candidatesApi.data.upcomingCount}</p><p className="text-xs font-bold text-slate-600">À venir sous 60 jours</p></div></section><div className="flex gap-2 overflow-x-auto">{(["all", "overdue", "upcoming"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold ${filter === value ? "bg-[#173B57] text-white" : "border border-slate-200 bg-white"}`}>{value === "all" ? "Tous" : value === "overdue" ? "Cotisations passées" : "Cotisations à venir"}</button>)}</div>{visible.length ? <section className="space-y-3">{visible.map((candidate) => { const disabled = !canPrepare || !candidate.phoneReady || candidate.recentlyReminded; const checked = selected.has(candidateKey(candidate)); return <article key={candidateKey(candidate)} className={`rounded-2xl border bg-white p-4 shadow-sm ${checked ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}><div className="flex items-start gap-3">{canPrepare ? <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(candidate)} className="mt-1 size-5 accent-blue-800" aria-label={`Sélectionner ${candidate.householdName}`} /> : null}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">{candidate.householdName}</h3><StatusBadge label={candidate.kind === "overdue" ? candidate.statusLabel : candidate.statusLabel} tone={candidate.statusTone} /></div><p className="mt-2 text-lg font-black">{formatEuros(candidate.amountCents)}</p><p className="text-xs text-slate-500">{candidate.periodLabel}</p>{candidate.phoneReady ? <p className="mt-2 text-xs font-bold text-green-800">WhatsApp : {candidate.phone}</p> : <p className="mt-2 flex items-center gap-1 text-xs font-bold text-red-700"><PhoneOff size={14} /> Numéro international à corriger</p>}{candidate.recentlyReminded ? <p className="mt-2 flex items-center gap-1 text-xs font-bold text-orange-700"><Clock3 size={14} /> Rappel préparé dans les 7 derniers jours</p> : null}<details className="mt-3"><summary className="cursor-pointer text-xs font-extrabold text-blue-800">Voir le message</summary><p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-xs leading-relaxed">{candidate.messagePreview}</p></details></div></div></article>; })}</section> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><CheckCircle2 className="mx-auto text-green-600" /><h2 className="mt-3 font-extrabold">Aucun rappel dans cette catégorie</h2></section>}{canPrepare && selected.size ? <button type="button" onClick={() => void prepareSelected()} disabled={loadingAction} className="sticky bottom-20 min-h-14 w-full rounded-xl bg-[#173B57] px-4 font-extrabold text-white shadow-lg disabled:opacity-50">Préparer {selected.size} message{selected.size > 1 ? "s" : ""}</button> : null}</>}</> : <HistoryPanel data={historyApi.data} loading={historyApi.loading} error={historyApi.error} retry={historyApi.reload} />}
      </div>
    </AppFrame>
  );
}

function HistoryPanel({ data, loading, error, retry }: { data: ReminderHistoryData | null; loading: boolean; error: string; retry: () => Promise<void> }) {
  if (loading) return <MemberLoading />;
  if (!data || error) return <MemberError message={error || "Aucune donnée reçue."} retry={() => void retry()} />;
  if (!data.reminders.length) return <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><History className="mx-auto text-slate-400" /><h2 className="mt-3 font-extrabold">Aucun rappel enregistré</h2></section>;
  return <section className="space-y-3">{data.reminders.map((reminder) => <article key={reminder.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{reminder.householdName}</p><p className="text-xs text-slate-500">{reminder.kind === "overdue" ? "Cotisation passée" : "Cotisation à venir"} · {formatEuros(reminder.amountCents)}</p></div><StatusBadge label={reminder.status === "sent" ? "Envoyé" : "Préparé"} tone={reminder.status === "sent" ? "blue" : "grey"} /></div><div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs"><p><strong>Préparé :</strong> {formatDate(reminder.createdAt.slice(0, 10))} par {reminder.createdByName}</p>{reminder.sentAt ? <p className="mt-1"><strong>Envoi confirmé :</strong> {formatDate(reminder.sentAt.slice(0, 10))}{reminder.sentByName ? ` par ${reminder.sentByName}` : ""}</p> : null}<p className="mt-1"><strong>Numéro :</strong> {reminder.recipientPhone}</p></div></article>)}</section>;
}

