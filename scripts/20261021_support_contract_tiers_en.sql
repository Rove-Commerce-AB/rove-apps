-- English labels for support packages. Safe to rerun.

BEGIN;

UPDATE support_contract_tiers SET name = 'Base' WHERE code = 'bas';
UPDATE support_contract_tiers SET name = 'Extended' WHERE code = 'utokad';

COMMIT;

SELECT code, name FROM support_contract_tiers ORDER BY sort_order;
