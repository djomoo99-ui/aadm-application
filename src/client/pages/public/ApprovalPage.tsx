import { Check, Clock3, LogOut, MessageCircle, ShieldAlert, ShieldCheck } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";

export function ApprovalPage() {
  const { access, signOut } = useAuth();
  const rejected = access?.requestStatus === "rejected";

  return (
    <div className="min-h-dvh bg-slate-100 p-4 text-slate-950">
      <main className="mx-auto min-h-[calc(100dvh-2rem)] w-full max-w-[520px] rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between"><p className="text-sm font-black tracking-[0.16em] text-[#173B57]">AADM</p><button type="button" onClick={() => void signOut()} className="flex items-center gap-1 text-xs font-bold text-slate-500"><LogOut size={15} /> Déconnexion</button></div>
        <h1 className="mt-5 text-3xl font-black">Validation de votre compte</h1>
        <div className={`mx-auto mt-8 grid size-24 place-items-center rounded-full ${rejected ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{rejected ? <ShieldAlert size={52} /> : <ShieldCheck size={52} />}</div>
        <div className="mt-5 text-center">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold ${rejected ? "border-red-200 bg-red-50 text-red-800" : "border-orange-200 bg-orange-50 text-orange-800"}`}><Clock3 size={16} /> {rejected ? "Demande à corriger" : "En attente de validation"}</span>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">{rejected ? "Le bureau n’a pas pu confirmer ces informations. Contactez-le avant de créer une nouvelle demande." : "Votre demande a été transmise aux responsables autorisés."}</p>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 p-4 text-sm"><p><strong>Nom :</strong> {access?.user.name}</p><p className="mt-2"><strong>N° de membre :</strong> {access?.user.memberNumber}</p><p className="mt-2"><strong>Téléphone :</strong> {access?.user.phone}</p></section>

        <ol className="mt-6 space-y-4"><li className="flex gap-3"><span className="grid size-7 place-items-center rounded-full bg-blue-700 text-white"><Check size={16} /></span><span><strong className="block">Compte créé</strong><small className="text-slate-500">Informations reçues</small></span></li><li className="flex gap-3"><span className={`grid size-7 place-items-center rounded-full text-white ${rejected ? "bg-red-600" : "bg-orange-500"}`}><Clock3 size={16} /></span><span><strong className="block">Vérification par le bureau</strong><small className={rejected ? "text-red-700" : "text-orange-700"}>{rejected ? "Informations non confirmées" : "En cours"}</small></span></li><li className="flex gap-3 opacity-55"><span className="grid size-7 place-items-center rounded-full bg-slate-300"><ShieldCheck size={16} /></span><span><strong className="block">QR membre activé</strong><small>Après validation</small></span></li></ol>

        <button type="button" className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-700 font-extrabold text-blue-800"><MessageCircle size={18} /> Contacter le bureau</button>
      </main>
    </div>
  );
}

