import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole } from "lucide-react";

import { BottomNav, type AppArea } from "./BottomNav";

type AppFrameProps = {
  area: AppArea;
  title: string;
  subtitle?: string;
  activePath: string;
  children: ReactNode;
  action?: ReactNode;
};

export function AppFrame({ area, title, subtitle, activePath, children, action }: AppFrameProps) {
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col bg-white shadow-xl shadow-slate-300/40">
        <header className="sticky top-0 z-20 bg-[#173B57] px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link to={area === "member" ? "/membre" : "/bureau"} className="text-sm font-black tracking-[0.16em] text-blue-100">
                AADM
              </Link>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight">{title}</h1>
              {subtitle ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-blue-100">
                  {area === "office" ? <LockKeyhole size={13} aria-hidden="true" /> : null}
                  {subtitle}
                </p>
              ) : null}
            </div>
            {action}
          </div>
        </header>

        <main className="flex-1 bg-slate-50 px-4 py-5">{children}</main>
        <BottomNav area={area} activePath={activePath} />
      </div>
    </div>
  );
}
