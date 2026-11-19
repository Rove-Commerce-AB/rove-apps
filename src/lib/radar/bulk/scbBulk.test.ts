import { describe, expect, it } from "vitest";
import {
  organizationNumberFromPeOrgNr,
  parseScbDataLine,
} from "@/lib/radar/bulk/scbBulk";
import { parseBolagsverketDataLine } from "@/lib/radar/bulk/bolagsverketBulk";
import { countyFromPostort } from "@/lib/radar/bulk/postortToCounty";

describe("organizationNumberFromPeOrgNr", () => {
  it("strips 16 prefix", () => {
    expect(organizationNumberFromPeOrgNr("165568645914")).toBe("5568645914");
  });
});

describe("parseScbDataLine", () => {
  it("parses AB with SNI", () => {
    const header =
      "ForAndrTyp\tCOAdress\tForetagsnamn\tFtgStat\tGatuadress\tJEStat\tJurForm\tNamn\tNg1\tNg2\tNg3\tNg4\tNg5\tPeOrgNr\tPostNr\tPostOrt\tRegDatKtid\tReklamsparrtyp";
    const headers = header.split("\t");
    const headerIndex = new Map(headers.map((h, i) => [h, i]));
    const line =
      "1\t5568645914\t\t1\tBOX 2820\t1\t49\tRethink AB\t70200\t\t\t\t\t165568645914\t40320\tGÖTEBORG\t20110915\t1";
    const parsed = parseScbDataLine(line, headerIndex);
    expect(parsed?.organization_number).toBe("5568645914");
    expect(parsed?.name).toBe("Rethink AB");
    expect(parsed?.primary_sni).toBe("70200");
    expect(parsed?.county).toBe("Västra Götaland");
  });
});

describe("parseBolagsverketDataLine", () => {
  it("parses coded orgnr and name", () => {
    const header =
      "organisationsidentitet;namnskyddslopnummer;registreringsland;organisationsnamn;organisationsform;avregistreringsdatum;avregistreringsorsak;pagandeAvvecklingsEllerOmstruktureringsforfarande;registreringsdatum;verksamhetsbeskrivning;postadress";
    const headers = header.split(";");
    const headerIndex = new Map(headers.map((h, i) => [h, i]));
    const line =
      '"5568645914$ORGNR-IDORG";"1";"SE-LAND";"Rethink AB$FORETAGSNAMN-ORGNAM$2011-09-15";"AB-ORGFO";"";"";"";"2011-09-15";"Konsult.";"Box 2820$$GÖTEBORG$40320$SE-LAND"';
    const parsed = parseBolagsverketDataLine(line, headerIndex);
    expect(parsed?.organization_number).toBe("5568645914");
    expect(parsed?.name).toBe("Rethink AB");
    expect(parsed?.deregistered).toBe(false);
    expect(parsed?.postort).toBe("GÖTEBORG");
  });

  it("flags deregistered", () => {
    const header =
      "organisationsidentitet;namnskyddslopnummer;registreringsland;organisationsnamn;organisationsform;avregistreringsdatum;avregistreringsorsak;pagandeAvvecklingsEllerOmstruktureringsforfarande;registreringsdatum;verksamhetsbeskrivning;postadress";
    const headers = header.split(";");
    const headerIndex = new Map(headers.map((h, i) => [h, i]));
    const line =
      '"8888006577$ORGNR-IDORG";"1";"SE-LAND";"Stiftelsen X$FORETAGSNAMN-ORGNAM$1993-03-15";"S-ORGFO";"1998-05-07";"VERKUPP-AVORG";"";"1993-03-15";"Secondhand.";"Storgatan 100$$SOLLEFTEÅ$88140$SE-LAND"';
    const parsed = parseBolagsverketDataLine(line, headerIndex);
    expect(parsed?.deregistered).toBe(true);
  });
});

describe("countyFromPostort", () => {
  it("maps major cities", () => {
    expect(countyFromPostort("MALMÖ")).toBe("Skåne");
    expect(countyFromPostort("Stockholm")).toBe("Stockholm");
  });
});
