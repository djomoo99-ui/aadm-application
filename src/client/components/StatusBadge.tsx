import { AlertTriangle, CheckCircle2, Clock3, HelpCircle } from "lucide-react";

type Tone = "blue" | "green" | "orange" | "red" | "purple" | "grey";

type StatusBadgeProps = {
  label: string;
  tone: Tone;
};

const toneClasses: Record<Tone, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  green: "border-green-200 bg-green-50 text-green-800",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
  red: "border-red-200 bg-red-50 text-red-800",
  purple: "border-purple-200 bg-purple-50 text-purple-800",
  grey: "border-slate-200 bg-slate-50 text-slate-700",
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  const Icon =
    tone === "red" || tone === "orange"
      ? AlertTriangle
      : tone === "grey"
        ? Clock3
        : tone === "purple"
          ? HelpCircle
          : CheckCircle2;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${toneClasses[tone]}`}
    >
      <Icon aria-hidden="true" size={14} strokeWidth={2.5} />
      {label}
    </span>
  );
}
