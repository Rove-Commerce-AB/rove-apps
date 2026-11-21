-- Incremental SCB import: raise company_import batch size (cursor lives in settings JSON).
UPDATE radar_job_configs
SET max_items_per_run = 5000
WHERE job_type = 'company_import'
  AND max_items_per_run <= 100;
