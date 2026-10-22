import ExcelJS from "exceljs";
import type { IncidentPage } from "@/lib/monitorIncidents";

const stockholmFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Stockholm",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Excel stores wall-clock dates without a time zone. Keep the displayed time in Stockholm. */
function excelDate(iso: string | null): Date | null {
  if (!iso) return null;
  const parts = stockholmFormat.formatToParts(new Date(iso));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(
    value("year"), value("month") - 1, value("day"), value("hour"), value("minute")
  ));
}

export async function buildMonitorIncidentWorkbook(data: IncidentPage): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rove Planner";
  workbook.subject = `${data.monitor.name}: ${data.filters.from} – ${data.filters.to}`;
  const sheet = workbook.addWorksheet("Incidents", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Status", key: "status", width: 17 },
    { header: "Started", key: "started", width: 22 },
    { header: "Confirmed", key: "confirmed", width: 22 },
    { header: "Last failure", key: "lastFailure", width: 22 },
    { header: "Recovered", key: "recovered", width: 22 },
    { header: "Failures", key: "failures", width: 13 },
    { header: "Downtime (min)", key: "downtime", width: 19 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18324D" } };
  header.height = 24;

  for (const incident of data.incidents) {
    sheet.addRow({
      status: incident.recoveredAt ? "Recovered" : "Open",
      started: excelDate(incident.startedAt),
      confirmed: excelDate(incident.confirmedAt),
      lastFailure: excelDate(incident.lastFailureAt),
      recovered: excelDate(incident.recoveredAt),
      failures: incident.failureCount,
      downtime: incident.downtimeMinutes,
    });
  }

  for (const key of ["started", "confirmed", "lastFailure", "recovered"]) {
    sheet.getColumn(key).numFmt = "yyyy-mm-dd hh:mm";
  }
  sheet.getColumn("downtime").numFmt = "0.0";
  if (data.incidents.length) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: data.incidents.length + 1, column: 7 },
    };
  }

  const total = sheet.addRow(["Total downtime (all incidents in period)", null, null, null, null, null, data.totalDowntimeMinutes]);
  total.font = { bold: true };
  total.getCell(7).numFmt = "0.0";
  total.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F5" } };
  });

  const output = await workbook.xlsx.writeBuffer();
  return new Uint8Array(output);
}
