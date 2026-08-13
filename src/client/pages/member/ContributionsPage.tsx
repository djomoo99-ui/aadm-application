import { CheckCircle2, Clock3, HelpCircle, MessageCircle, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";

import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { StatusBadge } from "../../components/StatusBadge";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatEuros, formatMonth } from "../../utils/format";
import type { ContributionItem, MemberContributionsData, StatusTone } from "../../../shared/member";
import { todayInParis } from "../../../shared/date";

const labels: Record<ContributionItem["status"], { label: string; tone: StatusTone }> = {
  paid: { label: "Payée", tone: "blue" },
  partial: { label: "Partielle", tone: "green" },
  upcoming: { label: "À venir", tone: "grey" },
  overdue: { label: "En retard", tone: "red" },
  exempt: { label: "Exonérée", tone: "blue" },
  to_verify: { label: "À vérifier", tone: "purple" },
};

export function ContributionsPage() {
  const { data, loading, error, reload } = usePrivateApi<MemberContributionsData>("/api/member/contributions");
  const currentYear = Number(todayInParis().slice(0, 4));
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const years = useMemo(() => data ? Array.from({ length: currentYear - data.historyStartYear + 1 }, (_, index) => currentYear - index) : [], [data, currentYear]);
  const contributions = data?.contributions.filter((item) => Number(item.dueDate.slice(0, 4)) === selectedYear) ?? [];
  const remaining = contributions.reduce((sum, item) => item.status === "exempt" ? sum : sum + Math.max(0, item.expectedAmountCents - item.paidAmountCents), 0);

  if (loading) return <AppFrame area="member" title="Mes cotisations" subtitle="Historique depuis 2021" activePath="/membre/cotisations"><MemberLoading /></AppFrame>;
  if (!data || error) return <AppFrame area="member" title="Mes cotisations" subtitle="Historique personnel" activePath="/membre/cotisations"><MemberError message={error || "Aucune donnée reçue."} retry={() => void reload()} /></AppFrame>;

  return (
    <AppFrame area="member" title="Mes cotisations" subtitle={`Historique depuis ${data.historyStartYear}`} activePath="/membre/cotisations">
      <div className="space-y-4">
        <label className="block"><span className="sr-only">Choisir une année</span><select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-900">{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>

        {contributions.length ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{contributions.map((item) => { const presentation = labels[item.status]; const Icon = item.status === "paid" ? CheckCircle2 : item.status === "upcoming" ? Clock3 : item.status === "to_verify" ? HelpCircle : WalletCards; return <div key={item.id} className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon size={20} /></div><div className="min-w-0 flex-1"><p className="font-extrabold">{formatMonth(item.dueDate)}</p><p className="text-xs text-slate-500">Payé : {formatEuros(item.paidAmountCents)} sur {formatEuros(item.expectedAmountCents)}</p></div><StatusBadge label={presentation.label} tone={presentation.tone} /></div>; })}</section> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><Clock3 className="mx-auto text-slate-400" /><h2 className="mt-3 font-extrabold">Aucune cotisation enregistrée en {selectedYear}</h2><p className="mt-1 text-sm text-slate-500">Le bureau peut encore importer ou vérifier l’historique.</p></section>}

        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5"><p className="text-sm font-semibold text-blue-800">Total restant pour {selectedYear}, échéances futures comprises</p><p className="mt-1 text-3xl font-black text-blue-900">{formatEuros(remaining)}</p></section>
        <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-700 bg-white font-extrabold text-blue-800"><MessageCircle size={18} aria-hidden="true" /> Contacter le bureau</button>
      </div>
    </AppFrame>
  );
}
