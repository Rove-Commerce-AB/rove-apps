import { formatWorkHours } from "@/lib/workTime";
import {
  formatWorkEstimatePair,
  workEstimateComparesToLogged,
  type WorkEstimateUnit,
} from "@/lib/workEstimate";
import type { BillingCurrency } from "@/lib/currency";
import {
  hasWorkTimeToShow,
  workTimeBarPercents,
} from "@/lib/workTime";

type Props = {
  estimateHours: number | null;
  loggedHours: number;
  estimateUnit?: WorkEstimateUnit;
  billingCurrency?: BillingCurrency;
  size?: "card" | "drawer";
};

export function WorkTimeGraph({
  estimateHours,
  loggedHours,
  estimateUnit = "hours",
  billingCurrency = "SEK",
  size = "card",
}: Props) {
  const compares = workEstimateComparesToLogged(estimateUnit);
  const estimateForBar = compares ? estimateHours : null;
  const hasLogged = loggedHours > 0;
  const hasEstimate =
    estimateHours != null && estimateHours > 0 && compares;

  if (size === "card") {
    if (!hasLogged && !hasEstimate) return null;
  } else if (!hasWorkTimeToShow(estimateForBar, loggedHours)) {
    return null;
  }

  const { loggedPct, estimatePct, over } = workTimeBarPercents(
    loggedHours,
    estimateForBar
  );
  const pair = compares
    ? formatWorkEstimatePair(
        loggedHours,
        estimateHours,
        estimateUnit,
        billingCurrency
      )
    : formatWorkHours(loggedHours);
  const loggedFill = over ? "bg-warning" : "bg-brand-signal";

  if (size === "card") {
    return (
      <div
        className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
        title={compares ? `Logged ${pair}` : `Logged ${pair}`}
        aria-label={compares ? `Logged ${pair}` : `Logged ${pair}`}
      >
        <WorkTimeBar
          estimatePct={estimatePct}
          loggedPct={loggedPct}
          loggedFill={loggedFill}
          showEstimateTrack={hasEstimate}
        />
      </div>
    );
  }

  return (
    <div className="relative h-1 overflow-hidden rounded-full bg-bg-muted" title={pair}>
      <WorkTimeBar
        estimatePct={estimatePct}
        loggedPct={loggedPct}
        loggedFill={loggedFill}
        showEstimateTrack={false}
      />
    </div>
  );
}

function WorkTimeBar({
  estimatePct,
  loggedPct,
  loggedFill,
  showEstimateTrack,
}: {
  estimatePct: number;
  loggedPct: number;
  loggedFill: string;
  showEstimateTrack: boolean;
}) {
  return (
    <>
      {showEstimateTrack ? (
        <span
          className="absolute inset-y-0 left-0 bg-border-subtle"
          style={{ width: `${estimatePct}%` }}
          aria-hidden
        />
      ) : null}
      <span
        className={`absolute inset-y-0 left-0 ${loggedFill}`}
        style={{ width: `${loggedPct}%` }}
        aria-hidden
      />
    </>
  );
}
