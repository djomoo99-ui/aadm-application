import { Baby, KeyRound, LogOut, Phone, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatDate } from "../../utils/format";
import type { MemberProfileData } from "../../../shared/member";

const relationshipLabels = { head: "Responsable du foyer", partner: "Conjoint(e)", child: "Enfant" };

export function ProfilePage() {
  const { access, signOut } = useAuth();
  const { data, loading, error, reload } = usePrivateApi<MemberProfileData>("/api/member/profile");
  const hasOfficeAccess = access?.roles.some((role) => role !== "member") ?? false;

  if (loading) return <AppFrame area="member" title="Mon compte" subtitle="Informations personnelles" activePath="/membre/compte"><MemberLoading /></AppFrame>;
  if (!data || error) return <AppFrame area="member" title="Mon compte" subtitle="Informations personnelles" activePath="/membre/compte"><MemberError message={error || "Aucune donnée reçue."} retry={() => void reload()} /></AppFrame>;

  const initials = data.member.fullName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();
  return (
    <AppFrame area="member" title="Mon compte" subtitle={`Membre n° ${data.member.memberNumber}`} activePath="/membre/compte">
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid size-14 place-items-center rounded-full bg-blue-100 text-xl font-black text-blue-900">{initials}</div><p className="mt-3 text-xl font-black">{data.member.fullName}</p><p className="text-sm text-slate-500">Compte validé</p></section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center gap-3 border-b border-slate-100 p-4"><Phone className="text-blue-800" size={20} /><span><strong className="block">Téléphone</strong><small className="text-slate-500">{data.member.phone ?? "Non renseigné"}</small></span></div><button type="button" disabled className="flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left opacity-60"><KeyRound className="text-blue-800" size={20} /><span><strong className="block">Changer mon mot de passe</strong><small className="text-slate-500">Disponible avec le service d’e-mail</small></span></button><button type="button" disabled className="flex w-full items-center gap-3 p-4 text-left opacity-60"><ShieldCheck className="text-blue-800" size={20} /><span><strong className="block">Confidentialité</strong><small className="text-slate-500">Gestion des données au prochain lot légal</small></span></button></section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><UsersRound className="text-blue-800" /><h2 className="font-black">{data.household.name}</h2></div><div className="mt-3 divide-y divide-slate-100">{data.household.members.map((member) => <div key={member.id} className="flex gap-3 py-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">{member.relationship === "child" ? <Baby size={18} /> : <UserRound size={18} />}</div><div><p className="font-bold">{member.fullName}</p><p className="text-xs text-slate-500">{relationshipLabels[member.relationship]}{member.birthDate ? ` · Né(e) le ${formatDate(member.birthDate)}` : ""}</p></div></div>)}</div></section>
        {hasOfficeAccess ? <Link to="/bureau" className="block rounded-xl border border-dashed border-slate-300 bg-white p-3 text-center text-xs font-bold text-slate-500">Accéder à l’espace bureau</Link> : null}
        <button type="button" onClick={() => void signOut()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 font-extrabold text-red-800"><LogOut size={18} /> Se déconnecter</button>
      </div>
    </AppFrame>
  );
}

