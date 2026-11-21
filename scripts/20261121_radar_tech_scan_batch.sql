-- Tech scan batch size: chunk size for nightly looping (not "per night" cap).
-- ~100 domains ≈ a few minutes at observed throughput; worker loops until
-- backlog is clear or RADAR_WORKER_BUDGET_MS (~12 min) is reached.
UPDATE radar_job_configs
SET max_items_per_run = 100
WHERE job_type = 'tech_scan'
  AND max_items_per_run < 100;
