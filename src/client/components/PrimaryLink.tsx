import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

type PrimaryLinkProps = {
  to: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
};

export function PrimaryLink({ to, children, variant = "primary" }: PrimaryLinkProps) {
  return (
    <Link
      to={to}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition active:scale-[.99] ${
        variant === "primary"
          ? "bg-[#173B57] text-white hover:bg-[#102f48]"
          : "border border-blue-700 bg-white text-blue-800 hover:bg-blue-50"
      }`}
    >
      {children}
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  );
}
