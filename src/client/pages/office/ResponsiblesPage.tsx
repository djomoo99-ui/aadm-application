import { Building2, KeyRound, Search, ShieldCheck, UserCog, UserRoundCheck, UserRoundX } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { ResponsibleItem, ResponsibleRoleCode, ResponsiblesData } from "../../../shared/responsibles";
import type { OfficesData } from "../../../shared/offices";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { privateMutation } from "../../utils/privateMutation";

const officeRoles: Array<{ code: Exclude<ResponsibleRoleCode, "member">; label: string; detail: string }> = [
  { code: "data_entry", label: "Agent de saisie", detail: "Foyers et membres" },
  { code: "controller", label: "Contrôleur", detail: "Consultation et vérifications" },
  { code: "treasurer", label: "Trésorier", detail: "Paiements et corrections" },
  { code: "admin", label: "Administrateur", detail: "Tous les réglages sensibles" },
];
const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm";

function formatSessionDate(value: string | null) {
  if (!value) return "Aucune session active";
  return `Dernière ouverture : ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))}`;
}

function ResponsibleCard({ item, isSelf, activeAdminCount, offices, reload }: {
  item: ResponsibleItem;
  isSelf: boolean;
  activeAdminCount: number;
  offices: OfficesData["offices"];
  reload: () => Promise<void>;
}) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setNotice("");
    try { await action(); setError(false); setNotice(success); await reload(); }
    catch (caught) { setError(true); setNotice(caught instanceof Error ? caught.message : "L’action a échoué."); }
    finally { setBusy(false); }
  };
  const updateRoles = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const roles = form.getAll("roles") as string[];
    void run(() => privateMutation(`/api/office/responsibles/${item.profileId}/roles`, "PATCH", {
      roles, reason: form.get("reason"), expectedUpdatedAt: item.updatedAt,
    }), "Rôles mis à jour et journalisés.");
  };
  const changeStatus = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const nextStatus = item.status === "suspended" ? "active" : "suspended";
    void run(() => privateMutation(`/api/office/responsibles/${item.profileId}/status`, "PATCH", {
      status: nextStatus, reason: form.get("reason"), expectedUpdatedAt: item.updatedAt,
    }), nextStatus === "active" ? "Compte réactivé. Une nouvelle connexion sera nécessaire." : "Compte suspendu et sessions fermées.");
  };
  const revokeSessions = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run(() => privateMutation(`/api/office/responsibles/${item.profileId}/revoke-sessions`, "POST", {
      confirmation: form.get("confirmation"), reason: form.get("reason"),
    }), "Toutes les sessions de ce compte ont été fermées.");
  };
  const assignOffice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run(() => privateMutation(`/api/office/responsibles/${item.profileId}/office`, "PATCH", {
      officeId: form.get("officeId"), centralAccess: form.get("centralAccess") === "on", reason: form.get("reason"),
    }), "Bureau du responsable mis à jour.");
  };
  const isLastAdmin = item.roles.includes("admin") && item.status === "active" && activeAdminCount <= 1;
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start gap-3">
      <span className={`grid size-11 place-items-center rounded-xl ${item.status === "active" ? "bg-green-50 text-green-800" : item.status === "suspended" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}><UserCog size={21} /></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-black">{item.name}</h2>{isSelf ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-900">VOUS</span> : null}</div><p className="truncate text-xs text-slate-500">{item.email} · {item.phone}</p><p className="mt-1 text-xs font-bold text-slate-600">{item.memberName ?? `N° ${item.memberNumber}`}</p><p className="mt-1 flex items-center gap-1 text-xs text-blue-800"><Building2 size={13} /> {item.officeName}{item.centralAccess ? " · accès central" : " · accès local"}</p></div>
      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${item.status === "active" ? "bg-green-100 text-green-900" : item.status === "suspended" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{item.status === "active" ? "ACTIF" : item.status === "suspended" ? "SUSPENDU" : "EN ATTENTE"}</span>
    </div>
    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><p className="font-bold">{item.activeSessionCount} session(s) active(s)</p><p>{formatSessionDate(item.latestSessionAt)}</p></div>
    {item.status !== "pending" ? <div className="mt-3 space-y-3">
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-black text-blue-900">Rôles et permissions</summary>
        <form onSubmit={updateRoles} className="mt-3 space-y-3">
          {officeRoles.map((role) => <label key={role.code} className={`flex items-start gap-3 rounded-xl border p-3 ${isSelf && role.code === "admin" ? "bg-slate-50" : ""}`}><input type="checkbox" name="roles" value={role.code} defaultChecked={item.roles.includes(role.code)} disabled={isSelf && role.code === "admin"} className="mt-1 size-4" /><span><strong className="block text-sm">{role.label}</strong><small className="text-slate-500">{role.detail}</small></span>{isSelf && role.code === "admin" ? <input type="hidden" name="roles" value="admin" /> : null}</label>)}
          <input name="reason" required minLength={5} maxLength={300} placeholder="Raison obligatoire" className={inputClass} />
          <button disabled={busy || item.status !== "active"} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-800 font-black text-white disabled:opacity-40"><ShieldCheck size={17} /> Enregistrer les rôles</button>
        </form>
      </details>
      {!isSelf ? <details className="rounded-xl border border-blue-200 p-3">
        <summary className="cursor-pointer font-black text-blue-900">Bureau de rattachement</summary>
        <form onSubmit={assignOffice} className="mt-3 space-y-3">
          <label className="grid gap-1 text-xs font-bold text-slate-600">Bureau<select name="officeId" defaultValue={item.officeId} className={inputClass}>{offices.filter((office) => office.status === "active").map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>
          <label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><input name="centralAccess" type="checkbox" defaultChecked={item.centralAccess} className="mt-1 size-4" /><span><strong className="block">Accès à tous les bureaux</strong><small className="text-slate-500">À réserver à l’administration centrale de Paris. Choisir Paris ci-dessus.</small></span></label>
          <input name="reason" required minLength={5} maxLength={300} placeholder="Raison obligatoire" className={inputClass} />
          <button disabled={busy} className="min-h-11 w-full rounded-xl bg-blue-800 font-black text-white disabled:opacity-40">Enregistrer le bureau</button>
        </form>
      </details> : null}
      {!isSelf ? <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-black">{item.status === "active" ? "Suspendre l’accès" : "Réactiver l’accès"}</summary>
        <form onSubmit={changeStatus} className="mt-3 space-y-3"><p className="text-xs text-slate-500">{item.status === "active" ? "La suspension ferme immédiatement toutes les sessions, sans effacer l’historique." : "La personne devra se reconnecter. Ses rôles conservés redeviendront actifs."}</p><input name="reason" required minLength={5} maxLength={300} placeholder="Raison obligatoire" className={inputClass} /><button disabled={busy || isLastAdmin} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl font-black text-white disabled:opacity-40 ${item.status === "active" ? "bg-red-700" : "bg-green-700"}`}>{item.status === "active" ? <UserRoundX size={17} /> : <UserRoundCheck size={17} />}{item.status === "active" ? "Suspendre et déconnecter" : "Réactiver"}</button>{isLastAdmin ? <p className="text-xs font-bold text-red-700">Le dernier administrateur actif ne peut pas être suspendu.</p> : null}</form>
      </details> : null}
      {!isSelf && item.status === "active" ? <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-black">Fermer les sessions</summary>
        <form onSubmit={revokeSessions} className="mt-3 space-y-3"><p className="text-xs text-slate-500">À utiliser si un téléphone est perdu ou si un accès paraît suspect.</p><input name="confirmation" required placeholder="FERMER LES SESSIONS" className={inputClass} /><input name="reason" required minLength={5} maxLength={300} placeholder="Raison obligatoire" className={inputClass} /><button disabled={busy || item.activeSessionCount === 0} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-800 font-black text-white disabled:opacity-40"><KeyRound size={17} /> Fermer toutes les sessions</button></form>
      </details> : null}
    </div> : <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">Traitez d’abord cette demande dans « Demandes d’accès ».</p>}
    {notice ? <p role="status" className={`mt-3 rounded-xl p-3 text-sm font-bold ${error ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{notice}</p> : null}
  </article>;
}

export function ResponsiblesPage() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const { data, loading, error, reload } = usePrivateApi<ResponsiblesData>(`/api/office/responsibles?q=${encodeURIComponent(search)}`);
  const officesApi = usePrivateApi<OfficesData>("/api/office/offices");
  return <AppFrame area="office" title="Responsables" subtitle="Rôles, accès et sessions" activePath="/bureau/plus">
    <div className="space-y-4">
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><strong>Principe de sécurité :</strong> donnez uniquement les droits nécessaires. Toute modification demande une raison et reste dans le journal.</section>
      <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }} className="flex gap-2"><label className="relative flex-1"><span className="sr-only">Rechercher</span><Search className="absolute left-3 top-3 text-slate-400" size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, e-mail, téléphone…" className={`${inputClass} pl-10`} /></label><button className="rounded-xl bg-blue-800 px-4 font-black text-white">Chercher</button></form>
      {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée."} retry={() => void reload()} /> : <>{data.items.map((item) => <ResponsibleCard key={item.profileId} item={item} isSelf={item.profileId === data.currentProfileId} activeAdminCount={data.activeAdminCount} offices={officesApi.data?.offices ?? []} reload={reload} />)}{data.items.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-500">Aucun compte trouvé.</p> : null}</>}
    </div>
  </AppFrame>;
}
