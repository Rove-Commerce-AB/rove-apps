import { describe, expect, it } from "vitest";
import type { Monitor } from "./monitors";
import {
  buildMonitorGroups,
  defaultExpandedGroupIds,
  monitorTone,
  toPublicMonitor,
} from "./monitorStatus";

function monitor(partial: Partial<Monitor> & Pick<Monitor, "id" | "customer_id">): Monitor {
  return {
    customer_name_snapshot: "Acme",
    name: "Site",
    url: "https://example.com",
    enabled: true,
    interval_seconds: 60,
    retry_delay_seconds: null,
    timeout_ms: 10000,
    expected_status_min: 200,
    expected_status_max: 299,
    auth_secret_ref: "secret",
    next_due_at: new Date().toISOString(),
    status: "up",
    last_checked_at: null,
    active_incident: false,
    slack_notification_ids: ["n1"],
    ...partial,
  };
}

describe("monitorTone", () => {
  it("maps enabled/status", () => {
    expect(monitorTone(monitor({ id: "1", customer_id: "c", enabled: false }))).toBe(
      "paused"
    );
    expect(
      monitorTone(monitor({ id: "1", customer_id: "c", status: "down" }))
    ).toBe("down");
    expect(monitorTone(monitor({ id: "1", customer_id: "c", status: "up" }))).toBe(
      "operational"
    );
  });
});

describe("toPublicMonitor", () => {
  it("strips secrets and slack ids", () => {
    const publicMonitor = toPublicMonitor(
      monitor({ id: "1", customer_id: "c" })
    );
    expect(publicMonitor.auth_secret_ref).toBeNull();
    expect(publicMonitor.slack_notification_ids).toEqual([]);
  });
});

describe("defaultExpandedGroupIds", () => {
  it("expands single group and down groups", () => {
    const groups = buildMonitorGroups([
      monitor({
        id: "1",
        customer_id: "c1",
        customer_name_snapshot: "A",
        status: "down",
      }),
      monitor({
        id: "2",
        customer_id: "c2",
        customer_name_snapshot: "B",
        status: "up",
      }),
    ]);
    expect([...defaultExpandedGroupIds(groups)]).toEqual(["c1"]);
    expect([...defaultExpandedGroupIds(groups.slice(0, 1))]).toEqual(["c1"]);
  });
});
