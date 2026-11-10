import type { Monitor } from "@/lib/monitors";
import { compareTextSv } from "@/lib/sort";

export type MonitorTone = "operational" | "down" | "paused" | "unknown";

export type MonitorGroup = {
  customerId: string;
  customerName: string;
  monitors: Monitor[];
  operationalCount: number;
  downCount: number;
  pausedCount: number;
  unknownCount: number;
};

export function monitorTone(monitor: Monitor): MonitorTone {
  if (!monitor.enabled) return "paused";
  if (monitor.status === "down") return "down";
  if (monitor.status === "up") return "operational";
  return "unknown";
}

export function statusLabel(tone: MonitorTone): string {
  switch (tone) {
    case "operational":
      return "Operational";
    case "down":
      return "Down";
    case "paused":
      return "Paused";
    case "unknown":
      return "Unknown";
  }
}

export function statusClass(tone: MonitorTone): string {
  switch (tone) {
    case "operational":
      return "text-status-success";
    case "down":
      return "text-danger";
    case "paused":
      return "text-status-warning";
    case "unknown":
      return "text-text-secondary";
  }
}

export function formatCheckedAt(iso: string | null): string {
  if (!iso) return "Not checked yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Not checked yet";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `Checked ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "Checked 1 min ago" : `Checked ${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "Checked 1 hour ago" : `Checked ${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "Checked 1 day ago" : `Checked ${days} days ago`;
}

/** Strip fields customers should not receive over the wire. */
export function toPublicMonitor(monitor: Monitor): Monitor {
  return {
    ...monitor,
    auth_secret_ref: null,
    slack_notification_ids: [],
  };
}

export function buildMonitorGroups(monitors: Monitor[]): MonitorGroup[] {
  const byCustomer = new Map<string, MonitorGroup>();
  for (const monitor of monitors) {
    const existing = byCustomer.get(monitor.customer_id);
    if (existing) {
      existing.monitors.push(monitor);
    } else {
      byCustomer.set(monitor.customer_id, {
        customerId: monitor.customer_id,
        customerName: monitor.customer_name_snapshot,
        monitors: [monitor],
        operationalCount: 0,
        downCount: 0,
        pausedCount: 0,
        unknownCount: 0,
      });
    }
  }

  return [...byCustomer.values()]
    .map((group) => {
      let operationalCount = 0;
      let downCount = 0;
      let pausedCount = 0;
      let unknownCount = 0;
      for (const monitor of group.monitors) {
        const tone = monitorTone(monitor);
        if (tone === "operational") operationalCount += 1;
        else if (tone === "down") downCount += 1;
        else if (tone === "paused") pausedCount += 1;
        else unknownCount += 1;
      }
      group.monitors.sort(
        (a, b) =>
          compareTextSv(a.name, b.name) || compareTextSv(a.url, b.url)
      );
      return {
        ...group,
        operationalCount,
        downCount,
        pausedCount,
        unknownCount,
      };
    })
    .sort((a, b) => {
      const rank = (group: MonitorGroup) =>
        group.downCount > 0
          ? 0
          : group.unknownCount > 0 || group.pausedCount > 0
            ? 1
            : 2;
      return (
        rank(a) - rank(b) || compareTextSv(a.customerName, b.customerName)
      );
    });
}

/** Default expand: single group, or any group with downtime. */
export function defaultExpandedGroupIds(groups: MonitorGroup[]): Set<string> {
  if (groups.length <= 1) {
    return new Set(groups.map((group) => group.customerId));
  }
  return new Set(
    groups
      .filter((group) => group.downCount > 0)
      .map((group) => group.customerId)
  );
}
