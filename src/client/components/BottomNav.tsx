import { Banknote, CircleUserRound, Home, LayoutDashboard, MoreHorizontal, QrCode, ScanLine, UsersRound } from "lucide-react";
import { NavLink } from "react-router-dom";

export type AppArea = "member" | "office";

type BottomNavProps = {
  area: AppArea;
  activePath: string;
};

const memberItems = [
  { to: "/membre", label: "Accueil", icon: Home },
  { to: "/membre/cotisations", label: "Cotisations", icon: Banknote },
  { to: "/membre/qr", label: "Mon QR", icon: QrCode },
  { to: "/membre/compte", label: "Compte", icon: CircleUserRound },
];

const officeItems = [
  { to: "/bureau", label: "Tableau", icon: LayoutDashboard },
  { to: "/bureau/membres", label: "Membres", icon: UsersRound },
  { to: "/bureau/scanner", label: "Scanner", icon: ScanLine },
  { to: "/bureau/plus", label: "Plus", icon: MoreHorizontal },
];

export function BottomNav({ area, activePath }: BottomNavProps) {
  const items = area === "member" ? memberItems : officeItems;

  return (
    <nav
      aria-label={area === "member" ? "Navigation membre" : "Navigation du bureau"}
      className="sticky bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white px-2 pb-[max(.6rem,env(safe-area-inset-bottom))] pt-2"
    >
      {items.map(({ to, label, icon: Icon }) => {
        const isActive = activePath === to;
        return (
          <NavLink
            key={to}
            to={to}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold transition ${
              isActive ? "bg-blue-50 text-blue-800" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Icon size={21} strokeWidth={isActive ? 2.6 : 2} aria-hidden="true" />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}
