import { Check, RefreshCw, UserCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppFrame } from "../../components/AppFrame";

type AccessRequest = {
  id: string;
  memberNumber: string;
  declaredName: string;
  phone: string;
  status: string;
  createdAt: string;
  matchingMemberId: string | null;
  matchingFirstName: string | null;
  matchingLastName: string | null;
};

export function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/office/access-requests", { credentials: "include" });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { requests: AccessRequest[] };
      setRequests(body.requests);
    } catch {
      setMessage("Impossible de charger les demandes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    const note = action === "reject" ? window.prompt("Motif du refus (obligatoire) :") : "Identité vérifiée par le bureau";
    if (note === null || (action === "reject" && note.trim().length < 3)) return;

    setBusyId(id);
    setMessage("");
    const response = await fetch(`/api/office/access-requests/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ note }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    setMessage(body.message ?? (response.ok ? "Demande traitée." : "Action impossible."));
    setBusyId(null);
    if (response.ok) await load();
  }

  return (
    <AppFrame area="office" title="Validations" subtitle="Accès réservé aux responsables autorisés" activePath="/bureau/plus">
      {message ? <p role="status" className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">{message}</p> : null}
      {loading ? <div className="grid min-h-48 place-items-center"><RefreshCw className="animate-spin text-blue-700" /></div> : null}
      {!loading && requests.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-7 text-center"><UserCheck className="mx-auto text-emerald-600" size={38} /><h2 className="mt-3 text-lg font-extrabold">Aucune demande en attente</h2><p className="mt-1 text-sm text-slate-600">Toutes les demandes ont été traitées.</p></section>
      ) : null}
      <div className="space-y-4">
        {requests.map((request) => (
          <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold">{request.declaredName}</h2><p className="mt-1 text-sm text-slate-600">N° {request.memberNumber} · {request.phone}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${request.matchingMemberId ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{request.matchingMemberId ? "Membre trouvé" : "Introuvable"}</span></div>
            {request.matchingMemberId ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><strong>Registre :</strong> {request.matchingFirstName} {request.matchingLastName}</p> : <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">Vérifiez le numéro avant toute validation.</p>}
            <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" disabled={!request.matchingMemberId || busyId === request.id} onClick={() => void review(request.id, "approve")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-extrabold text-white disabled:opacity-40"><Check size={17} /> Valider</button><button type="button" disabled={busyId === request.id} onClick={() => void review(request.id, "reject")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300 px-3 text-sm font-extrabold text-red-700 disabled:opacity-40"><X size={17} /> Refuser</button></div>
          </article>
        ))}
      </div>
    </AppFrame>
  );
}

