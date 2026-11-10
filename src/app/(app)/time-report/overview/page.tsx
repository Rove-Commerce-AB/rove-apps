import { getCurrentCalendarYearMonth } from "@/lib/dateUtils";
import { getTimeReportSummary } from "@/lib/timeReportSummary";
import { TimeReportSummaryClient } from "../TimeReportSummaryClient";

export const dynamic = "force-dynamic";

export default async function TimeReportOverviewPage() {
  const { year } = getCurrentCalendarYearMonth();
  const initial = await getTimeReportSummary(year);
  return <TimeReportSummaryClient initial={initial} />;
}
