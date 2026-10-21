# Kuma heartbeat history import

Imported on 21 October 2026 from a consistent SQLite backup of the running
DigitalOcean Kuma droplet. The source database was not modified. The backup
contained 70,215 heartbeat rows; 62,298 belonged to the 25 retained HTTP
monitors. Kuma groups (IDs 22 and 23) and the previously deleted Jeeves monitor
(ID 30) were excluded from the canonical migration.

The imported Kuma snapshot ranges from 24 April 2026 02:16:32.300 UTC to
21 October 2026 14:56:56.772 UTC. It contains 59,308 up and 2,990 down rows.
Every row has a deterministic event ID, its existing Rove monitor/customer IDs,
UTC check time, HTTP status when available, latency, a normalized failure
category, and the origin `digitalocean` / `fra1` / `Europe/Berlin`.

The initial 62,298-row snapshot, plus a later 350-row delta, is retained
without expiration in
`monitoring_history.kuma_heartbeats_archive`. The canonical
`monitoring_history.heartbeats` table uses Kuma history only before each
monitor's first final Google Cloud worker check. It has 55,810 Kuma rows.
The 6,488 Kuma checks made during parallel operation in the initial snapshot
remain in the archive,
but were removed from the canonical table to prevent doubled uptime counts.
Validation found zero remaining parallel Kuma rows and 55,810 unique Kuma
event IDs in the canonical table.

`checked_at` and `scheduled_at` are absolute BigQuery timestamps. The added
`probe_provider`, `probe_region`, and `probe_timezone` fields record where the
HTTP request originated and the IANA time zone at that location. The worker
will write `google-cloud` / `europe-north2` / `Europe/Stockholm` for new checks.

The transfer was built with a local conversion script using the Kuma
monitor-to-Rove mapping and the current monitor/customer mapping from
BigQuery. The source export is private and must not be committed. Its SHA-256
was `59f5028ebe52f0ce1676fb6ddca4ae92cc166812b81f838e9eb6cf501b930123`.
The temporary staging table `monitoring_history.kuma_history_stage_20261021`
was deleted after verification. The archive is permanent. Reimports must match on the
deterministic event ID and apply the same per-monitor cutover rule.

Kuma was still running after the snapshot. A second consistent read captured
350 more rows through 21 October 2026 15:10:56.774 UTC, bringing the archive
to 62,648 unique rows. Those later parallel checks were added only to the
archive. Checks created on the droplet after that timestamp are outside this
one-time import. Because the canonical table follows the Google worker from
its first final check, future Kuma checks belong only in the archive if a
later source sync is needed.

## Complete Kuma source heartbeat snapshot

A further read-only, consistent SQLite transaction captured **68,281 of 68,281
Kuma heartbeat rows other than Jeeves** through **21 October 2026
15:17:56.774 UTC**. They are in
`monitoring_history.kuma_source_heartbeats`, partitioned by check month and
clustered by Kuma source monitor ID. This includes **62,823 rows for the 25
retained HTTP monitors** and **5,458 group rows** (2,386 for source monitor 22
and 3,072 for source monitor 23). BigQuery verification found 68,281 unique
source heartbeat IDs, zero Jeeves rows, and matching minimum/maximum and sum
of source IDs. This table is an archive, not a source for live uptime totals.
Checks added to the still-running Kuma after the snapshot cutoff are not
synchronized automatically.

The source archive preserves each heartbeat's Kuma ID, monitor ID, important
flag, status, UTC check/end times, ping, duration, down count, retry count, and
probe location/time zone. Raw message and HTTP response text were not copied
into BigQuery; SHA-256 hashes (and response byte length) allow source
comparison without storing possible request or response secrets. Thus the
archive is row-for-row complete for heartbeat statistics at the cutoff, but
it is not a byte-for-byte SQLite copy. The group rows remain outside the
canonical `heartbeats` table, and parallel Kuma/Google checks remain excluded
from canonical uptime calculations.

The temporary migration SSH keys were revoked, and the remote SQLite snapshot
and export files created for this task were deleted. Kuma itself and its live
database were left running.
