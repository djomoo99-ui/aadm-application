import { ChevronLeft, ChevronRight, Filter, History } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { AuditData } from "../../../shared/audit";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { usePrivateApi } from "../../hooks/usePrivateApi";

const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm";
const actionLabels: Record<string, string> = {
  "household.created": "Foyer créé", "household.updated": "Foyer modifié",
  "member.created": "Membre ajouté", "member.updated": "Membre modifié",
  "responsible.roles_updated": "Rôles modifiés", "responsible.suspended": "Compte suspendu",
  "responsible.reactivated": "Compte réactivé", "responsible.sessions_revoked": "Sessions fermées",
  "payment.created": "Paiement enregistré", "payment.reversed": "Paiement annulé",
  "export.csv_created": "Export CSV créé", "backup.created": "Sauvegarde créée",
  "calendar.dues_generated": "Échéances annuelles générées",
  "alerts.scan_completed": "Contrôle des alertes effectué",
  "alerts.status_updated": "État d’une alerte modifié",
  "access_request.approved": "Compte validé",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AuditLogPage() {
  const [draft, setDraft] = useState({ q: "", from: "", to: "" });
  const [filters, setFilters] = useState({ q: "", from: "", to: "", page: 1 });
  const params = new URLSearchParams({ q: filters.q, from: filters.from, to: filters.to, page: String(filters.page) });
  const { data, loading, error, reload } = usePrivateApi<AuditData>(`/api/office/audit-logs?${params}`);
  const submit = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft, page: 1 }); };
  return <AppFrame area="office" title="Journal d’audit" subtitle="Actions sensibles et responsables" activePath="/bureau/plus">
    <div className="space-y-4">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="col-span-2 grid gap-1 text-xs font-bold text-slate-600">Recherche<input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Action, personne ou type…" className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">Du<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">Au<input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className={inputClass} /></label>
        <button className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-800 font-black text-white"><Filter size={17} /> Appliquer les filtres</button>
      </form>
      {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée."} retry={() => void reload()} /> : <>
        <p className="text-xs font-bold text-slate-500">{data.total} action(s) trouvée(s)</p>
        <div className="space-y-3">{data.items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-800"><History size={19} /></span><div className="min-w-0 flex-1"><h2 className="font-black">{actionLabels[item.action] ?? item.action}</h2><p className="text-xs text-slate-500">{formatDateTime(item.createdAt)} · {item.actorName}</p><p className="mt-1 text-xs font-bold text-slate-600">{item.entityType}{item.entityId ? ` · ${item.entityId.slice(0, 18)}` : ""}</p></div></div>{item.oldValues || item.newValues ? <details className="mt-3 rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-black text-blue-900">Voir les détails techniques</summary><div className="mt-2 grid gap-2 text-[11px]"><pre className="overflow-x-auto whitespace-pre-wrap">Avant : {JSON.stringify(item.oldValues, null, 2)}</pre><pre className="overflow-x-auto whitespace-pre-wrap">Après : {JSON.stringify(item.newValues, null, 2)}</pre></div></details> : null}</article>)}</div>
        <div className="flex items-center justify-between rounded-xl bg-white p-2"><button disabled={data.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })} className="grid size-10 place-items-center rounded-lg text-blue-800 disabled:opacity-30" aria-label="Page précédente"><ChevronLeft /></button><span className="text-xs font-black">Page {data.page} sur {data.pageCount}</span><button disabled={data.page >= data.pageCount} onClick={() => setFilters({ ...filters, page: filters.page + 1 })} className="grid size-10 place-items-center rounded-lg text-blue-800 disabled:opacity-30" aria-label="Page suivante"><ChevronRight /></button></div>
      </>}
    </div>
  </AppFrame>;
}
