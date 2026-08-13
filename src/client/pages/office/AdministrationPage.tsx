import { Building2, ChevronDown, CirclePlus, Pencil, Save, Search, UserPlus, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import type {
  AdminHousehold,
  AdminMember,
  AdministrationData,
  MemberRelationship,
} from "../../../shared/administration";
import type { OfficesData } from "../../../shared/offices";
import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { privateMutation } from "../../utils/privateMutation";

const today = new Date().toISOString().slice(0, 10);
const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm";
const labelClass = "grid gap-1 text-xs font-bold text-slate-600";
const relationships: Record<MemberRelationship, string> = { head: "Responsable", partner: "Conjoint(e)", child: "Enfant" };

type Notice = { tone: "ok" | "error"; text: string } | null;

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <p role="status" className={`rounded-xl p-3 text-sm font-bold ${notice.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{notice.text}</p>;
}

function MemberEditor({ member, reload }: { member: AdminMember; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      await privateMutation(`/api/office/administration/members/${member.id}`, "PATCH", {
        expectedUpdatedAt: member.updatedAt,
        membershipId: member.membershipId,
        memberNumber: form.get("memberNumber"), firstName: form.get("firstName"), lastName: form.get("lastName"),
        gender: form.get("gender"), birthDate: form.get("birthDate"), phone: form.get("phone"),
        joinedAt: form.get("joinedAt"), leftAt: form.get("leftAt"), status: form.get("status"),
        relationship: form.get("relationship"),
      });
      setNotice({ tone: "ok", text: "Membre mis à jour et modification journalisée." });
      await reload();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Erreur." }); }
    finally { setSaving(false); }
  };
  const updateActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      await privateMutation(`/api/office/administration/members/${member.id}/activity`, "POST", {
        status: form.get("activityStatus"), startsAt: form.get("activityStartsAt"), reason: form.get("activityReason"),
      });
      setNotice({ tone: "ok", text: "Situation professionnelle enregistrée avec sa date d’effet." });
      await reload();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Erreur." }); }
    finally { setSaving(false); }
  };
  return <div className="border-t border-slate-100 py-3 first:border-0">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 text-left">
      <span className="grid size-9 place-items-center rounded-full bg-blue-50 font-black text-blue-800">{member.firstName.slice(0, 1)}</span>
      <span className="flex-1"><strong className="block text-sm">{member.firstName} {member.lastName}</strong><small className="text-slate-500">N° {member.memberNumber} · {relationships[member.relationship]} · {member.status === "active" ? "Actif" : "Inactif"}{member.gender === "male" ? ` · ${member.activityStatus === "working" ? "Activité rémunérée" : member.activityStatus === "not_working" ? "Sans activité rémunérée" : "Activité à renseigner"}` : ""}</small></span>
      <Pencil size={17} className="text-slate-400" />
    </button>
    {open ? <div className="mt-3 space-y-3"><form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
      <label className={labelClass}>N° AADM<input name="memberNumber" required defaultValue={member.memberNumber} className={inputClass} /></label>
      <label className={labelClass}>Lien<select name="relationship" defaultValue={member.relationship} className={inputClass}><option value="head">Responsable</option><option value="partner">Conjoint(e)</option><option value="child">Enfant</option></select></label>
      <label className={labelClass}>Prénom<input name="firstName" required defaultValue={member.firstName} className={inputClass} /></label>
      <label className={labelClass}>Nom<input name="lastName" required defaultValue={member.lastName} className={inputClass} /></label>
      <label className={labelClass}>Sexe<select name="gender" defaultValue={member.gender} className={inputClass}><option value="unspecified">Non précisé</option><option value="male">Homme</option><option value="female">Femme</option></select></label>
      <label className={labelClass}>Naissance<input name="birthDate" type="date" defaultValue={member.birthDate ?? ""} className={inputClass} /></label>
      <label className={`${labelClass} col-span-2`}>Téléphone international<input name="phone" type="tel" defaultValue={member.phone ?? ""} placeholder="+336… ou +22177…" className={inputClass} /></label>
      <label className={labelClass}>Adhésion<input name="joinedAt" type="date" required defaultValue={member.joinedAt} className={inputClass} /></label>
      <label className={labelClass}>État<select name="status" defaultValue={member.status} className={inputClass}><option value="active">Actif</option><option value="inactive">Inactif</option><option value="deceased">Décédé</option></select></label>
      <label className={`${labelClass} col-span-2`}>Date de départ ou décès<input name="leftAt" type="date" defaultValue={member.leftAt ?? ""} className={inputClass} /></label>
      <div className="col-span-2"><NoticeBox notice={notice} /></div>
      <button disabled={saving} className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 font-black text-white disabled:opacity-50"><Save size={17} /> {saving ? "Enregistrement…" : "Enregistrer le membre"}</button>
    </form>
    {member.gender === "male" ? <form onSubmit={updateActivity} className="grid gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
      <p className="text-sm font-black text-green-950">Activité rémunérée</p>
      <p className="text-xs text-green-900">Situation actuelle : <strong>{member.activityStatus === "working" ? "travaille" : member.activityStatus === "not_working" ? "ne travaille pas" : "à renseigner"}</strong>{member.activityStartsAt ? ` depuis le ${member.activityStartsAt}` : ""}.</p>
      <label className={labelClass}>Nouvelle situation<select name="activityStatus" defaultValue={member.activityStatus ?? "not_working"} className={inputClass}><option value="working">Travaille — activité rémunérée</option><option value="not_working">Ne travaille pas</option></select></label>
      <label className={labelClass}>Date d’effet<input name="activityStartsAt" type="date" min={member.joinedAt} defaultValue={today} required className={inputClass} /></label>
      <label className={labelClass}>Motif<input name="activityReason" required minLength={5} placeholder="Emploi, retraite, chômage…" className={inputClass} /></label>
      <button disabled={saving} className="min-h-11 rounded-xl bg-green-700 font-black text-white disabled:opacity-50">Enregistrer la situation</button>
    </form> : null}
    </div> : null}
  </div>;
}

function HouseholdCard({ household, offices, isAdmin, centralAccess, reload }: { household: AdminHousehold; offices: OfficesData["offices"]; isAdmin: boolean; centralAccess: boolean; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const submitHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setNotice(null); const form = new FormData(event.currentTarget);
    try {
      await privateMutation(`/api/office/administration/households/${household.id}`, "PATCH", {
        expectedUpdatedAt: household.updatedAt, name: form.get("name"), phone: form.get("phone"),
        joinedAt: form.get("joinedAt"), leftAt: form.get("leftAt"), status: form.get("status"),
      }); setNotice({ tone: "ok", text: "Foyer mis à jour." }); await reload();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Erreur." }); }
    finally { setSaving(false); }
  };
  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setNotice(null); const form = new FormData(event.currentTarget);
    try {
      await privateMutation(`/api/office/administration/households/${household.id}/members`, "POST", {
        memberNumber: form.get("memberNumber"), firstName: form.get("firstName"), lastName: form.get("lastName"),
        gender: form.get("gender"), birthDate: form.get("birthDate"), phone: form.get("phone"),
        joinedAt: form.get("joinedAt"), relationship: form.get("relationship"),
      }); event.currentTarget.reset(); setNotice({ tone: "ok", text: "Membre ajouté au foyer." }); await reload();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Erreur." }); }
    finally { setSaving(false); }
  };
  const changeOffice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setNotice(null); const form = new FormData(event.currentTarget);
    try {
      await privateMutation(`/api/office/households/${household.id}/change-office`, "POST", {
        officeId: form.get("officeId"), startsAt: form.get("startsAt"), reason: form.get("reason"),
      }); setNotice({ tone: "ok", text: "Bureau modifié. L’ancien rattachement reste dans l’historique." }); await reload();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Erreur." }); }
    finally { setSaving(false); }
  };
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 p-4 text-left">
      <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-800"><UsersRound size={21} /></span>
      <span className="flex-1"><strong className="block">{household.name}</strong><small className="text-slate-500">{household.officeName} · {household.members.length} membre(s) · cotisations calculées par personne</small></span>
      <ChevronDown size={20} className={`transition ${open ? "rotate-180" : ""}`} />
    </button>
    {open ? <div className="space-y-4 border-t border-slate-100 p-4">
      <form onSubmit={submitHousehold} className="grid grid-cols-2 gap-3">
        <h3 className="col-span-2 font-black">Informations du foyer</h3>
        <label className={`${labelClass} col-span-2`}>Nom du foyer<input name="name" required defaultValue={household.name} className={inputClass} /></label>
        <label className={`${labelClass} col-span-2`}>Téléphone international<input name="phone" type="tel" defaultValue={household.phone ?? ""} placeholder="+336… ou +22177…" className={inputClass} /></label>
        <label className={labelClass}>Adhésion<input name="joinedAt" type="date" required defaultValue={household.joinedAt} className={inputClass} /></label>
        <label className={labelClass}>État<select name="status" defaultValue={household.status} className={inputClass}><option value="active">Actif</option><option value="inactive">Inactif</option><option value="to_verify">À vérifier</option></select></label>
        <label className={`${labelClass} col-span-2`}>Date de départ<input name="leftAt" type="date" defaultValue={household.leftAt ?? ""} className={inputClass} /></label>
        <button disabled={saving} className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-800 font-black text-white disabled:opacity-50"><Save size={17} /> Enregistrer le foyer</button>
      </form>
      <section><h3 className="font-black">Membres</h3><div className="mt-2">{household.members.map((member) => <MemberEditor key={member.id} member={member} reload={reload} />)}</div></section>
      <details className="rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-3">
        <summary className="cursor-pointer font-black text-blue-900">Ajouter un membre ou un enfant</summary>
        <form onSubmit={addMember} className="mt-3 grid grid-cols-2 gap-3">
          <label className={labelClass}>N° AADM<input name="memberNumber" required className={inputClass} /></label>
          <label className={labelClass}>Lien<select name="relationship" defaultValue="child" className={inputClass}><option value="head">Responsable</option><option value="partner">Conjoint(e)</option><option value="child">Enfant</option></select></label>
          <label className={labelClass}>Prénom<input name="firstName" required className={inputClass} /></label>
          <label className={labelClass}>Nom<input name="lastName" required className={inputClass} /></label>
          <label className={labelClass}>Sexe<select name="gender" defaultValue="unspecified" className={inputClass}><option value="unspecified">Non précisé</option><option value="male">Homme</option><option value="female">Femme</option></select></label>
          <label className={labelClass}>Naissance<input name="birthDate" type="date" className={inputClass} /></label>
          <label className={`${labelClass} col-span-2`}>Téléphone<input name="phone" type="tel" placeholder="+336… ou laisser vide" className={inputClass} /></label>
          <label className={`${labelClass} col-span-2`}>Date d’adhésion<input name="joinedAt" type="date" defaultValue={today} required className={inputClass} /></label>
          <button disabled={saving} className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-700 font-black text-white disabled:opacity-50"><UserPlus size={17} /> Ajouter</button>
        </form>
      </details>
      {isAdmin && centralAccess ? <details className="rounded-xl border border-blue-200 p-3">
        <summary className="flex cursor-pointer items-center gap-2 font-black text-blue-900"><Building2 size={17} /> Transférer vers un autre bureau</summary>
        <p className="mt-2 text-xs text-slate-500">Bureau actuel : {household.officeName}. Les anciennes cotisations et réunions conservent leur bureau d’origine.</p>
        <form onSubmit={changeOffice} className="mt-3 grid gap-3">
          <label className={labelClass}>Nouveau bureau<select name="officeId" required defaultValue="" className={inputClass}><option value="" disabled>Choisir</option>{offices.filter((item) => item.id !== household.officeId && item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className={labelClass}>Date d’effet<input name="startsAt" type="date" min={household.joinedAt} max={today} defaultValue={today} required className={inputClass} /></label>
          <label className={labelClass}>Motif<input name="reason" required minLength={5} placeholder="Déménagement ou décision du bureau" className={inputClass} /></label>
          <button disabled={saving} className="min-h-11 rounded-xl bg-blue-800 font-black text-white disabled:opacity-50">Confirmer le transfert</button>
        </form>
      </details> : null}
      <NoticeBox notice={notice} />
    </div> : null}
  </article>;
}

export function AdministrationPage() {
  const { access } = useAuth();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const { data, loading, error, reload } = usePrivateApi<AdministrationData>(`/api/office/administration/households?q=${encodeURIComponent(search)}`);
  const officesApi = usePrivateApi<OfficesData>("/api/office/offices");
  const isAdmin = access?.roles.includes("admin") ?? false;
  const centralAccess = access?.profile.centralAccess ?? false;
  const createHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setNotice(null); const form = new FormData(event.currentTarget);
    try {
      await privateMutation("/api/office/administration/households", "POST", {
        officeId: form.get("officeId") || undefined, name: form.get("name"), phone: form.get("phone"), joinedAt: form.get("joinedAt"), status: "active",
        head: { memberNumber: form.get("memberNumber"), firstName: form.get("firstName"), lastName: form.get("lastName"),
          gender: form.get("gender"), birthDate: form.get("birthDate"), phone: form.get("memberPhone") },
      }); event.currentTarget.reset(); setNotice({ tone: "ok", text: "Foyer et premier responsable créés." }); await reload();
    } catch (caught) { setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Erreur." }); }
  };
  return <AppFrame area="office" title="Foyers et membres" subtitle="Saisie sécurisée" activePath="/bureau/plus">
    <div className="space-y-4">
      <details className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-black text-blue-900"><CirclePlus size={20} /> Créer un nouveau foyer</summary>
        <form onSubmit={createHousehold} className="mt-4 grid grid-cols-2 gap-3">
          <label className={`${labelClass} col-span-2`}>Nom du foyer<input name="name" required placeholder="Famille…" className={inputClass} /></label>
          <label className={`${labelClass} col-span-2`}>Téléphone du foyer<input name="phone" type="tel" placeholder="+336… ou +22177…" className={inputClass} /></label>
          <label className={`${labelClass} col-span-2`}>Date d’adhésion<input name="joinedAt" type="date" required defaultValue={today} className={inputClass} /></label>
          {centralAccess ? <label className={`${labelClass} col-span-2`}>Bureau<select name="officeId" required defaultValue={access?.profile.officeId} className={inputClass}>{(officesApi.data?.offices ?? []).filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
          <h3 className="col-span-2 mt-2 font-black">Premier responsable</h3>
          <label className={labelClass}>N° AADM<input name="memberNumber" required className={inputClass} /></label>
          <label className={labelClass}>Sexe<select name="gender" defaultValue="unspecified" className={inputClass}><option value="unspecified">Non précisé</option><option value="male">Homme</option><option value="female">Femme</option></select></label>
          <label className={labelClass}>Prénom<input name="firstName" required className={inputClass} /></label>
          <label className={labelClass}>Nom<input name="lastName" required className={inputClass} /></label>
          <label className={labelClass}>Naissance<input name="birthDate" type="date" className={inputClass} /></label>
          <label className={labelClass}>Téléphone<input name="memberPhone" type="tel" placeholder="+336…" className={inputClass} /></label>
          <button className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-700 font-black text-white"><CirclePlus size={18} /> Créer le foyer</button>
        </form>
      </details>
      <NoticeBox notice={notice} />
      <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }} className="flex gap-2">
        <label className="relative flex-1"><span className="sr-only">Rechercher</span><Search className="absolute left-3 top-3 text-slate-400" size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, téléphone ou n° AADM" className={`${inputClass} pl-10`} /></label>
        <button className="rounded-xl bg-blue-800 px-4 font-black text-white">Chercher</button>
      </form>
      {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée."} retry={() => void reload()} /> : data.households.length ? data.households.map((household) => <HouseholdCard key={household.id} household={household} offices={officesApi.data?.offices ?? []} isAdmin={isAdmin} centralAccess={centralAccess} reload={reload} />) : <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-500">Aucun foyer trouvé.</p>}
    </div>
  </AppFrame>;
}
