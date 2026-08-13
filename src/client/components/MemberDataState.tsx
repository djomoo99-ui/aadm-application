import { RefreshCw, WifiOff } from "lucide-react";

export function MemberLoading() {
  return <div className="grid min-h-64 place-items-center"><div className="text-center"><RefreshCw className="mx-auto animate-spin text-blue-700" /><p className="mt-3 text-sm font-semibold text-slate-500">Chargement sécurisé…</p></div></div>;
}

export function MemberError({ message, retry }: { message: string; retry: () => void }) {
  return <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center"><WifiOff className="mx-auto text-red-700" /><h2 className="mt-3 font-extrabold text-red-950">Informations indisponibles</h2><p className="mt-2 text-sm text-red-800">{message}</p><button type="button" onClick={retry} className="mt-4 min-h-11 rounded-xl bg-red-700 px-5 text-sm font-extrabold text-white">Réessayer</button></section>;
}

