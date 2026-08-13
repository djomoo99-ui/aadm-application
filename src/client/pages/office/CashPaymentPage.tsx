import { ArrowLeft, CheckCircle2, Info, ReceiptText, ShieldCheck } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";

import { AppFrame } from "../../components/AppFrame";
import { formatDate, formatEuros } from "../../utils/format";
import type { CashPaymentReceipt, OfficeMemberSummary } from "../../../shared/payments";
import { todayInParis } from "../../../shared/date";

type PaymentState = { member?: OfficeMemberSummary };

export function CashPaymentPage() {
  const location = useLocation();
  const member = (location.state as PaymentState | null)?.member;
  const suggestedAmount = member?.household.dueNowCents ? String(member.household.dueNowCents / 100) : "";
  const [amount, setAmount] = useState(suggestedAmount);
  const [paymentDate, setPaymentDate] = useState(todayInParis);
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<CashPaymentReceipt | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const amountCents = useMemo(() => {
    const normalized = amount.trim().replace(",", ".");
    return /^\d+(?:\.\d{1,2})?$/.test(normalized) ? Math.round(Number(normalized) * 100) : 0;
  }, [amount]);

  if (!member) {
    return <AppFrame area="office" title="Paiement en espèces" subtitle="Accès trésorier" activePath="/bureau/scanner"><section className="rounded-2xl border border-orange-200 bg-orange-50 p-6 text-center"><Info className="mx-auto text-orange-700" /><h2 className="mt-3 text-lg font-black">Sélectionnez d’abord un membre</h2><p className="mt-2 text-sm text-orange-900">Scannez son QR ou utilisez la recherche manuelle avant de saisir l’espèce.</p><Link to="/bureau/scanner" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#173B57] px-5 font-extrabold text-white"><ArrowLeft size={18} /> Retour au scanner</Link></section></AppFrame>;
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member) return;
    if (!reviewing) { if (amountCents > 0) setReviewing(true); return; }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/office/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ source: member.source, amountCents, paymentDate, note, idempotencyKey }),
      });
      const body = (await response.json().catch(() => ({}))) as CashPaymentReceipt & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Le paiement n’a pas été enregistré.");
      setReceipt(body);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return <AppFrame area="office" title="Paiement enregistré" subtitle="Reçu de caisse" activePath="/bureau/scanner"><div className="space-y-4"><section className="rounded-3xl border border-green-200 bg-green-50 p-6 text-center"><CheckCircle2 className="mx-auto text-green-700" size={48} /><h2 className="mt-3 text-2xl font-black text-green-950">{formatEuros(receipt.amountCents)} reçus</h2><p className="mt-1 text-sm text-green-900">{receipt.member.fullName} · {receipt.householdName}</p><div className="mt-5 rounded-2xl bg-white p-4 text-left"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Numéro du reçu</p><p className="mt-1 break-all font-mono text-lg font-black">{receipt.receiptNumber}</p><p className="mt-3 text-sm"><strong>Date :</strong> {formatDate(receipt.paymentDate)}</p><p className="mt-1 text-sm"><strong>Affecté aux cotisations :</strong> {formatEuros(receipt.allocatedAmountCents)}</p>{receipt.unallocatedAmountCents > 0 ? <p className="mt-1 text-sm text-blue-800"><strong>Crédit en attente :</strong> {formatEuros(receipt.unallocatedAmountCents)}</p> : null}</div></section>{receipt.allocations.length ? <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="flex items-center gap-2 font-black"><ReceiptText size={19} /> Affectation la plus ancienne d’abord</h3><div className="mt-3 divide-y divide-slate-100">{receipt.allocations.map((allocation) => <div key={allocation.dueDate} className="flex justify-between py-2 text-sm"><span>{formatDate(allocation.dueDate)}</span><strong>{formatEuros(allocation.amountCents)}</strong></div>)}</div></section> : null}<Link to="/bureau/scanner" replace className="flex min-h-12 items-center justify-center rounded-xl bg-[#173B57] px-4 font-extrabold text-white">Scanner un autre membre</Link></div></AppFrame>;
  }

  return (
    <AppFrame area="office" title="Paiement en espèces" subtitle="Double confirmation du trésorier" activePath="/bureau/scanner">
      <form onSubmit={submitPayment} className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-lg font-black">{member.member.fullName} · N° {member.member.memberNumber}</p><p className="text-sm text-slate-500">{member.household.name}</p><p className="mt-3 text-sm">Reste exigible : <strong className="text-xl text-red-700">{formatEuros(member.household.dueNowCents)}</strong></p><p className="text-xs text-slate-500">Avec échéances futures : {formatEuros(member.household.totalOutstandingCents)}</p></section>

        {!reviewing ? <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4"><label className="block text-sm font-bold">Montant reçu<div className="relative mt-1"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" autoFocus required className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-10 text-lg font-black" /><span className="absolute right-4 top-3.5 font-bold">€</span></div>{amount && amountCents === 0 ? <small className="mt-1 block text-red-700">Saisissez un montant positif avec au maximum deux décimales.</small> : null}</label><label className="block text-sm font-bold">Date<input type="date" value={paymentDate} min="2021-01-01" max={todayInParis()} onChange={(event) => setPaymentDate(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" /></label><label className="block text-sm font-bold">Moyen de paiement<select disabled className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3"><option>Espèces</option></select></label><label className="block text-sm font-bold">Note facultative<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={2} className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-4 py-3" /></label></section> : <section className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-5"><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Confirmation finale</p><p className="mt-2 text-3xl font-black text-blue-950">{formatEuros(amountCents)}</p><p className="mt-1 font-bold text-blue-950">reçus en espèces de {member.member.fullName}</p><p className="mt-3 text-sm text-blue-900">Date enregistrée : {formatDate(paymentDate)}</p><button type="button" onClick={() => setReviewing(false)} className="mt-4 text-sm font-extrabold text-blue-800 underline">Modifier les informations</button></section>}

        <p className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><Info className="shrink-0" size={18} /> Le serveur affectera le paiement aux dettes les plus anciennes, puis aux échéances futures. La cotisation annuelle de rapatriement doit être réglée intégralement en une seule fois ; tout montant partiel sera refusé.</p>
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
        <button disabled={amountCents <= 0 || submitting} className="min-h-13 w-full rounded-xl bg-[#173B57] px-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45">{submitting ? "Enregistrement…" : reviewing ? "Confirmer l’encaissement" : "Vérifier le paiement"}</button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><ShieldCheck size={14} /> Montant, trésorier et reçu seront enregistrés dans le journal.</p>
      </form>
    </AppFrame>
  );
}
