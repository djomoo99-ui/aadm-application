import { AlertTriangle, Banknote, BellRing, Euro, ReceiptText, UserCheck, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

import type { OfficeDashboardData } from "../../../shared/office";
import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { PrimaryLink } from "../../components/PrimaryLink";
import { StatusBadge } from "../../components/StatusBadge";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatDate, formatEuros } from "../../utils/format";

export function OfficeDashboardPage() {
  const { access } = useAuth();
  const { data, loading, error, reload } = usePrivateApi<OfficeDashboardData>("/api/office/dashboard");
  const canReviewAccess = access?.roles.some((role) => ["controller", "treasurer", "admin"].includes(role)) ?? false;
  const canViewPayments = canReviewAccess;

  if (loading) return <AppFrame area="office" title="Tableau du bureau" subtitle="Données sécurisées" activePath="/bureau"><MemberLoading /></AppFrame>;
  if (!data || error) return <AppFrame area="office" title="Tableau du bureau" subtitle="Données sécurisées" activePath="/bureau"><MemberError message={error || "Aucune donnée reçue."} retry={() => void reload()} /></AppFrame>;

  return (
    <AppFrame area="office" title="Tableau du bureau" subtitle="Situation réelle de l’association" activePath="/bureau">
      <div className="space-y-4">
        <section className="grid grid-cols-3 gap-2">
          <Stat icon={UsersRound} value={data.members.toLocaleString("fr-FR")} label="Membres" />
          <Stat icon={Euro} value={formatEuros(data.collectedCents)} label="Encaissés" />
          <Stat icon={Banknote} value={formatEuros(data.dueNowCents)} label="Exigibles" />
        </section>

        <p className="text-center text-xs font-semibold text-slate-500">{data.households} foyer{data.households > 1 ? "s" : ""} suivi{data.households > 1 ? "s" : ""}</p>

        <Link to="/bureau/alertes" className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm ${data.criticalAlerts > 0 ? "border-red-200 bg-red-50 text-red-950" : "border-blue-100 bg-blue-50 text-blue-950"}`}>
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-white ${data.criticalAlerts > 0 ? "bg-red-700" : "bg-blue-800"}`}>{data.criticalAlerts > 0 ? <AlertTriangle size={21} /> : <BellRing size={21} />}</span>
          <span className="min-w-0 flex-1"><strong className="block">{data.openAlerts} alerte{data.openAlerts > 1 ? "s" : ""} à suivre</strong><small className="block">{data.criticalAlerts > 0 ? `${data.criticalAlerts} critique${data.criticalAlerts > 1 ? "s" : ""} à traiter en priorité` : data.lastAlertScanAt ? `Dernier contrôle : ${formatDate(data.lastAlertScanAt.slice(0, 10))}` : "Le premier contrôle sera automatique"}</small></span>
          <span className="text-xs font-black">Ouvrir</span>
        </Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-black">Situation des foyers</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {data.statuses.map((item) => (
              <div key={item.tone} className="flex items-center justify-between py-3">
                <StatusBadge label={item.label} tone={item.tone} />
                <span className="text-lg font-black">{item.count}</span>
              </div>
            ))}
          </div>
        </section>

        {canReviewAccess ? <section className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
          <div className="flex items-start gap-3"><UserCheck className="mt-1 shrink-0 text-orange-800" /><div><p className="text-xs font-bold uppercase tracking-wide text-orange-800">Comptes à vérifier</p><p className="mt-1 text-xl font-black text-orange-950">{data.pendingAccessRequests} demande{data.pendingAccessRequests > 1 ? "s" : ""}</p><p className="text-sm text-orange-800">Le QR est activé uniquement après validation.</p></div></div>
        </section> : null}

        {canViewPayments ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-black"><ReceiptText size={19} /> Paiements récents</h2><Link to="/bureau/paiements" className="text-xs font-extrabold text-blue-800">Tout voir</Link></div>
          {data.recentPayments.length ? <div className="mt-3 divide-y divide-slate-100">{data.recentPayments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold">{payment.householdName}</p><p className="text-xs text-slate-500">{formatDate(payment.paymentDate)} · {payment.receiptNumber}</p></div><div className="text-right"><strong className={payment.status === "reversed" ? "text-slate-400 line-through" : "text-green-800"}>{formatEuros(payment.amountCents)}</strong>{payment.status === "reversed" ? <p className="text-[10px] font-bold text-red-700">Annulé</p> : null}</div></div>)}</div> : <p className="mt-3 text-sm text-slate-500">Aucun paiement enregistré.</p>}
        </section> : null}

        {canReviewAccess ? <PrimaryLink to="/bureau/validations">Vérifier les nouveaux comptes</PrimaryLink> : null}
      </div>
    </AppFrame>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof UsersRound; value: string; label: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm"><Icon className="mx-auto text-blue-800" size={22} aria-hidden="true" /><p className="mt-2 break-words text-sm font-black leading-tight">{value}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{label}</p></div>;
}
