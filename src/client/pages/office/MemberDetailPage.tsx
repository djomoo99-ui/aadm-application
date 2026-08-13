import { ArrowLeft, Banknote, CalendarDays, Phone, ReceiptText, UsersRound } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import type { OfficeMemberDetailData } from "../../../shared/office";
import type { OfficeMemberSummary } from "../../../shared/payments";
import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { StatusBadge } from "../../components/StatusBadge";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatDate, formatEuros, formatMonth } from "../../utils/format";

const relationLabels = { head: "Responsable", partner: "Conjoint(e)", child: "Enfant" } as const;

export function MemberDetailPage() {
  const [params] = useSearchParams();
  const reference = params.get("ref") ?? "";
  const { access } = useAuth();
  const { data, loading, error, reload } = usePrivateApi<OfficeMemberDetailData>(`/api/office/member-detail?ref=${encodeURIComponent(reference)}`);
  const canRecordPayment = access?.roles.some((role) => role === "treasurer" || role === "admin") ?? false;

  if (loading) return <AppFrame area="office" title="Fiche du foyer" subtitle="Chargement sécurisé" activePath="/bureau/membres"><MemberLoading /></AppFrame>;
  if (!data || error) return <AppFrame area="office" title="Fiche du foyer" subtitle="Données réservées" activePath="/bureau/membres"><MemberError message={error || "Aucune donnée reçue."} retry={() => void reload()} /></AppFrame>;

  const representative = data.members.find((member) => member.relationship === "head") ?? data.members[0];
  const paymentState: OfficeMemberSummary = {
    member: { fullName: representative?.fullName ?? data.household.name, memberNumber: representative?.memberNumber ?? "—" },
    household: { name: data.household.name, dueNowCents: data.household.dueNowCents, totalOutstandingCents: data.household.totalOutstandingCents },
    source: { memberReference: reference },
  };

  return (
    <AppFrame area="office" title={data.household.name} subtitle="Fiche complète du foyer" activePath="/bureau/membres" action={<Link to="/bureau/membres" className="grid size-10 place-items-center rounded-xl bg-white/10" aria-label="Retour"><ArrowLeft /></Link>}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge label={data.household.statusLabel} tone={data.household.statusTone} />{data.household.phone ? <a href={`tel:${data.household.phone}`} className="flex items-center gap-1 text-sm font-bold text-blue-800"><Phone size={16} /> {data.household.phone}</a> : null}</div>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-red-50 p-3"><p className="text-xs font-semibold text-red-800">Exigible maintenant</p><p className="mt-1 text-xl font-black text-red-950">{formatEuros(data.household.dueNowCents)}</p></div><div className="rounded-xl bg-blue-50 p-3"><p className="text-xs font-semibold text-blue-800">Total restant</p><p className="mt-1 text-xl font-black text-blue-950">{formatEuros(data.household.totalOutstandingCents)}</p></div></div>
          {canRecordPayment ? <Link to="/bureau/paiement" state={{ member: paymentState }} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 font-extrabold text-white"><Banknote size={19} /> Enregistrer des espèces</Link> : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="flex items-center gap-2 font-black"><UsersRound size={19} /> Membres du foyer</h2><div className="mt-3 divide-y divide-slate-100">{data.members.map((member) => <div key={member.id} className="py-3"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{member.fullName}</p><p className="text-xs text-slate-500">N° {member.memberNumber} · {relationLabels[member.relationship]}</p></div>{member.phone ? <a href={`tel:${member.phone}`} className="text-blue-800"><Phone size={18} /></a> : null}</div>{member.birthDate ? <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CalendarDays size={13} /> Né(e) le {formatDate(member.birthDate)}</p> : null}</div>)}</div></section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="flex items-center gap-2 font-black"><ReceiptText size={19} /> Derniers paiements</h2>{data.payments.length ? <div className="mt-3 divide-y divide-slate-100">{data.payments.slice(0, 10).map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-mono text-xs font-bold">{payment.receiptNumber}</p><p className="text-xs text-slate-500">{formatDate(payment.paymentDate)}</p></div><div className="text-right"><strong className={payment.status === "reversed" ? "text-slate-400 line-through" : "text-green-800"}>{formatEuros(payment.amountCents)}</strong>{payment.status === "reversed" ? <p className="text-[10px] font-bold text-red-700">Annulé</p> : null}</div></div>)}</div> : <p className="mt-3 text-sm text-slate-500">Aucun paiement enregistré.</p>}</section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="flex items-center gap-2 font-black"><CalendarDays size={19} /> Historique des cotisations</h2>{data.contributions.length ? <div className="mt-3 divide-y divide-slate-100">{data.contributions.map((due) => <div key={due.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-extrabold">{formatMonth(due.dueDate)}</p><p className="text-xs text-slate-500">Payé {formatEuros(due.paidAmountCents)} sur {formatEuros(due.expectedAmountCents)}</p></div><StatusBadge label={due.status === "paid" ? "Payée" : due.status === "partial" ? "Partielle" : due.status === "upcoming" ? "À venir" : due.status === "to_verify" ? "À vérifier" : due.status === "exempt" ? "Exonérée" : "En retard"} tone={due.status === "paid" || due.status === "exempt" ? "blue" : due.status === "partial" ? "green" : due.status === "upcoming" ? "grey" : due.status === "to_verify" ? "purple" : "red"} /></div>)}</div> : <p className="mt-3 text-sm text-slate-500">Aucune cotisation enregistrée depuis 2021.</p>}</section>
      </div>
    </AppFrame>
  );
}

