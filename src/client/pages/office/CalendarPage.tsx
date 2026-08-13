import { CalendarDays, CircleCheck, History, PlayCircle, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { CalendarData, GenerationResult } from "../../../shared/calendar";
import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatDate, formatEuros } from "../../utils/format";
import { privateMutation } from "../../utils/privateMutation";

const currentYear = new Date().getFullYear();
const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm";
const categoryLabels = {
  annual_repatriation: "Caisse annuelle de rapatriement",
  quarterly_working_man: "Cotisation trimestrielle des hommes actifs",
  single_man: "Ancien tarif homme seul",
  single_woman: "Ancien tarif femme seule",
  couple: "Ancien tarif couple",
} as const;
const ordinals = ["", "premier", "deuxième", "troisième", "quatrième", "cinquième"];
const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export function CalendarPage() {
  const { access } = useAuth();
  const [year, setYear] = useState(currentYear);
  const [officeId, setOfficeId] = useState(access?.profile.officeId ?? "office_paris");
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = usePrivateApi<CalendarData>(`/api/office/calendar?year=${year}&officeId=${encodeURIComponent(officeId)}`);
  const isAdmin = access?.roles.includes("admin") ?? false;
  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setNotice(""); const form = new FormData(event.currentTarget);
    try {
      const result = await privateMutation<GenerationResult>("/api/office/calendar/generate", "POST", {
        year, officeId, confirmation: form.get("confirmation"), reason: form.get("reason"),
      });
      setIsError(false); setNotice(`${result.createdDueCount} échéance(s) créée(s), ${result.skippedDueCount} déjà présente(s), ${result.createdMeetingCount} réunion(s) ajoutée(s).`);
      await reload();
    } catch (caught) { setIsError(true); setNotice(caught instanceof Error ? caught.message : "La génération a échoué."); }
    finally { setBusy(false); }
  };
  return <AppFrame area="office" title="Calendrier annuel" subtitle="Réunions et échéances" activePath="/bureau/plus">
    <div className="space-y-4">
      <label className="grid gap-1 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-600">Année<select value={year} onChange={(event) => setYear(Number(event.target.value))} className={inputClass}>{Array.from({ length: 10 }, (_, index) => currentYear - 3 + index).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée."} retry={() => void reload()} /> : <>
        <label className="grid gap-1 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-bold text-blue-900">Bureau<select value={officeId} onChange={(event) => setOfficeId(event.target.value)} className={inputClass}>{data.availableOffices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span>Règle fixe : {ordinals[data.office.meetingOrdinal]} {weekdays[data.office.meetingWeekday]} du trimestre.</span></label>
        <section className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-white p-3 text-center"><UsersRound className="mx-auto text-blue-800" size={19} /><p className="mt-1 text-xl font-black">{data.householdCount}</p><p className="text-[10px] font-bold text-slate-500">Foyers</p></div><div className="rounded-xl bg-white p-3 text-center"><CalendarDays className="mx-auto text-blue-800" size={19} /><p className="mt-1 text-xl font-black">{data.dueCount}</p><p className="text-[10px] font-bold text-slate-500">Échéances</p></div><div className="rounded-xl bg-white p-3 text-center"><CircleCheck className="mx-auto text-green-700" size={19} /><p className="mt-1 text-lg font-black">{formatEuros(data.expectedAmountCents)}</p><p className="text-[10px] font-bold text-slate-500">Attendu</p></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="flex items-center gap-2 font-black"><CalendarDays size={19} /> Réunions de {data.office.city} en {year}</h2>{data.meetings.length ? <div className="mt-3 space-y-3">{data.meetings.map((meeting) => <article key={meeting.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{formatDate(meeting.meetingDate)}</p><p className="text-xs text-slate-500">{meeting.label}</p></div><span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-900">{ordinals[data.office.meetingOrdinal].toUpperCase()} {weekdays[data.office.meetingWeekday].toUpperCase()}</span></div><p className="mt-2 text-xs font-bold text-slate-600">{meeting.dueCount} échéance(s) · {formatEuros(meeting.expectedAmountCents)}</p></article>)}</div> : <p className="mt-3 text-sm text-slate-500">Aucune réunion générée pour cette année.</p>}</section>
        {isAdmin ? <details className="rounded-2xl border border-green-200 bg-white p-4 shadow-sm"><summary className="flex cursor-pointer list-none items-center gap-2 font-black text-green-900"><PlayCircle size={20} /> Générer réunions et échéances</summary><div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><strong>Sans écrasement :</strong> les échéances existantes ne seront jamais modifiées. Relancer la génération ajoute uniquement les éléments manquants.</div><form onSubmit={generate} className="mt-3 grid gap-3"><input name="confirmation" required placeholder="GENERER LES ECHEANCES" className={inputClass} /><input name="reason" required minLength={5} maxLength={300} placeholder="Raison, par exemple : préparation annuelle" className={inputClass} /><button disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-700 font-black text-white disabled:opacity-40"><PlayCircle size={18} /> {busy ? "Calcul en cours…" : `Générer pour ${year}`}</button></form></details> : null}
        {notice ? <p role="status" className={`rounded-xl p-3 text-sm font-bold ${isError ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{notice}</p> : null}
        {data.lastGeneration ? <section className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><strong>Dernière génération :</strong> {formatDate(data.lastGeneration.createdAt.slice(0, 10))} par {data.lastGeneration.createdByName} · {data.lastGeneration.createdDueCount} créée(s), {data.lastGeneration.skippedDueCount} ignorée(s).</section> : null}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="flex items-center gap-2 font-black"><History size={19} /> Règles historiques</h2><div className="mt-3 space-y-3">{data.rules.map((rule) => <article key={rule.id} className={`rounded-xl bg-slate-50 p-3 ${rule.effectiveTo ? "opacity-70" : ""}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black">{rule.name}</p><p className="text-xs font-bold text-blue-800">{categoryLabels[rule.category]}</p></div><span className="text-right text-[10px] font-bold text-slate-500">{rule.effectiveFrom}<br />{rule.effectiveTo ? `au ${rule.effectiveTo}` : "sans date de fin"}</span></div><p className="mt-2 text-xs text-slate-600">{rule.category === "annual_repatriation" ? `${formatEuros(rule.baseAmountCents)} par homme adulte, ${formatEuros(rule.femaleAmountCents)} par femme adulte et ${formatEuros(rule.childAmountCents)} par enfant de moins de ${rule.childMaxAge} ans.` : rule.category === "quarterly_working_man" ? `${formatEuros(rule.baseAmountCents)} par homme adulte exerçant une activité rémunérée.` : `Ancien calcul : base ${formatEuros(rule.baseAmountCents)} + ${formatEuros(rule.childAmountCents)} par enfant.`}</p><p className="mt-1 text-xs text-slate-500">Mois : {rule.dueMonths.map((month) => String(month).padStart(2, "0")).join(", ") || "archives"}</p></article>)}</div></section>
      </>}
    </div>
  </AppFrame>;
}
