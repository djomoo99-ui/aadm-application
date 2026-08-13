import { AlertTriangle, BellRing, CheckCircle2, RefreshCw, SearchCheck } from "lucide-react";
import { useState } from "react";

import type { AlertsData, AlertScanResult, AlertSeverity, AlertStatus, OfficeAlert } from "../../../shared/alerts";
import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { StatusBadge } from "../../components/StatusBadge";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import { formatDate } from "../../utils/format";
import { privateMutation } from "../../utils/privateMutation";

const statusLabels: Record<AlertStatus, string> = { open: "Ouverte", in_review: "En cours", resolved: "Résolue" };
const severityLabels: Record<AlertSeverity, string> = { info: "Information", warning: "Attention", critical: "Critique" };
const tone = { info: "blue", warning: "orange", critical: "red" } as const;

function AlertCard({ item, canManage, onChange }: { item: OfficeAlert; canManage: boolean; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const change = async (status: "in_review" | "resolved") => {
    const note = window.prompt(status === "resolved" ? "Comment l’anomalie a-t-elle été réglée ?" : "Qui vérifie et quelle est la prochaine action ?");
    if (!note) return;
    setBusy(true);
    try { await privateMutation(`/api/office/alerts/${item.id}`, "PATCH", { status, note }); await onChange(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "La modification a échoué."); }
    finally { setBusy(false); }
  };
  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${item.severity === "critical" && item.status !== "resolved" ? "border-red-300" : "border-slate-200"}`}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{item.title}</h2><p className="mt-1 text-sm text-slate-600">{item.message}</p></div><StatusBadge label={severityLabels[item.severity]} tone={tone[item.severity]} /></div>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-700">{statusLabels[item.status]}</span><span className="text-slate-500">Détectée le {formatDate(item.firstDetectedAt.slice(0, 10))}</span></div>
    {item.resolutionNote ? <p className="mt-3 rounded-xl bg-green-50 p-3 text-xs font-bold text-green-900">Note : {item.resolutionNote}</p> : null}
    {canManage && item.status !== "resolved" ? <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => void change("in_review")} className="min-h-11 rounded-xl border border-blue-700 px-3 text-xs font-black text-blue-800 disabled:opacity-40"><SearchCheck className="mr-1 inline" size={16} /> Prendre en charge</button><button type="button" disabled={busy} onClick={() => void change("resolved")} className="min-h-11 rounded-xl bg-green-700 px-3 text-xs font-black text-white disabled:opacity-40"><CheckCircle2 className="mr-1 inline" size={16} /> Marquer résolue</button></div> : null}
  </article>;
}

export function AlertsPage() {
  const { access } = useAuth();
  const [status, setStatus] = useState<"all" | AlertStatus>("open");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const canManage = access?.roles.some((role) => role === "controller" || role === "admin") ?? false;
  const { data, loading, error, reload } = usePrivateApi<AlertsData>(`/api/office/alerts?status=${status}`);
  const scan = async () => {
    const reason = window.prompt("Pourquoi lancez-vous ce contrôle ?", "Contrôle régulier du bureau");
    if (!reason) return;
    setBusy(true); setNotice("");
    try { const result = await privateMutation<AlertScanResult>("/api/office/alerts/scan", "POST", { reason }); setNotice(`${result.detectedCount} élément(s) détecté(s), ${result.openedCount} nouvelle(s), ${result.reopenedCount} rouverte(s), ${result.autoResolvedCount} résolue(s) automatiquement.`); await reload(); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : "Le contrôle a échoué."); }
    finally { setBusy(false); }
  };
  return <AppFrame area="office" title="Alertes et anomalies" subtitle="Contrôle interne du bureau" activePath="/bureau/plus">
    <div className="space-y-4">
      {loading ? <MemberLoading /> : error || !data ? <MemberError message={error || "Aucune donnée."} retry={() => void reload()} /> : <>
        <section className="grid grid-cols-4 gap-2"><div className="rounded-xl bg-white p-3 text-center"><BellRing className="mx-auto text-blue-800" size={18} /><strong className="block text-xl">{data.summary.open}</strong><span className="text-[10px] font-bold text-slate-500">Ouvertes</span></div><div className="rounded-xl bg-white p-3 text-center"><SearchCheck className="mx-auto text-orange-700" size={18} /><strong className="block text-xl">{data.summary.in_review}</strong><span className="text-[10px] font-bold text-slate-500">En cours</span></div><div className="rounded-xl bg-white p-3 text-center"><AlertTriangle className="mx-auto text-red-700" size={18} /><strong className="block text-xl">{data.summary.critical}</strong><span className="text-[10px] font-bold text-slate-500">Critiques</span></div><div className="rounded-xl bg-white p-3 text-center"><CheckCircle2 className="mx-auto text-green-700" size={18} /><strong className="block text-xl">{data.summary.resolved}</strong><span className="text-[10px] font-bold text-slate-500">Résolues</span></div></section>
        {canManage ? <button type="button" onClick={() => void scan()} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173B57] px-4 font-black text-white disabled:opacity-40"><RefreshCw className={busy ? "animate-spin" : ""} size={18} /> {busy ? "Contrôle en cours…" : "Lancer le contrôle"}</button> : <p className="rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-900">Vous pouvez consulter les alertes. Leur contrôle et leur traitement sont réservés au contrôleur et à l’administrateur.</p>}
        {notice ? <p role="status" className="rounded-xl bg-green-50 p-3 text-sm font-bold text-green-900">{notice}</p> : null}
        <div className="flex gap-2 overflow-x-auto pb-1">{(["open", "in_review", "resolved", "all"] as const).map((value) => <button key={value} type="button" onClick={() => setStatus(value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${status === value ? "bg-blue-800 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{value === "all" ? "Toutes" : statusLabels[value]}</button>)}</div>
        {data.items.length ? <section className="space-y-3">{data.items.map((item) => <AlertCard key={item.id} item={item} canManage={canManage} onChange={reload} />)}</section> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><CheckCircle2 className="mx-auto text-green-700" size={40} /><h2 className="mt-3 font-black">Aucune alerte dans cette vue</h2><p className="mt-1 text-sm text-slate-500">Lancez un contrôle pour actualiser la situation.</p></section>}
        {data.lastScan ? <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><strong>Dernier contrôle :</strong> {formatDate(data.lastScan.createdAt.slice(0, 10))} par {data.lastScan.runByName} · {data.lastScan.trigger === "scheduled" ? "automatique" : "manuel"} · {data.lastScan.detectedCount} élément(s) détecté(s).</p> : null}
      </>}
    </div>
  </AppFrame>;
}
