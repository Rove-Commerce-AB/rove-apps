-- Reference DDL for the read-only, row-for-row Kuma heartbeat statistics archive.
-- Already created in Rove Apps BigQuery on 2026-10-21. Do not load Kuma's
-- response bodies or raw message text: either may contain credentials.
-- This table is separate from canonical monitoring_history.heartbeats, so
-- overlapping DigitalOcean and Google Cloud checks cannot double uptime totals.
CREATE TABLE IF NOT EXISTS `continual-mind-442414-e0.monitoring_history.kuma_source_heartbeats` (
  source_heartbeat_id INT64 NOT NULL,
  source_monitor_id INT64 NOT NULL,
  important BOOL,
  status INT64,
  checked_at TIMESTAMP NOT NULL,
  ping_ms INT64,
  duration INT64,
  down_count INT64,
  end_time TIMESTAMP,
  retries INT64,
  message_sha256 STRING,
  response_sha256 STRING,
  response_bytes INT64,
  probe_provider STRING,
  probe_region STRING,
  probe_timezone STRING
)
PARTITION BY TIMESTAMP_TRUNC(checked_at, MONTH)
CLUSTER BY source_monitor_id
OPTIONS (description = 'Kuma heartbeat statistics archive; excludes Jeeves and raw HTTP response or message text');

-- Snapshot verification (2026-10-21 15:17:56.774 UTC):
-- row_count = unique_ids = 68,281; group_rows = 5,458; jeeves_rows = 0.
-- The source app remains live; new Kuma rows are not synchronized automatically.
SELECT
  COUNT(*) AS row_count,
  COUNT(DISTINCT source_heartbeat_id) AS unique_ids,
  COUNTIF(source_monitor_id IN (22, 23)) AS group_rows,
  COUNTIF(source_monitor_id = 30) AS jeeves_rows,
  MAX(checked_at) AS last_utc
FROM `continual-mind-442414-e0.monitoring_history.kuma_source_heartbeats`;
