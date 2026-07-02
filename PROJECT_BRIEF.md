# Witness — Family History Intelligence

An iOS/iPad app (React Native / Expo) that imports GEDCOM genealogy files and provides AI-powered analysis, temporal queries, geographic discovery, and historical context enrichment.

**Tech stack:** React Native / Expo, Supabase (Postgres + Storage), Claude Sonnet API for AI enrichment.

## Phase 1: GEDCOM Parser

The parser needs to:

- Parse GEDCOM 5.5.1 files (UTF-8, CRLF/LF line endings)
- Extract INDI (individual) records: name, sex, birth date/place, death date/place, residence events, burial
- Extract FAM (family) records: husband, wife, children, marriage date/place
- Normalize dates: exact dates, approximate (ABT), ranges (BET/AND), estimated (EST) — all need a year integer and a confidence enum (exact / approximate / estimated / unknown)
- Flag living persons: no death date + birth year within plausible living range (born after 1920 with no death date = likely living)
- Flag data anomalies as curiosities, not errors: child born before parent, implausible lifespans, date gaps
- Return a clean structured JS/TS object — individuals map, families map, place references array, metadata
- Handle large files: the test file is 11MB, 309,000 lines, 5,495 individuals
- Be resilient: malformed lines, unknown tags, and custom Ancestry.com extensions should be skipped gracefully

The test file is the Howe/Field Family Tree, exported from Ancestry.com, GEDCOM 5.5.1.

## Implementation notes

- TypeScript throughout.
- The parser itself is platform-agnostic pure TypeScript, testable in Node, structured to later integrate with the React Native / Expo mobile app.
