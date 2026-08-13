import { CalendarDays, CircleDollarSign, UsersRound } from "lucide-react";

import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { PrimaryLink } from "../../components/PrimaryLink";
import { StatusBadge } from "../../components/StatusBadge";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatDate, formatEuros } from "../../utils/format";
import type { MemberDashboardData } from "../../../shared/member";

export function MemberDashboardPage() {
  const { data, loading, error, reload } = usePrivateApi<MemberDashboardData>("/api/member/dashboard");

  if (loading) return <AppFrame area="member" title="Mon espace" subtitle="Espace membre" activePath="/membre"><MemberLoading /></AppFrame>;
  if (!data || error) return <AppFrame area="member" title="Mon espace" subtitle="Espace membre" activePath="/membre"><MemberError message={error || "Aucune donnée reçue."} retry={() => void reload()} /></AppFrame>;

  const progress = data.financial.annualExpectedCents > 0
    ? Math.min(100, Math.round((data.financial.annualPaidCents / data.financial.annualExpectedCents) * 100))
    : 0;

  return (
    <AppFrame area="member" title={`Bonjour, ${data.member.firstName}`} subtitle={`Membre n° ${data.member.memberNumber}`} activePath="/membre">
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-600">Situation de mon foyer</p>
          <p className="mt-3 text-sm text-slate-500">Reste exigible aujourd’hui</p>
          <p className="text-4xl font-black text-[#173B57]">{formatEuros(data.financial.dueNowCents)}</p>
          <div className="mt-3"><StatusBadge label={data.financial.statusLabel} tone={data.financial.statusTone} /></div>
          <div className="mt-5 flex justify-between text-sm font-semibold"><span>Payé {formatEuros(data.financial.annualPaidCents)}</span><span>sur {formatEuros(data.financial.annualExpectedCents)}</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200" aria-label={`${progress}% payé`}><div className="h-full rounded-full bg-blue-700" style={{ width: `${progress}%` }} /></div>
        </section>

        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><CalendarDays aria-hidden="true" /></div><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Prochaine échéance</p>{data.financial.nextDue ? <><p className="mt-1 font-extrabold text-slate-950">{formatDate(data.financial.nextDue.dueDate)}</p><p className="text-sm font-semibold text-blue-900">{formatEuros(data.financial.nextDue.amountCents)}</p></> : <p className="mt-1 font-extrabold text-slate-950">Aucune échéance programmée</p>}</div></div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><CircleDollarSign className="text-blue-700" aria-hidden="true" /><p className="mt-3 text-xs font-semibold text-slate-500">Dernier paiement</p>{data.financial.latestPayment ? <><p className="text-lg font-black">{formatEuros(data.financial.latestPayment.amountCents)}</p><p className="text-xs text-slate-500">{formatDate(data.financial.latestPayment.paymentDate)}</p></> : <p className="mt-1 text-sm font-bold text-slate-700">Aucun paiement enregistré</p>}</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><UsersRound className="text-blue-700" aria-hidden="true" /><p className="mt-3 text-xs font-semibold text-slate-500">Mon foyer</p><p className="font-black">{data.household.name}</p><p className="mt-1 text-xs text-slate-500">{data.household.memberCount} membre{data.household.memberCount > 1 ? "s" : ""} rattaché{data.household.memberCount > 1 ? "s" : ""}</p></div>
        </section>

        <PrimaryLink to="/membre/cotisations">Voir mes cotisations</PrimaryLink>
      </div>
    </AppFrame>
  );
}

