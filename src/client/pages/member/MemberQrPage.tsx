import { Expand, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { AppFrame } from "../../components/AppFrame";
import { MemberError, MemberLoading } from "../../components/MemberDataState";
import { QrPreview } from "../../components/QrPreview";
import { StatusBadge } from "../../components/StatusBadge";
import { usePrivateApi } from "../../hooks/usePrivateApi";
import type { MemberQrData } from "../../../shared/member";

export function MemberQrPage() {
  const { data, loading, error, reload } = usePrivateApi<MemberQrData>("/api/member/qr");
  const [fullscreen, setFullscreen] = useState(false);
  if (loading) return <AppFrame area="member" title="Ma carte membre" subtitle="QR personnel" activePath="/membre/qr"><MemberLoading /></AppFrame>;
  if (!data || error) return <AppFrame area="member" title="Ma carte membre" subtitle="QR personnel" activePath="/membre/qr"><MemberError message={error || "QR indisponible."} retry={() => void reload()} /></AppFrame>;
  const value = `AADM:${data.qrToken}`;

  return (
    <AppFrame area="member" title="Ma carte membre" subtitle="QR personnel" activePath="/membre/qr">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm"><StatusBadge label="Compte validé" tone="green" /><div className="mt-5"><p className="text-xl font-black">{data.member.fullName}</p><p className="text-sm font-semibold text-slate-500">N° {data.member.memberNumber}</p><p className="text-sm text-slate-500">{data.householdName}</p></div><div className="mx-auto mt-5 flex max-w-[270px] justify-center rounded-2xl border-2 border-slate-200 bg-white p-4"><QrPreview value={value} /></div><p className="mt-3 text-sm font-extrabold">Mon QR de membre</p><p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-500">Présentez ce QR au trésorier lors d’un paiement en espèces. Ne le publiez pas sur les réseaux sociaux.</p><button type="button" onClick={() => setFullscreen(true)} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173B57] font-extrabold text-white"><Expand size={18} aria-hidden="true" /> Afficher en plein écran</button><p className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-green-700"><ShieldCheck size={15} aria-hidden="true" /> QR actif, opaque et sécurisé</p></section>
      {fullscreen ? <div role="dialog" aria-modal="true" aria-label="QR en plein écran" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/90 p-5"><div className="w-full max-w-sm rounded-3xl bg-white p-5 text-center"><button type="button" onClick={() => setFullscreen(false)} className="ml-auto grid size-11 place-items-center rounded-full bg-slate-100" aria-label="Fermer"><X /></button><p className="mt-2 text-xl font-black">{data.member.fullName}</p><div className="mt-5 flex justify-center"><QrPreview value={value} size={290} /></div><button type="button" onClick={() => setFullscreen(false)} className="mt-5 min-h-12 w-full rounded-xl bg-[#173B57] font-extrabold text-white">Fermer</button></div></div> : null}
    </AppFrame>
  );
}

