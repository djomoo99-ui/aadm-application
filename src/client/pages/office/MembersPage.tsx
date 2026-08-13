import { ChevronLeft, ChevronRight, Search, UserRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { OfficeHouseholdListData } from "../../../shared/office";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { StatusBadge } from "../../components/StatusBadge";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatEuros } from "../../utils/format";

const filters = [
  { value: "all", label: "Tous" },
  { value: "red", label: "12 mois et plus" },
  { value: "orange", label: "6 à 11 mois" },
  { value: "green", label: "Moins de 6 mois" },
  { value: "blue", label: "À jour" },
  { value: "purple", label: "À vérifier" },
] as const;

export function MembersPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const query = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const page = params.get("page") ?? "1";
  const url = useMemo(() => `/api/office/households?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=${encodeURIComponent(page)}`, [query, status, page]);
  const { data, loading, error, reload } = usePrivateApi<OfficeHouseholdListData>(url);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setParams({ q: search.trim(), status, page: "1" });
  }

  function chooseFilter(value: string) {
    setParams({ q: query, status: value, page: "1" });
  }

  return (
    <AppFrame area="office" title="Membres et foyers" subtitle="Données réservées au bureau" activePath="/bureau/membres">
      <div className="space-y-4">
        <form onSubmit={submitSearch} className="flex gap-2">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Rechercher un membre</span><Search className="absolute left-3 top-3.5 text-slate-400" size={19} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={50} className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3" placeholder="Nom, numéro ou téléphone" /></label>
          <button className="min-h-12 rounded-xl bg-[#173B57] px-4 text-sm font-extrabold text-white">Chercher</button>
        </form>

        <div className="flex gap-2 overflow-x-auto pb-1">{filters.map((filter) => <button key={filter.value} type="button" onClick={() => chooseFilter(filter.value)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold ${status === filter.value ? "bg-[#173B57] text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{filter.label}</button>)}</div>

        {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée reçue."} retry={() => void reload()} /> : <>
          <p className="text-xs font-semibold text-slate-500">{data.total} foyer{data.total > 1 ? "s" : ""} trouvé{data.total > 1 ? "s" : ""}</p>
          {data.items.length ? <section className="space-y-3">{data.items.map((household) => <Link key={household.memberReference} to={`/bureau/membre?ref=${encodeURIComponent(household.memberReference)}`} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-800"><UserRound /></span><span className="min-w-0 flex-1"><strong className="block truncate">{household.householdName}</strong><small className="block truncate text-slate-500">{household.representativeName} · {household.representativeNumber} · {household.memberCount} membre{household.memberCount > 1 ? "s" : ""}</small><span className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge label={household.statusLabel} tone={household.statusTone} />{household.dueNowCents > 0 ? <strong className="text-xs text-red-800">{formatEuros(household.dueNowCents)} exigibles</strong> : null}</span></span><ChevronRight className="shrink-0 text-slate-400" size={19} /></Link>)}</section> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><Search className="mx-auto text-slate-400" /><h2 className="mt-3 font-extrabold">Aucun foyer trouvé</h2><p className="mt-1 text-sm text-slate-500">Modifiez le nom ou le filtre utilisé.</p></section>}
          {data.pageCount > 1 ? <nav aria-label="Pages" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2"><button disabled={data.page <= 1} onClick={() => setParams({ q: query, status, page: String(data.page - 1) })} className="grid size-10 place-items-center rounded-lg disabled:opacity-30" aria-label="Page précédente"><ChevronLeft /></button><span className="text-sm font-bold">Page {data.page} sur {data.pageCount}</span><button disabled={data.page >= data.pageCount} onClick={() => setParams({ q: query, status, page: String(data.page + 1) })} className="grid size-10 place-items-center rounded-lg disabled:opacity-30" aria-label="Page suivante"><ChevronRight /></button></nav> : null}
        </>}
      </div>
    </AppFrame>
  );
}

