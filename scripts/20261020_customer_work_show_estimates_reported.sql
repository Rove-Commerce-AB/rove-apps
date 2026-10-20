-- Split Work time visibility for customer-role users into estimates vs reported time.
-- Existing Visible setting copies into both new columns.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS work_show_estimates_to_customer_users boolean NOT NULL DEFAULT false;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS work_show_reported_time_to_customer_users boolean NOT NULL DEFAULT false;

UPDATE customers
SET work_show_estimates_to_customer_users = true
WHERE work_show_time_to_customer_users = true
  AND work_show_estimates_to_customer_users = false;

UPDATE customers
SET work_show_reported_time_to_customer_users = true
WHERE work_show_time_to_customer_users = true
  AND work_show_reported_time_to_customer_users = false;
