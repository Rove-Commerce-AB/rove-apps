-- BigQuery additive migration for monitoring history in Rove Apps.
-- Run in europe-north2 before deploying a worker that emits these fields.
-- checked_at and scheduled_at remain UTC TIMESTAMP values. probe_timezone
-- names the IANA time zone at the location where the HTTP request originated.

ALTER TABLE `continual-mind-442414-e0.monitoring_history.heartbeats`
  ADD COLUMN IF NOT EXISTS probe_provider STRING;

ALTER TABLE `continual-mind-442414-e0.monitoring_history.heartbeats`
  ADD COLUMN IF NOT EXISTS probe_region STRING;

ALTER TABLE `continual-mind-442414-e0.monitoring_history.heartbeats`
  ADD COLUMN IF NOT EXISTS probe_timezone STRING;
