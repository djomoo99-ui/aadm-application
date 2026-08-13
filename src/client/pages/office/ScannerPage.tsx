import { Camera, CameraOff, CheckCircle2, RefreshCw, Search, ScanLine, UserRound } from "lucide-react";
import QrScanner from "qr-scanner";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";
import { formatEuros } from "../../utils/format";
import type { OfficeMemberSearchResult, OfficeMemberSummary } from "../../../shared/payments";

export function ScannerPage() {
  const { access } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const processingRef = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [member, setMember] = useState<OfficeMemberSummary | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OfficeMemberSearchResult[]>([]);
  const canRecordPayment = access?.roles.some((role) => role === "treasurer" || role === "admin") ?? false;

  useEffect(() => () => scannerRef.current?.destroy(), []);

  async function identifyQr(qrToken: string) {
    if (processingRef.current) return;
    processingRef.current = true;
    setError("");
    try {
      const response = await fetch("/api/office/scan-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ qrToken }),
      });
      const body = (await response.json().catch(() => ({}))) as OfficeMemberSummary & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Ce QR n’est pas reconnu.");
      scannerRef.current?.stop();
      setCameraActive(false);
      setMember(body);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Lecture du QR impossible.");
      window.setTimeout(() => { processingRef.current = false; }, 1200);
      return;
    }
    processingRef.current = false;
  }

  async function startCamera() {
    setError("");
    setMember(null);
    if (!videoRef.current) return;
    scannerRef.current?.destroy();
    const scanner = new QrScanner(
      videoRef.current,
      (result) => { void identifyQr(result.data); },
      {
        preferredCamera: "environment",
        maxScansPerSecond: 6,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      },
    );
    scannerRef.current = scanner;
    try {
      if (!(await QrScanner.hasCamera())) throw new Error("Aucune caméra n’est disponible sur cet appareil.");
      await scanner.start();
      setCameraActive(true);
    } catch {
      scanner.destroy();
      scannerRef.current = null;
      setCameraActive(false);
      setError("Autorisez la caméra dans le navigateur ou utilisez la recherche manuelle.");
    }
  }

  function stopCamera() {
    scannerRef.current?.stop();
    setCameraActive(false);
  }

  async function searchMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (search.trim().length < 2) return;
    setSearching(true);
    setError("");
    setResults([]);
    try {
      const response = await fetch(`/api/office/members/search?q=${encodeURIComponent(search.trim())}`, { credentials: "include" });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { results: OfficeMemberSearchResult[] };
      setResults(body.results);
      if (!body.results.length) setError("Aucun membre ne correspond à cette recherche.");
    } catch {
      setError("La recherche est momentanément indisponible.");
    } finally {
      setSearching(false);
    }
  }

  function selectSearchResult(result: OfficeMemberSearchResult) {
    stopCamera();
    setMember({
      member: { fullName: result.fullName, memberNumber: result.memberNumber },
      household: {
        name: result.householdName,
        dueNowCents: result.dueNowCents,
        totalOutstandingCents: result.totalOutstandingCents,
      },
      source: { memberReference: result.memberReference },
    });
    setResults([]);
  }

  return (
    <AppFrame area="office" title="Scanner un membre" subtitle="Caméra et recherche sécurisées" activePath="/bureau/scanner">
      <div className="space-y-4">
        <section className="rounded-2xl bg-slate-900 p-4 text-center text-white">
          <p className="text-sm font-semibold">Placez le QR AADM dans le cadre</p>
          <div className="relative mx-auto mt-4 aspect-square max-w-[320px] overflow-hidden rounded-2xl border-4 border-white/80 bg-slate-800">
            <video ref={videoRef} muted playsInline className={`size-full object-cover ${cameraActive ? "block" : "hidden"}`} />
            {!cameraActive ? <div className="grid size-full place-items-center"><ScanLine size={92} className="text-white/40" aria-hidden="true" /></div> : null}
          </div>
          {!cameraActive ? <button type="button" onClick={() => void startCamera()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-slate-950"><Camera size={18} /> Activer la caméra</button> : <button type="button" onClick={stopCamera} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/50 px-4 text-sm font-extrabold"><CameraOff size={18} /> Arrêter la caméra</button>}
        </section>

        {error ? <p role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-bold text-orange-900">{error}</p> : null}

        {member ? <section className="rounded-2xl border border-green-200 bg-green-50 p-4"><p className="flex items-center gap-2 font-extrabold text-green-800"><CheckCircle2 size={20} /> Membre identifié</p><p className="mt-3 text-lg font-black">{member.member.fullName} — N° {member.member.memberNumber}</p><p className="text-sm text-slate-600">{member.household.name}</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-white p-3"><span className="block text-xs text-slate-500">Exigible</span><strong className="text-red-700">{formatEuros(member.household.dueNowCents)}</strong></div><div className="rounded-xl bg-white p-3"><span className="block text-xs text-slate-500">Avec échéances futures</span><strong>{formatEuros(member.household.totalOutstandingCents)}</strong></div></div>{canRecordPayment ? <button type="button" onClick={() => navigate("/bureau/paiement", { state: { member } })} className="mt-4 min-h-12 w-full rounded-xl bg-[#173B57] px-4 font-extrabold text-white">Enregistrer un paiement</button> : <p className="mt-4 rounded-xl bg-white p-3 text-sm font-bold text-green-900">Identification terminée. L’encaissement est réservé au trésorier.</p>}</section> : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="flex items-center gap-2 font-black"><Search size={19} /> Recherche sans QR</h2><p className="mt-1 text-xs text-slate-500">Utilisez le nom, le numéro AADM ou le téléphone.</p><form onSubmit={searchMembers} className="mt-3 flex gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} minLength={2} maxLength={50} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3" placeholder="Ex. 00482" /><button disabled={searching || search.trim().length < 2} className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-700 text-white disabled:opacity-50" aria-label="Rechercher">{searching ? <RefreshCw className="animate-spin" size={19} /> : <Search size={19} />}</button></form>{results.length ? <div className="mt-3 divide-y divide-slate-100">{results.map((result) => <button key={result.memberReference} type="button" onClick={() => selectSearchResult(result)} className="flex w-full items-center gap-3 py-3 text-left"><span className="grid size-10 place-items-center rounded-full bg-blue-50 text-blue-800"><UserRound size={19} /></span><span className="min-w-0 flex-1"><strong className="block truncate">{result.fullName} · {result.memberNumber}</strong><small className="text-slate-500">{result.householdName} · {formatEuros(result.dueNowCents)} exigibles</small></span></button>)}</div> : null}</section>
      </div>
    </AppFrame>
  );
}
