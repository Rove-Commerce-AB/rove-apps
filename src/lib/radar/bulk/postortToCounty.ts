/**
 * Best-effort PostOrt → län for SCB bulk audience filters.
 * Incomplete by design; unmatched rows fail county filters (safe default).
 */
const POSTORT_TO_COUNTY: Record<string, string> = {
  STOCKHOLM: "Stockholm",
  HUDDINGE: "Stockholm",
  BOTKYRKA: "Stockholm",
  HANINGE: "Stockholm",
  TYRESÖ: "Stockholm",
  TÄBY: "Stockholm",
  DANDERYD: "Stockholm",
  "DJURSHOLM": "Stockholm",
  SOLLENTUNA: "Stockholm",
  SOLNA: "Stockholm",
  SUNDBYBERG: "Stockholm",
  LIDINGÖ: "Stockholm",
  VÄLLINGBY: "Stockholm",
  SPÅNGA: "Stockholm",
  BROMMA: "Stockholm",
  KISTA: "Stockholm",
  "SALTSJÖ-BOO": "Stockholm",
  NACKA: "Stockholm",
  "ÅKERSBERGA": "Stockholm",
  NORRTÄLJE: "Stockholm",
  SÖDERTÄLJE: "Stockholm",
  UPPLANDS: "Stockholm",
  MÄRSTA: "Stockholm",
  "GÖTEBORG": "Västra Götaland",
  MOLNDAL: "Västra Götaland",
  MÖLNDAL: "Västra Götaland",
  PARTILLE: "Västra Götaland",
  KUNGÄLV: "Västra Götaland",
  KUNGSBACKA: "Halland",
  BORÅS: "Västra Götaland",
  TROLLHÄTTAN: "Västra Götaland",
  UDDEVALLA: "Västra Götaland",
  SKÖVDE: "Västra Götaland",
  LIDKÖPING: "Västra Götaland",
  "VÄNERSBORG": "Västra Götaland",
  ALINGSÅS: "Västra Götaland",
  MALMÖ: "Skåne",
  LUND: "Skåne",
  HELSINGBORG: "Skåne",
  KRISTIANSTAD: "Skåne",
  LANDSKRONA: "Skåne",
  TRELLEBORG: "Skåne",
  YSTAD: "Skåne",
  ÄNGELHOLM: "Skåne",
  HÄSSLEHOLM: "Skåne",
  ESKILSTUNA: "Södermanland",
  NYKÖPING: "Södermanland",
  UPPSALA: "Uppsala",
  ENKÖPING: "Uppsala",
  VÄSTERÅS: "Västmanland",
  ÖREBRO: "Örebro",
  LINKÖPING: "Östergötland",
  NORRKÖPING: "Östergötland",
  JÖNKÖPING: "Jönköping",
  VÄXJÖ: "Kronoberg",
  KALMAR: "Kalmar",
  KARLSTAD: "Värmland",
  GÄVLE: "Gävleborg",
  SUNDSVALL: "Västernorrland",
  "ÖRNSKÖLDSVIK": "Västernorrland",
  "HÄRNÖSAND": "Västernorrland",
  UMEÅ: "Västerbotten",
  SKELLEFTEÅ: "Västerbotten",
  LULEÅ: "Norrbotten",
  KIRUNA: "Norrbotten",
  VISBY: "Gotland",
  FALUN: "Dalarna",
  BORLÄNGE: "Dalarna",
  "ÖSTERSUND": "Jämtland",
  HALMSTAD: "Halland",
  VARBERG: "Halland",
  FALKENBERG: "Halland",
};

export function countyFromPostort(postort: string | null | undefined): string | null {
  if (!postort) return null;
  const key = postort.trim().toUpperCase();
  if (!key) return null;
  if (POSTORT_TO_COUNTY[key]) return POSTORT_TO_COUNTY[key];
  // Prefix match for compounds like "STOCKHOLM-GLOBEN"
  for (const [ort, county] of Object.entries(POSTORT_TO_COUNTY)) {
    if (key.startsWith(ort)) return county;
  }
  return null;
}
