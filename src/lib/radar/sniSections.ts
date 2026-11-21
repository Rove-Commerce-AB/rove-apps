import sni2007DetailLabels from "@/lib/radar/data/sni2007DetailLabels.json";

/** SNI 2007 two-digit divisions (huvudgrupper) for audience filters. */
export type SniSection = {
  code: string;
  label: string;
};

const SNI_DETAIL_LABELS = sni2007DetailLabels as Record<string, string>;

/** Official SNI 2007 huvudgrupp labels (Swedish, SCB). */
export const SNI_SECTIONS: readonly SniSection[] = [
  { code: "01", label: "Jordbruk och jakt samt service i anslutning härtill" },
  { code: "02", label: "Skogsbruk" },
  { code: "03", label: "Fiske och vattenbruk" },
  { code: "05", label: "Kolutvinning" },
  { code: "06", label: "Utvinning av råpetroleum och naturgas" },
  { code: "07", label: "Utvinning av metallmalmer" },
  { code: "08", label: "Annan utvinning av mineral" },
  { code: "09", label: "Service till utvinning" },
  { code: "10", label: "Livsmedelsframställning" },
  { code: "11", label: "Framställning av drycker" },
  { code: "12", label: "Tobaksvarutillverkning" },
  { code: "13", label: "Textilvarutillverkning" },
  { code: "14", label: "Tillverkning av kläder" },
  {
    code: "15",
    label: "Tillverkning av läder, läder- och skinnvaror m.m.",
  },
  {
    code: "16",
    label: "Tillverkning av trä och varor av trä; kork, rotting o.d. utom möbler",
  },
  { code: "17", label: "Pappers- och pappersvarutillverkning" },
  {
    code: "18",
    label: "Grafisk produktion och reproduktion av inspelningar",
  },
  {
    code: "19",
    label: "Tillverkning av stenkolsprodukter och raffinerade petroleumprodukter",
  },
  { code: "20", label: "Tillverkning av kemikalier och kemiska produkter" },
  {
    code: "21",
    label: "Tillverkning av farmaceutiska basprodukter och läkemedel",
  },
  { code: "22", label: "Tillverkning av gummi- och plastvaror" },
  {
    code: "23",
    label: "Tillverkning av andra icke-metalliska mineraliska produkter",
  },
  { code: "24", label: "Stål- och metallframställning" },
  {
    code: "25",
    label: "Tillverkning av metallvaror utom maskiner och apparater",
  },
  { code: "26", label: "Tillverkning av datorer, elektronikvaror och optik" },
  { code: "27", label: "Tillverkning av elapparatur" },
  { code: "28", label: "Tillverkning av övriga maskiner" },
  {
    code: "29",
    label: "Tillverkning av motorfordon, släpfordon och påhängsvagnar",
  },
  { code: "30", label: "Tillverkning av andra transportmedel" },
  { code: "31", label: "Tillverkning av möbler" },
  { code: "32", label: "Annan tillverkning" },
  { code: "33", label: "Reparation och installation av maskiner och apparater" },
  { code: "35", label: "Försörjning av el, gas, värme och kyla" },
  { code: "36", label: "Vattenförsörjning" },
  { code: "37", label: "Avloppsrening" },
  { code: "38", label: "Avfallshantering; återvinning" },
  {
    code: "39",
    label:
      "Sanering, efterbehandling av jord och vatten samt annan verksamhet för föroreningsbekämpning",
  },
  { code: "41", label: "Byggande av hus" },
  { code: "42", label: "Anläggningsarbeten" },
  { code: "43", label: "Specialiserad bygg- och anläggningsverksamhet" },
  {
    code: "45",
    label: "Handel samt reparation av motorfordon och motorcyklar",
  },
  {
    code: "46",
    label: "Parti- och provisionshandel utom med motorfordon",
  },
  {
    code: "47",
    label: "Detaljhandel utom med motorfordon och motorcyklar",
  },
  { code: "49", label: "Landtransport; transport i rörsystem" },
  { code: "50", label: "Sjötransport" },
  { code: "51", label: "Lufttransport" },
  { code: "52", label: "Magasinering och stödtjänster till transport" },
  { code: "53", label: "Post- och kurirverksamhet" },
  { code: "55", label: "Hotell- och logiverksamhet" },
  { code: "56", label: "Restaurang-, catering- och barverksamhet" },
  { code: "58", label: "Förlagsverksamhet" },
  {
    code: "59",
    label:
      "Film-, video- och tv-programverksamhet, ljudinspelningar och fonogramutgivning",
  },
  { code: "60", label: "Planering och sändning av program" },
  { code: "61", label: "Telekommunikation" },
  { code: "62", label: "Dataprogrammering, datakonsultverksamhet o.d." },
  { code: "63", label: "Informationstjänster" },
  {
    code: "64",
    label: "Finansiella tjänster utom försäkring och pensionsfondsverksamhet",
  },
  {
    code: "65",
    label:
      "Försäkring, återförsäkring och pensionsfondsverksamhet utom obligatorisk socialförsäkring",
  },
  {
    code: "66",
    label: "Stödtjänster till finansiella tjänster och försäkring",
  },
  { code: "68", label: "Fastighetsverksamhet" },
  { code: "69", label: "Juridisk och ekonomisk konsultverksamhet" },
  {
    code: "70",
    label: "Verksamheter som utövas av huvudkontor; konsulttjänster till företag",
  },
  {
    code: "71",
    label:
      "Arkitekt- och teknisk konsultverksamhet; teknisk provning och analys",
  },
  { code: "72", label: "Vetenskaplig forskning och utveckling" },
  { code: "73", label: "Reklam och marknadsundersökning" },
  {
    code: "74",
    label: "Annan verksamhet inom juridik, ekonomi, vetenskap och teknik",
  },
  { code: "75", label: "Veterinärverksamhet" },
  { code: "77", label: "Uthyrning och leasing" },
  {
    code: "78",
    label: "Arbetsförmedling, bemanning och andra personalrelaterade tjänster",
  },
  {
    code: "79",
    label:
      "Resebyrå- och researrangörsverksamhet och andra resetjänster och relaterade tjänster",
  },
  { code: "80", label: "Säkerhets- och bevakningsverksamhet" },
  {
    code: "81",
    label: "Fastighetsservice samt skötsel och underhåll av grönytor",
  },
  { code: "82", label: "Kontorstjänster och andra företagstjänster" },
  {
    code: "84",
    label: "Offentlig förvaltning och försvar; obligatorisk socialförsäkring",
  },
  { code: "85", label: "Utbildning" },
  { code: "86", label: "Hälso- och sjukvård" },
  { code: "87", label: "Vård och omsorg med boende" },
  { code: "88", label: "Öppna sociala insatser" },
  {
    code: "90",
    label: "Konstnärlig och kulturell verksamhet samt underhållningsverksamhet",
  },
  { code: "91", label: "Biblioteks-, arkiv- och museiverksamhet m.m." },
  { code: "92", label: "Spel- och vadhållningsverksamhet" },
  { code: "93", label: "Sport-, fritids- och nöjesverksamhet" },
  { code: "94", label: "Intressebevakning; religiös verksamhet" },
  {
    code: "95",
    label: "Reparation av datorer, hushållsartiklar och personliga artiklar",
  },
  { code: "96", label: "Andra konsumenttjänster" },
  { code: "97", label: "Förvärvsarbete i hushåll" },
  {
    code: "98",
    label: "Hushållens produktion av diverse varor och tjänster för eget bruk",
  },
  {
    code: "99",
    label:
      "Verksamhet vid internationella organisationer, utländska ambassader o.d.",
  },
] as const;

export function formatSniSectionLabel(section: SniSection): string {
  return `${section.code} – ${section.label}`;
}

/** Digits-only SNI code (drops dots/spaces). */
export function normalizeSniCode(
  sniCode: string | null | undefined
): string | null {
  if (!sniCode) return null;
  const digits = sniCode.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/** Two-digit SNI division from a full code (e.g. 46630 → 46). */
export function sniDivisionCode(
  sniCode: string | null | undefined
): string | null {
  const digits = normalizeSniCode(sniCode);
  if (!digits || digits.length < 2) return null;
  return digits.slice(0, 2);
}

export function sniSectionByCode(
  code: string | null | undefined
): SniSection | null {
  if (!code) return null;
  return SNI_SECTIONS.find((s) => s.code === code) ?? null;
}

/** Official SNI 2007 detaljgrupp label (Swedish), if known. */
export function sniDetailLabel(
  sniCode: string | null | undefined
): string | null {
  const digits = normalizeSniCode(sniCode);
  if (!digits) return null;
  return SNI_DETAIL_LABELS[digits] ?? null;
}

/**
 * Prefer an existing description; otherwise resolve from the SNI 2007 detail map.
 */
export function resolveSniDescription(
  sniCode: string | null | undefined,
  existingDescription?: string | null
): string | null {
  const existing = existingDescription?.trim() || null;
  if (existing) return existing;
  return sniDetailLabel(sniCode);
}

/**
 * Human-readable SNI line for lists:
 * official detaljgrupp (SV) → stored description → division label (SV).
 */
export function formatSniDisplay(input: {
  sni_code: string | null;
  sni_description: string | null;
}): { code: string | null; label: string | null } {
  const code = input.sni_code?.trim() || null;
  if (!code) return { code: null, label: null };
  const label =
    sniDetailLabel(code) ??
    (input.sni_description?.trim() || null) ??
    sniSectionByCode(sniDivisionCode(code))?.label ??
    null;
  return { code, label };
}

/** Swedish counties for audience geography filters. */
export const SWEDEN_COUNTIES: readonly string[] = [
  "Blekinge",
  "Dalarna",
  "Gotland",
  "Gävleborg",
  "Halland",
  "Jämtland",
  "Jönköping",
  "Kalmar",
  "Kronoberg",
  "Norrbotten",
  "Skåne",
  "Stockholm",
  "Södermanland",
  "Uppsala",
  "Värmland",
  "Västerbotten",
  "Västernorrland",
  "Västmanland",
  "Västra Götaland",
  "Örebro",
  "Östergötland",
] as const;
