import { Building2, CalendarClock, MapPin, PlusCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { OfficesData } from "../../../shared/offices";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { privateMutation } from "../../utils/privateMutation";

const ordinals = ["", "premier", "deuxième", "troisième", "quatrième", "cinquième"];
const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm";

export function OfficesPage() {
  const { data, loading, error, reload } = usePrivateApi<OfficesData>("/api/office/offices");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setNotice("");
    try { await privateMutation("/api/office/offices", "POST", { code: form.get("code"), name: form.get("name"), city: form.get("city"), meetingOrdinal: Number(form.get("meetingOrdinal")), meetingWeekday: Number(form.get("meetingWeekday")) }); setNotice("Le sous-bureau a été créé."); event.currentTarget.reset(); await reload(); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : "La création a échoué."); }
    finally { setBusy(false); }
  };
  const update = async (officeId: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setNotice("");
    try { await privateMutation(`/api/office/offices/${officeId}`, "PATCH", { meetingOrdinal: Number(form.get("meetingOrdinal")), meetingWeekday: Number(form.get("meetingWeekday")), status: form.get("status"), reason: form.get("reason") }); setNotice("Le calendrier fixe du bureau a été mis à jour."); await reload(); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : "La modification a échoué."); }
    finally { setBusy(false); }
  };
  return <AppFrame area="office" title="Bureaux AADM" subtitle="Paris et sous-bureaux locaux" activePath="/bureau/plus"><div className="space-y-4">
    {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée."} retry={() => void reload()} /> : <>
      <section className="space-y-3">{data.offices.map((office) => <article key={office.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-800"><Building2 /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><h2 className="font-black">{office.name}</h2>{office.kind === "central" ? <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-900">CENTRAL</span> : null}{office.status === "inactive" ? <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black">INACTIF</span> : null}</div><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={14} /> {office.city} · {office.code}</p><p className="mt-2 flex items-center gap-1 text-sm font-bold text-slate-700"><CalendarClock size={16} /> {ordinals[office.meetingOrdinal]} {weekdays[office.meetingWeekday]} de chaque mois de cotisation</p><p className="mt-2 text-xs text-slate-500">{office.householdCount} foyer(s) · {office.responsibleCount} responsable(s)</p></div></div>{data.centralAccess ? <details className="mt-3 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-black text-blue-900">Modifier le calendrier du bureau</summary><form onSubmit={(event) => void update(office.id, event)} className="mt-3 grid gap-3"><label className="grid gap-1 text-xs font-bold text-slate-600">Semaine<select name="meetingOrdinal" defaultValue={office.meetingOrdinal} className={inputClass}>{[1,2,3,4,5].map((value) => <option value={value} key={value}>{ordinals[value]}</option>)}</select></label><label className="grid gap-1 text-xs font-bold text-slate-600">Jour<select name="meetingWeekday" defaultValue={office.meetingWeekday} className={inputClass}>{weekdays.map((label, value) => <option key={label} value={value}>{label}</option>)}</select></label><label className="grid gap-1 text-xs font-bold text-slate-600">État<select name="status" defaultValue={office.status} className={inputClass}><option value="active">Actif</option><option value="inactive">Inactif</option></select></label><input name="reason" required minLength={5} placeholder="Raison de la modification" className={inputClass} /><button disabled={busy} className="min-h-11 rounded-xl bg-blue-800 font-black text-white disabled:opacity-40">Enregistrer</button></form></details> : null}</article>)}</section>
      {data.centralAccess ? <details className="rounded-2xl border border-blue-200 bg-white p-4"><summary className="flex cursor-pointer list-none items-center gap-2 font-black text-blue-900"><PlusCircle size={19} /> Ajouter un sous-bureau</summary><form onSubmit={create} className="mt-4 grid gap-3"><input name="code" required placeholder="Code, par exemple LYON" className={inputClass} /><input name="name" required placeholder="Nom, par exemple Bureau de Lyon" className={inputClass} /><input name="city" required placeholder="Ville" className={inputClass} /><label className="grid gap-1 text-xs font-bold text-slate-600">Semaine<select name="meetingOrdinal" defaultValue="3" className={inputClass}>{[1,2,3,4,5].map((value) => <option value={value} key={value}>{ordinals[value]}</option>)}</select></label><label className="grid gap-1 text-xs font-bold text-slate-600">Jour<select name="meetingWeekday" defaultValue="0" className={inputClass}>{weekdays.map((label, value) => <option key={label} value={value}>{label}</option>)}</select></label><button disabled={busy} className="min-h-12 rounded-xl bg-blue-800 font-black text-white disabled:opacity-40">Créer le sous-bureau</button></form></details> : null}
      {notice ? <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-900">{notice}</p> : null}
    </>}
  </div></AppFrame>;
}
