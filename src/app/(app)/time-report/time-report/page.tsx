import { getConsultantForCurrentUser } from "@/lib/consultants";
import { getCustomerIdsForConsultant } from "@/lib/customerConsultants";
import { getCustomersByIds, getInternalCustomerId } from "@/lib/customers";
import { getCurrentCalendarYearMonth, getCurrentYearWeek } from "@/lib/dateUtils";
import { PageHeader } from "@/components/ui";
import { TimeReportWithColumnHighlight } from "../TimeReportWithColumnHighlight";
import { getHolidayDatesForWeek } from "../actions";

export const dynamic = "force-dynamic";

export default async function TimeReportPage() {
  const consultant = await getConsultantForCurrentUser();
  const { year: initialYear, week: initialWeek } = getCurrentYearWeek();
  const { year: initialDisplayYear, month: initialDisplayMonth } =
    getCurrentCalendarYearMonth();
  const [rawCustomerIds, initialHolidayDates] = consultant
    ? await Promise.all([
        getCustomerIdsForConsultant(consultant.id),
        consultant.calendar_id != null
          ? getHolidayDatesForWeek(
              consultant.calendar_id,
              initialYear,
              initialWeek
            )
          : Promise.resolve([] as string[]),
      ])
    : [[], [] as string[]];

  let customerIds = rawCustomerIds;
  if (consultant?.isExternal) {
    const internalCustomerId = await getInternalCustomerId();
    if (internalCustomerId) {
      customerIds = customerIds.filter((id) => id !== internalCustomerId);
    }
  }

  const customers = await getCustomersByIds(customerIds);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Time report" className="mb-4 shrink-0" />
      <TimeReportWithColumnHighlight
        consultant={consultant}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color ?? undefined,
        }))}
        initialYear={initialYear}
        initialWeek={initialWeek}
        initialDisplayYear={initialDisplayYear}
        initialDisplayMonth={initialDisplayMonth}
        calendarId={consultant?.calendar_id ?? null}
        initialHolidayDates={initialHolidayDates}
      />
    </div>
  );
}
