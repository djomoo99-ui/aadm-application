import { BellRing, Building2, CalendarDays, DatabaseBackup, FileSpreadsheet, History, KeyRound, MessageCircle, ReceiptText, Settings, UserCheck, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { AppFrame } from "../../components/AppFrame";

const baseOptions = [
  { label: "Alertes et anomalies", detail: "Contrôler les éléments à vérifier", icon: BellRing, path: "/bureau/alertes" },
  { label: "Bureaux", detail: "Paris et antennes locales", icon: Building2, path: "/bureau/bureaux" },
  { label: "Demandes d’accès", detail: "Vérifier les nouveaux comptes", icon: UserCheck, path: "/bureau/validations" },
  { label: "Historique des paiements", detail: "Reçus et corrections de caisse", icon: ReceiptText, path: "/bureau/paiements" },
  { label: "Rappels WhatsApp", detail: "Cotisations passées et à venir", icon: MessageCircle, path: "/bureau/rappels" },
  { label: "Importer Excel", detail: "Historique depuis 2021", icon: FileSpreadsheet, path: "/bureau/import-excel" },
  { label: "Foyers et membres", detail: "Ajouter ou modifier les fiches", icon: UsersRound, path: "/bureau/administration" },
  { label: "Responsables", detail: "Rôles, accès et sessions", icon: UsersRound, path: "/bureau/responsables" },
  { label: "Tarifs", detail: "Règles trimestrielles", icon: Settings, path: "/bureau/categories" },
  { label: "Calendrier", detail: "Réunions et échéances annuelles", icon: CalendarDays, path: "/bureau/calendrier" },
  { label: "Journal", detail: "Actions sensibles", icon: History, path: "/bureau/journal" },
  { label: "Sauvegardes", detail: "Exports et copies métier", icon: DatabaseBackup, path: "/bureau/sauvegardes" },
  { label: "Sécurité", detail: "Sessions et accès", icon: KeyRound, path: null },
];

export function OfficeMorePage() {
  const { access } = useAuth();
  const options = baseOptions.filter((option) => {
    if (option.path === "/bureau/validations") return access?.roles.some((role) => ["controller", "treasurer", "admin"].includes(role));
    if (option.path === "/bureau/paiements") return access?.roles.some((role) => ["controller", "treasurer", "admin"].includes(role));
    if (option.path === "/bureau/import-excel") return access?.roles.includes("admin");
    if (option.path === "/bureau/rappels") return access?.roles.some((role) => ["controller", "treasurer", "admin"].includes(role));
    if (option.path === "/bureau/administration") return access?.roles.some((role) => ["data_entry", "admin"].includes(role));
    if (option.path === "/bureau/categories") return access?.roles.includes("admin");
    if (option.path === "/bureau/responsables") return access?.roles.includes("admin");
    if (option.path === "/bureau/journal") return access?.roles.includes("admin");
    if (option.path === "/bureau/sauvegardes") return access?.roles.includes("admin");
    return true;
  });
  return (
    <AppFrame area="office" title="Administration" subtitle="Accès autorisé" activePath="/bureau/plus">
      <div className="space-y-4">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {options.map(({ label, detail, icon: Icon, path }) => {
            const content = (
              <>
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-800"><Icon size={20} /></span>
              <span className="flex-1"><strong className="block">{label}</strong><small className="text-slate-500">{detail}</small></span>
              </>
            );
            return path ? <Link key={label} to={path} className="flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left last:border-0">{content}</Link> : <button key={label} type="button" disabled className="flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left opacity-60 last:border-0">{content}</button>;
          })}
        </section>

        <Link to="/membre" className="block rounded-xl border border-dashed border-slate-300 bg-white p-3 text-center text-xs font-bold text-slate-500">Aperçu de l’espace membre</Link>
      </div>
    </AppFrame>
  );
}
