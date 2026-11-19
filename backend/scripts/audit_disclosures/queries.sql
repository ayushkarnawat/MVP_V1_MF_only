-- Batch L (portfolio disclosures audit): the read-only queries E1 to E5.
--
-- Rules for every query in this file
--   * ONE statement, SELECT only. Nothing here inserts, updates or deletes.
--   * Portable SQL: the same text runs on SQLite (the tests) and PostgreSQL (staging).
--     No DISTINCT ON, no Postgres-only functions.
--   * Tables read: schemes, disclosure_batches, scheme_aaum. None holds personal data.
--   * Bind parameters, filled in by run_audit.py:
--       :target_month_end   the month end being audited (31 Oct for the November round)
--       :prior_month_end    the month end before it (30 Sep)
--       :expected_absent    upper-cased fund house names whose normal state is "no row"
--                           (EXPECTED_ABSENT_AMCS in run_audit.py)
--   * Freshness always uses the as_of_date inside the file, never the import date
--     (fetched_at and written_at are never read).
--   * Status values are the lowercase DisclosureBatchStatus values: pending, fetched,
--     parsed, written, failed, awaiting_manual_upload.
--
-- Each query starts at its "-- @query" line; run_audit.py splits on those lines.

-- @query E1
-- Question: per fund house and batch status, how many batches exist for the target month
--           and for the month before? (The counts behind coverage measures 1 and 2, and the
--           October versus November comparison used to spot a layout change.)
-- Output columns: amc_name, status, batches_target, batches_prior, expected_gap
--   (expected_gap is 1 for a house whose normal state is "no row"; keep it out of the
--   denominator and list it separately.)
SELECT g.amc_name AS amc_name,
       g.status AS status,
       g.batches_target AS batches_target,
       g.batches_prior AS batches_prior,
       CASE WHEN UPPER(g.amc_name) IN :expected_absent THEN 1 ELSE 0 END AS expected_gap
FROM (
    SELECT b.amc_name AS amc_name,
           CAST(b.status AS VARCHAR(40)) AS status,
           SUM(CASE WHEN b.as_of_date = :target_month_end THEN 1 ELSE 0 END) AS batches_target,
           SUM(CASE WHEN b.as_of_date = :prior_month_end THEN 1 ELSE 0 END) AS batches_prior
    FROM disclosure_batches b
    WHERE b.as_of_date IN (:target_month_end, :prior_month_end)
    GROUP BY b.amc_name, CAST(b.status AS VARCHAR(40))
) g
ORDER BY g.amc_name, g.status;

-- @query E2
-- Question: how many live funds does each fund house have? (The denominator: "out of how
--           many". Live means active in the scheme master, which is how matured and closed
--           funds are switched off. Houses whose normal state is "no row" are left out.)
-- Output columns: amc_name, live_schemes, schemes_without_base_name
--   (schemes_without_base_name are live funds the disclosure job can never match, because
--   it groups funds by base_name.)
SELECT s.amc_name AS amc_name,
       COUNT(*) AS live_schemes,
       SUM(CASE WHEN s.base_name IS NULL THEN 1 ELSE 0 END) AS schemes_without_base_name
FROM schemes s
WHERE s.is_active = TRUE
  AND UPPER(s.amc_name) NOT IN :expected_absent
GROUP BY s.amc_name
ORDER BY s.amc_name;

-- @query E3
-- Question: for every live fund (expected-absent houses left out), what is its status for the
--           target month and what are its average assets? (The money measure. The assets row
--           used is the newest on or before the target month end, and assets_basis says
--           whether that is the same month, an older period, or missing, so a gap is stated,
--           never hidden.)
-- Output columns: amc_name, scheme_name, target_status, aaum_reference_period, aaum_value,
--                 assets_basis
--   (target_status is the batch status for the target month, or no_batch when there is none;
--   assets_basis is same_month, older_period or missing.)
SELECT s.amc_name AS amc_name,
       s.name AS scheme_name,
       COALESCE(CAST(b.status AS VARCHAR(40)), 'no_batch') AS target_status,
       a.reference_period AS aaum_reference_period,
       a.aaum_value AS aaum_value,
       CASE WHEN a.reference_period IS NULL THEN 'missing'
            WHEN a.reference_period = :target_month_end THEN 'same_month'
            ELSE 'older_period' END AS assets_basis
FROM schemes s
LEFT JOIN disclosure_batches b
       ON b.scheme_id = s.id AND b.as_of_date = :target_month_end
LEFT JOIN scheme_aaum a
       ON a.scheme_id = s.id
      AND a.reference_period = (SELECT MAX(a2.reference_period)
                                FROM scheme_aaum a2
                                WHERE a2.scheme_id = s.id
                                  AND a2.reference_period <= :target_month_end)
WHERE s.is_active = TRUE
  AND UPPER(s.amc_name) NOT IN :expected_absent
ORDER BY s.amc_name, s.name;

-- @query E4
-- Question: what is the newest as_of_date per live fund and per fund house, and is each fund
--           fresh or stale? (Fresh means the newest WRITTEN batch is dated on or after the
--           target month end; stale means it is older; none means no written batch at all.
--           A failed or waiting batch is not coverage. The date is the one inside the file,
--           never the import date.)
-- Output columns: amc_name, scheme_name, newest_written_as_of, newest_any_as_of, freshness,
--                 house_newest_written_as_of, expected_gap
--   (newest_any_as_of counts every status, so a failed target-month batch is visible;
--   house_newest_written_as_of is the same figure for the whole fund house.)
SELECT p.amc_name AS amc_name,
       p.scheme_name AS scheme_name,
       p.newest_written_as_of AS newest_written_as_of,
       p.newest_any_as_of AS newest_any_as_of,
       CASE WHEN p.newest_written_as_of IS NULL THEN 'none'
            WHEN p.newest_written_as_of >= :target_month_end THEN 'fresh'
            ELSE 'stale' END AS freshness,
       MAX(p.newest_written_as_of) OVER (PARTITION BY p.amc_name) AS house_newest_written_as_of,
       CASE WHEN UPPER(p.amc_name) IN :expected_absent THEN 1 ELSE 0 END AS expected_gap
FROM (
    SELECT s.amc_name AS amc_name,
           s.name AS scheme_name,
           MAX(CASE WHEN b.status = 'written' THEN b.as_of_date END) AS newest_written_as_of,
           MAX(b.as_of_date) AS newest_any_as_of
    FROM schemes s
    LEFT JOIN disclosure_batches b ON b.scheme_id = s.id
    WHERE s.is_active = TRUE
    GROUP BY s.id, s.amc_name, s.name
) p
ORDER BY p.amc_name, p.scheme_name;

-- @query E5
-- Question: why did each failed batch fail? (The structured reasons stored in parse_errors,
--           for the target month and the month before. Empty parse_errors means no structured
--           reason was stored, which is what a failed weight check looks like.)
-- Output columns: amc_name, scheme_name, as_of_date, source_kind, parse_errors
--   (source_kind is automatic, manual or unknown; the file address itself is not returned.)
SELECT b.amc_name AS amc_name,
       s.name AS scheme_name,
       b.as_of_date AS as_of_date,
       CASE WHEN b.source_url IS NULL THEN 'unknown'
            WHEN SUBSTR(b.source_url, 1, 7) = 'manual:' THEN 'manual'
            ELSE 'automatic' END AS source_kind,
       CASE WHEN b.parse_errors IS NULL OR CAST(b.parse_errors AS TEXT) = 'null' THEN NULL
            ELSE CAST(b.parse_errors AS TEXT) END AS parse_errors
FROM disclosure_batches b
JOIN schemes s ON s.id = b.scheme_id
WHERE b.status = 'failed'
  AND b.as_of_date IN (:target_month_end, :prior_month_end)
ORDER BY b.amc_name, s.name, b.as_of_date;
