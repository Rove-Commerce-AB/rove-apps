import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/accessGuards", () => ({ assertAdmin: vi.fn() }));
vi.mock("@/lib/cloudSqlPool", () => ({ cloudSqlPool: { query: vi.fn() } }));

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getMonitorIncidentPage } from "./monitorIncidents";

const query = vi.mocked(cloudSqlPool.query);

describe("monitor incident period and export", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00.000Z"));
    query.mockReset();
  });

  it("uses the selected period even when the monitor was created later, and exports every row", async () => {
    const monitorId = "00000000-0000-4000-8000-000000000001";
    const incidents = Array.from({ length: 51 }, (_, index) => ({
      id: `incident-${index}`,
      started_at: new Date("2026-10-21T13:17:00.000Z"),
      confirmed_at: new Date("2026-10-21T13:18:00.000Z"),
      last_failure_at: new Date("2026-10-21T13:35:00.000Z"),
      recovered_at: new Date("2026-10-21T13:35:00.000Z"),
      failure_count: 14,
      downtime_minutes: 18 / 51,
    }));
    query
      .mockResolvedValueOnce({ rows: [{
        id: monitorId, name: "Example", customer_name_snapshot: "Customer",
        url: "https://example.com", created_at: new Date("2026-10-21T12:00:00.000Z"),
      }] } as never)
      .mockResolvedValueOnce({ rows: [{
        start_at: new Date("2026-09-22T22:00:00.000Z"),
        end_at: new Date("2026-10-22T12:00:00.000Z"),
      }] } as never)
      .mockResolvedValueOnce({ rows: [{ total: "51", downtime_minutes: 18 }] } as never)
      .mockResolvedValueOnce({ rows: incidents } as never);

    const result = await getMonitorIncidentPage(monitorId, {
      from: "2026-09-23", to: "2026-10-22",
    }, 1, true);

    expect(result?.incidents).toHaveLength(51);
    expect(result?.uptimePercent).toBeGreaterThan(99.95);
    expect(query.mock.calls[1][0]).not.toContain("GREATEST");
    expect(query.mock.calls[1][1]).toEqual(["2026-09-23", "2026-10-22", "2026-10-22T12:00:00.000Z"]);
    expect(query.mock.calls[3][0]).not.toContain("LIMIT");
    vi.useRealTimers();
  });
});
