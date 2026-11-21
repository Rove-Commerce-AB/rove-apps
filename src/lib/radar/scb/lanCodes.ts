/** Radar county labels → SCB länskod (säteslän). */
export const COUNTY_TO_LAN_KOD: Record<string, string> = {
  Stockholm: "01",
  Uppsala: "03",
  Södermanland: "04",
  Östergötland: "05",
  Jönköping: "06",
  Kronoberg: "07",
  Kalmar: "08",
  Gotland: "09",
  Blekinge: "10",
  Skåne: "12",
  Halland: "13",
  "Västra Götaland": "14",
  Värmland: "17",
  Örebro: "18",
  Västmanland: "19",
  Dalarna: "20",
  Gävleborg: "21",
  Västernorrland: "22",
  Jämtland: "23",
  Västerbotten: "24",
  Norrbotten: "25",
};

const LAN_KOD_TO_COUNTY = Object.fromEntries(
  Object.entries(COUNTY_TO_LAN_KOD).map(([county, kod]) => [kod, county])
) as Record<string, string>;

export function lanKodForCounty(county: string): string | null {
  return COUNTY_TO_LAN_KOD[county] ?? null;
}

export function countyForLanKod(lanKod: string | null | undefined): string | null {
  if (!lanKod) return null;
  return LAN_KOD_TO_COUNTY[lanKod] ?? null;
}
