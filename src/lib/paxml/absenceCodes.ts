/** PAXml tidkoder used for absence export (subset of the 1.0 schema). */
export const ABSENCE_CODE_OPTIONS = [
  { value: "SEM", label: "Vacation (SEM)" },
  { value: "SEM_OBE", label: "Unpaid vacation (SEM_OBE)" },
  { value: "SJK", label: "Sick leave (SJK)" },
  { value: "VAB", label: "Care of child (VAB)" },
  { value: "FPE", label: "Parental leave (FPE)" },
  { value: "KOM", label: "Compensatory leave (KOM)" },
  { value: "PEM", label: "Unpaid leave (PEM)" },
  { value: "HAV", label: "Pregnancy leave (HAV)" },
  { value: "SMB", label: "Swedish military service (SMB)" },
  { value: "UTB", label: "Training (UTB)" },
  { value: "PER", label: "Permission (PER)" },
] as const;

export type AbsenceCode = (typeof ABSENCE_CODE_OPTIONS)[number]["value"];

const ABSENCE_CODE_SET = new Set<string>(
  ABSENCE_CODE_OPTIONS.map((option) => option.value)
);

export function isAbsenceCode(value: string | null | undefined): value is AbsenceCode {
  return value != null && ABSENCE_CODE_SET.has(value);
}

export function absenceCodeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const match = ABSENCE_CODE_OPTIONS.find((option) => option.value === code);
  return match?.label ?? code;
}
