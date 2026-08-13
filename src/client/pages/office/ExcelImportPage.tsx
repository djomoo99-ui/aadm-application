import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { ChangeEvent, useState } from "react";
import readXlsxFile from "read-excel-file/browser";

import type {
  ImportAnalysis,
  ImportActivityRow,
  ImportConfirmation,
  ImportContributionRow,
  ImportMemberRow,
  ImportWorkbookData,
} from "../../../shared/imports";
import { AppFrame } from "../../components/AppFrame";

type Cell = string | number | boolean | Date | null;

const memberHeaders = ["code_foyer", "nom_foyer", "numero_membre", "prenom", "nom", "sexe", "relation", "date_naissance", "telephone", "date_adhesion"];
const activityHeaders = ["numero_membre", "statut_activite", "date_debut", "date_fin", "note"];
const dueHeaders = ["numero_membre", "type_cotisation", "date_echeance", "montant_attendu_eur", "montant_paye_eur", "source", "note"];

function text(cell: Cell) {
  return cell === null ? "" : String(cell).trim();
}

function dateText(cell: Cell) {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}-${String(cell.getDate()).padStart(2, "0")}`;
  }
  return text(cell);
}

function cents(cell: Cell) {
  if (typeof cell === "number" && Number.isFinite(cell)) return Math.round(cell * 100);
  const normalized = text(cell).replace(/\s/g, "").replace(",", ".").replace("€", "");
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
}

function assertHeaders(rows: Cell[][], expected: string[], sheet: string) {
  const received = rows[0]?.slice(0, expected.length).map((cell) => text(cell)) ?? [];
  if (expected.some((header, index) => received[index] !== header)) {
    throw new Error(`Les colonnes de l’onglet ${sheet} ont été modifiées. Téléchargez un nouveau modèle AADM.`);
  }
}

function parseMembers(rows: Cell[][]): ImportMemberRow[] {
  assertHeaders(rows, memberHeaders, "Foyers_Membres");
  return rows.slice(1).map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => text(cell) !== ""))
    .map(({ row, rowNumber }) => {
      const genderValues = { homme: "male", femme: "female", non_precise: "unspecified" } as const;
      const relationshipValues = { responsable: "head", conjoint: "partner", enfant: "child" } as const;
      const gender = genderValues[text(row[5]).toLowerCase() as keyof typeof genderValues];
      const relationship = relationshipValues[text(row[6]).toLowerCase() as keyof typeof relationshipValues];
      if (!gender || !relationship) throw new Error(`Foyers_Membres, ligne ${rowNumber} : utilisez les listes déroulantes.`);
      const birthDate = dateText(row[7]);
      const phone = text(row[8]);
      return {
        rowNumber,
        householdCode: text(row[0]).toUpperCase(), householdName: text(row[1]), memberNumber: text(row[2]).toUpperCase(),
        firstName: text(row[3]), lastName: text(row[4]), gender, relationship,
        ...(birthDate ? { birthDate } : {}), ...(phone ? { phone } : {}),
        joinedAt: dateText(row[9]),
      };
    });
}

function parseActivities(rows: Cell[][]): ImportActivityRow[] {
  assertHeaders(rows, activityHeaders, "Activites");
  return rows.slice(1).map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => text(cell) !== ""))
    .map(({ row, rowNumber }) => {
      const statusValues = { travaille: "working", ne_travaille_pas: "not_working" } as const;
      const status = statusValues[text(row[1]).toLowerCase() as keyof typeof statusValues];
      if (!status) throw new Error(`Activites, ligne ${rowNumber} : utilisez « travaille » ou « ne_travaille_pas » dans la liste.`);
      const endsAt = dateText(row[3]);
      const note = text(row[4]);
      return { rowNumber, memberNumber: text(row[0]).toUpperCase(), status, startsAt: dateText(row[2]),
        ...(endsAt ? { endsAt } : {}), ...(note ? { note } : {}) };
    });
}

function parseContributions(rows: Cell[][]): ImportContributionRow[] {
  assertHeaders(rows, dueHeaders, "Cotisations");
  return rows.slice(1).map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => text(cell) !== ""))
    .map(({ row, rowNumber }) => {
      const sourceValues = { excel: "excel", cahier: "notebook" } as const;
      const source = sourceValues[text(row[5]).toLowerCase() as keyof typeof sourceValues];
      if (!source) throw new Error(`Cotisations, ligne ${rowNumber} : la source doit être « excel » ou « cahier ».`);
      const expectedAmountCents = cents(row[3]);
      const paidAmountCents = cents(row[4]);
      if (!Number.isFinite(expectedAmountCents) || !Number.isFinite(paidAmountCents)) throw new Error(`Cotisations, ligne ${rowNumber} : les montants ne sont pas valides.`);
      const note = text(row[6]);
      const kindValues = { rapatriement_annuel: "annual_repatriation", trimestrielle_homme_actif: "quarterly_working_man" } as const;
      const contributionKind = kindValues[text(row[1]).toLowerCase() as keyof typeof kindValues];
      if (!contributionKind) throw new Error(`Cotisations, ligne ${rowNumber} : utilisez la liste des types de cotisation.`);
      return { rowNumber, memberNumber: text(row[0]).toUpperCase(), contributionKind, dueDate: dateText(row[2]), expectedAmountCents, paidAmountCents, source, ...(note ? { note } : {}) };
    });
}

export function ExcelImportPage() {
  const [fileName, setFileName] = useState("");
  const [workbookData, setWorkbookData] = useState<ImportWorkbookData | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<ImportConfirmation | null>(null);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setAnalysis(null); setWorkbookData(null); setResult(null); setError(""); setConfirmation("");
    if (!file) return;
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 5 * 1024 * 1024) {
      setError("Choisissez un fichier Excel .xlsx de moins de 5 Mo."); return;
    }
    setLoading(true);
    try {
      const sheets = await readXlsxFile(file);
      const memberRows = sheets.find((sheet) => sheet.sheet === "Foyers_Membres")?.data;
      const activityRows = sheets.find((sheet) => sheet.sheet === "Activites")?.data;
      const dueRows = sheets.find((sheet) => sheet.sheet === "Cotisations")?.data;
      if (!memberRows || !activityRows || !dueRows) throw new Error("Les onglets Foyers_Membres, Activites ou Cotisations sont absents.");
      const data: ImportWorkbookData = { fileName: file.name, members: parseMembers(memberRows as Cell[][]),
        activities: parseActivities(activityRows as Cell[][]), contributions: parseContributions(dueRows as Cell[][]) };
      setWorkbookData(data);
      const response = await fetch("/api/office/imports/analyze", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = (await response.json().catch(() => ({}))) as ImportAnalysis & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "L’analyse du fichier a échoué.");
      setAnalysis(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de lire ce fichier.");
    } finally { setLoading(false); }
  }

  async function confirmImport() {
    if (!workbookData || !analysis?.analysisToken || confirmation !== "IMPORTER") return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/office/imports/confirm", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...workbookData, analysisToken: analysis.analysisToken }) });
      const body = (await response.json().catch(() => ({}))) as ImportConfirmation & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "L’import a échoué.");
      setResult(body); setAnalysis(null); setWorkbookData(null); setConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de confirmer l’import.");
    } finally { setLoading(false); }
  }

  return (
    <AppFrame area="office" title="Importer l’historique" subtitle="Réservé à l’administrateur" activePath="/bureau/plus">
      <div className="space-y-4">
        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5"><ShieldCheck className="text-blue-800" /><h2 className="mt-3 font-black text-blue-950">Aucun écrasement automatique</h2><p className="mt-1 text-sm text-blue-800">Le fichier est contrôlé, puis un aperçu affiche les nouvelles lignes, les doublons et les erreurs.</p></section>
        <a href="/Modele-import-AADM.xlsx" download className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-700 bg-white px-4 font-extrabold text-blue-800"><Download size={19} /> Télécharger le modèle Excel AADM</a>
        <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-white p-7 text-center"><Upload className="mx-auto text-slate-500" /><span className="mt-3 block font-extrabold">Choisir le fichier rempli</span><span className="mt-1 block text-xs text-slate-500">Format .xlsx · maximum 5 Mo</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void chooseFile(event)} className="sr-only" /></label>
        {fileName ? <p className="flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-sm font-bold"><FileSpreadsheet size={18} /> {fileName}</p> : null}
        {loading ? <p className="rounded-xl bg-blue-50 p-4 text-center text-sm font-bold text-blue-800">Contrôle sécurisé en cours…</p> : null}
        {error ? <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="mt-0.5 shrink-0" size={18} /> {error}</p> : null}
        {result ? <section className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center"><CheckCircle2 className="mx-auto text-green-700" size={44} /><h2 className="mt-3 text-xl font-black text-green-950">Import terminé</h2><p className="mt-2 text-sm text-green-800">{result.message}</p><p className="mt-3 text-sm font-bold">{result.summary.newHouseholds} foyers · {result.summary.newMembers} membres · {result.summary.newActivities} périodes d’activité · {result.summary.newContributions} cotisations</p></section> : null}
        {analysis ? <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Aperçu avant import</p><h2 className="mt-1 text-xl font-black">{analysis.canConfirm ? "Fichier prêt à confirmer" : "Corrections nécessaires"}</h2></div><div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4"><Summary value={analysis.summary.newHouseholds} label="Foyers" /><Summary value={analysis.summary.newMembers} label="Membres" /><Summary value={analysis.summary.newActivities} label="Activités" /><Summary value={analysis.summary.newContributions} label="Cotisations" /></div>{analysis.warnings.length ? <IssueList title={`${analysis.warnings.length} avertissement(s)`} issues={analysis.warnings} tone="orange" /> : null}{analysis.errors.length ? <IssueList title={`${analysis.errors.length} erreur(s)`} issues={analysis.errors} tone="red" /> : null}{analysis.canConfirm ? <div className="rounded-xl border border-red-200 bg-red-50 p-4"><label className="block text-sm font-bold text-red-950">Pour confirmer, écrivez IMPORTER<input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} className="mt-2 w-full rounded-xl border border-red-300 bg-white px-3 py-3 font-black tracking-wide" /></label><button type="button" onClick={() => void confirmImport()} disabled={loading || confirmation !== "IMPORTER"} className="mt-3 min-h-12 w-full rounded-xl bg-red-700 px-4 font-extrabold text-white disabled:opacity-40">Confirmer l’import définitif</button></div> : null}</section> : null}
      </div>
    </AppFrame>
  );
}

function Summary({ value, label }: { value: number; label: string }) {
  return <div className="rounded-xl bg-blue-50 p-3"><p className="text-xl font-black text-blue-950">{value}</p><p className="text-[10px] font-bold text-blue-800">{label}</p></div>;
}

function IssueList({ title, issues, tone }: { title: string; issues: ImportAnalysis["errors"]; tone: "orange" | "red" }) {
  return <div className={`rounded-xl border p-4 ${tone === "red" ? "border-red-200 bg-red-50 text-red-900" : "border-orange-200 bg-orange-50 text-orange-900"}`}><p className="font-black">{title}</p><ul className="mt-2 space-y-2 text-xs">{issues.slice(0, 20).map((issue, index) => <li key={`${issue.sheet}-${issue.rowNumber}-${index}`}>• {issue.sheet}{issue.rowNumber ? `, ligne ${issue.rowNumber}` : ""} : {issue.message}</li>)}</ul>{issues.length > 20 ? <p className="mt-2 text-xs font-bold">Corrigez les premières erreurs puis analysez de nouveau.</p> : null}</div>;
}
