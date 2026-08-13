import { CalendarRange, ShieldCheck } from "lucide-react";

import type { ContributionCategory, ContributionRulesData } from "../../../shared/administration";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatEuros } from "../../utils/format";

const categoryLabels: Record<ContributionCategory, string> = {
  annual_repatriation: "Caisse annuelle de rapatriement",
  quarterly_working_man: "Cotisation trimestrielle — hommes actifs",
  single_man: "Ancien tarif — homme seul",
  single_woman: "Ancien tarif — femme seule",
  couple: "Ancien tarif — couple",
};

export function ContributionRulesPage() {
  const { data, loading, error, reload } = usePrivateApi<ContributionRulesData>("/api/office/administration/contribution-rules");
  return <AppFrame area="office" title="Cotisations AADM" subtitle="Deux caisses séparées" activePath="/bureau/plus">
    <div className="space-y-4">
      <section className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-950">
        <h2 className="flex items-center gap-2 font-black"><ShieldCheck size={20} /> Barème officiel depuis le 1er janvier 2021</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Rapatriement : 60 € par homme adulte, 20 € par femme adulte et 10 € par enfant, une fois par an à la première réunion.</li>
          <li>Un couple homme-femme paie donc 80 € par an pour cette caisse.</li>
          <li>Le rapatriement est payé intégralement en une seule fois chaque année, sans paiement échelonné.</li>
          <li>Trimestrielle : 20 € par homme adulte exerçant une activité rémunérée, à chaque réunion trimestrielle.</li>
          <li>Une femme paie uniquement la caisse annuelle de rapatriement.</li>
          <li>Les échéances enregistrées depuis 2021 sont recalculées avec ces montants ; les paiements réellement reçus restent inchangés.</li>
        </ul>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Les anciens tarifs par foyer sont conservés uniquement pour lire les archives. Ils ne servent plus à générer de nouvelles échéances.
      </section>
      {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée."} retry={() => void reload()} /> : <div className="space-y-3">{data.rules.map((rule) => <article key={rule.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${rule.effectiveTo ? "border-slate-200 opacity-70" : "border-blue-200"}`}>
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{rule.name}</h2><p className="text-xs font-bold text-blue-800">{categoryLabels[rule.category]}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{rule.effectiveTo ? `Archivé au ${rule.effectiveTo}` : `Depuis ${rule.effectiveFrom}`}</span></div>
        {rule.category === "annual_repatriation" ? <div className="mt-3 grid grid-cols-3 gap-3 text-sm"><p><span className="block text-xs text-slate-500">Homme adulte</span><strong>{formatEuros(rule.baseAmountCents)}</strong></p><p><span className="block text-xs text-slate-500">Femme adulte</span><strong>{formatEuros(rule.femaleAmountCents)}</strong></p><p><span className="block text-xs text-slate-500">Enfant</span><strong>{formatEuros(rule.childAmountCents)}</strong></p></div> : <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><p><span className="block text-xs text-slate-500">Montant principal</span><strong>{formatEuros(rule.baseAmountCents)}</strong></p><p><span className="block text-xs text-slate-500">Montant enfant</span><strong>{formatEuros(rule.childAmountCents)}</strong></p></div>}
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><CalendarRange size={15} /> Mois : {rule.dueMonths.map((month) => String(month).padStart(2, "0")).join(", ") || "archives"}</p>
      </article>)}</div>}
    </div>
  </AppFrame>;
}
