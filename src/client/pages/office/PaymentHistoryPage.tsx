import { AlertTriangle, CheckCircle2, ReceiptText, RotateCcw } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import type { OfficePaymentItem, OfficePaymentsData } from "../../../shared/office";
import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatDate, formatEuros } from "../../utils/format";

export function PaymentHistoryPage() {
  const { access } = useAuth();
  const { data, loading, error, reload } = usePrivateApi<OfficePaymentsData>("/api/office/payments");
  const [filter, setFilter] = useState<"all" | "posted" | "reversed">("all");
  const [selected, setSelected] = useState<OfficePaymentItem | null>(null);
  const [reason, setReason] = useState("");
  const [receiptConfirmation, setReceiptConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const canReverse = access?.roles.some((role) => role === "treasurer" || role === "admin") ?? false;
  const payments = useMemo(() => data?.payments.filter((payment) => filter === "all" || payment.status === filter) ?? [], [data, filter]);

  async function reversePayment(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true); setFormError(""); setSuccess("");
    try {
      const response = await fetch(`/api/office/payments/${encodeURIComponent(selected.id)}/reverse`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, receiptConfirmation }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Impossible d’annuler ce paiement.");
      setSuccess(body.message ?? "Paiement annulé."); setSelected(null); setReason(""); setReceiptConfirmation("");
      await reload();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally { setSubmitting(false); }
  }

  return (
    <AppFrame area="office" title="Historique des paiements" subtitle="Reçus et corrections de caisse" activePath="/bureau/plus">
      <div className="space-y-4">
        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><div className="flex gap-3"><ReceiptText className="shrink-0 text-blue-800" /><div><h2 className="font-black text-blue-950">Aucun paiement n’est supprimé</h2><p className="mt-1 text-sm text-blue-800">Une erreur est corrigée par une annulation tracée, puis par un nouveau paiement si nécessaire.</p></div></div></section>
        {success ? <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800"><CheckCircle2 size={18} /> {success}</p> : null}
        <div className="flex gap-2">{(["all", "posted", "reversed"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-2 text-xs font-bold ${filter === value ? "bg-[#173B57] text-white" : "border border-slate-200 bg-white"}`}>{value === "all" ? "Tous" : value === "posted" ? "Validés" : "Annulés"}</button>)}</div>
        {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée reçue."} retry={() => void reload()} /> : payments.length ? <section className="space-y-3">{payments.map((payment) => <article key={payment.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${payment.status === "reversed" ? "border-red-200" : "border-slate-200"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-extrabold">{payment.householdName}</p><p className="text-xs text-slate-500">{payment.memberName} · {payment.memberNumber}</p></div><strong className={`text-lg ${payment.status === "reversed" ? "text-slate-400 line-through" : "text-green-800"}`}>{formatEuros(payment.amountCents)}</strong></div><div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs"><p><strong>Reçu :</strong> <span className="font-mono">{payment.receiptNumber}</span></p><p className="mt-1"><strong>Date :</strong> {formatDate(payment.paymentDate)}</p><p className="mt-1"><strong>Saisi par :</strong> {payment.recordedByName}</p>{payment.note ? <p className="mt-1"><strong>Note :</strong> {payment.note}</p> : null}</div>{payment.reversal ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900"><p className="font-black">Paiement annulé</p><p className="mt-1">{payment.reversal.reason}</p><p className="mt-1">Par {payment.reversal.reversedByName}, le {formatDate(payment.reversal.reversedAt.slice(0, 10))}</p></div> : canReverse ? <button type="button" onClick={() => { setSelected(payment); setFormError(""); setSuccess(""); }} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-sm font-extrabold text-red-800"><RotateCcw size={17} /> Corriger par une annulation</button> : null}</article>)}</section> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><ReceiptText className="mx-auto text-slate-400" /><h2 className="mt-3 font-extrabold">Aucun paiement dans cette liste</h2></section>}

        {selected ? <form onSubmit={reversePayment} className="rounded-2xl border-2 border-red-300 bg-red-50 p-5"><div className="flex gap-3"><AlertTriangle className="shrink-0 text-red-700" /><div><h2 className="font-black text-red-950">Confirmer l’annulation</h2><p className="mt-1 text-sm text-red-800">Les {formatEuros(selected.amountCents)} seront retirés des cotisations concernées. La trace restera visible.</p></div></div><label className="mt-4 block text-sm font-bold text-red-950">Raison obligatoire<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={300} required rows={3} className="mt-1 w-full rounded-xl border border-red-300 bg-white px-3 py-2" placeholder="Ex. erreur de montant lors de la saisie" /></label><label className="mt-3 block text-sm font-bold text-red-950">Recopiez le numéro du reçu<input value={receiptConfirmation} onChange={(event) => setReceiptConfirmation(event.target.value)} required className="mt-1 w-full rounded-xl border border-red-300 bg-white px-3 py-3 font-mono" placeholder={selected.receiptNumber} /></label>{formError ? <p className="mt-3 text-sm font-bold text-red-800">{formError}</p> : null}<div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setSelected(null); setReason(""); setReceiptConfirmation(""); }} className="min-h-12 rounded-xl border border-slate-300 bg-white font-extrabold">Retour</button><button disabled={submitting || receiptConfirmation !== selected.receiptNumber || reason.trim().length < 5} className="min-h-12 rounded-xl bg-red-700 px-3 font-extrabold text-white disabled:opacity-40">{submitting ? "Annulation…" : "Annuler le paiement"}</button></div></form> : null}
      </div>
    </AppFrame>
  );
}

