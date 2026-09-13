-- WWII Army enlistments — the aad-wwii-enlistment register, the first
-- deep-link Variant C register and the one that ships the framework's
-- Variant C UI (exposure candidates from match-records, the save-back
-- form on the card). Config only: the same content as
-- data/registers/aad-wwii-enlistment/register.json, upserted here so the
-- next match-records sweep writes candidates without a seed run.
insert into registers (register_key, display_name, variant, provenance_label, coverage_caveat, status, config)
values (
  'aad-wwii-enlistment',
  'WWII Army enlistments (National Archives, AAD)',
  'C',
  'From the WWII Army Enlistment Records (National Archives, AAD)',
  'The file holds about 8.7 million Army and Army Air Forces enlistments of 1938–1946 — most of the Army’s enlisted men and women, none of the Navy, Marines, or Coast Guard, and few officers. Names and places are as the punch cards had them, upper-case and sometimes truncated; the birth year is two digits.',
  'active',
  $json$
  {
    "exposure": {
      "birthYearRange": { "from": 1893, "to": 1929, "weight": 2, "reason": "born 1893–1929, of age to enlist in the Second World War" },
      "dateWindows": [
        { "from": 1930, "to": 1950, "weight": 1, "reason": "recorded in the United States around the war years" }
      ],
      "placeSignals": [
        { "pattern": "united states", "weight": 1, "reason": "a recorded United States place" },
        { "pattern": "usa", "weight": 1, "reason": "a recorded United States place" }
      ],
      "coincidenceBonus": 1,
      "citationSignals": [
        { "pattern": "army enlistment", "weight": 4, "reason": "your own tree cites the Army enlistment file" },
        { "pattern": "world war ii", "weight": 2, "reason": "your own tree cites a Second World War record" },
        { "pattern": "draft registration", "weight": 1, "reason": "your own tree cites a WWII draft card — they registered; the enlistment file says whether they served" }
      ],
      "threshold": 4
    },
    "candidateSummary": "Of age to serve in the Second World War; whether they enlisted in the Army is for the file to say. Search it, and copy the record here if you find them.",
    "deepLinkTemplate": "https://aad.archives.gov/aad/display-partial-records.jsp?dt=893&sc=24994,24995,24996,24998,24997,24993,24981,24983&cat=all&tf=F&bc=sl,fd&q=&nfo_24995=V,24,1900&op_24995=0&txt_24995={surname_upper}%23{given_upper}&nfo_24983=V,2,1900&op_24983=0&txt_24983={birth_yy}&rpp=50&pg=1",
    "saveBack": {
      "title": "The enlistment record",
      "intro": "Copy the record as the file has it — the punch cards wrote in capitals and cut long words short; keep their spelling. Leave blank what the record does not say.",
      "fields": [
        { "key": "serial_number", "label": "Army serial number", "placeholder": "e.g. 11128325", "required": true },
        { "key": "enlistment_date", "label": "Date of enlistment", "placeholder": "e.g. 1944-03-02, or 1944", "isYear": true },
        { "key": "enlistment_place", "label": "Place of enlistment", "placeholder": "e.g. Fort Devens, Massachusetts" },
        { "key": "residence", "label": "Residence (county, state)", "placeholder": "e.g. Worcester, Massachusetts" },
        { "key": "grade", "label": "Grade", "placeholder": "e.g. Private" },
        { "key": "branch", "label": "Branch", "placeholder": "e.g. Infantry, Air Corps" },
        { "key": "birthplace", "label": "Nativity (birthplace)", "placeholder": "e.g. Massachusetts" },
        { "key": "education", "label": "Education", "placeholder": "e.g. 4 years of high school" },
        { "key": "civilian_occupation", "label": "Civilian occupation", "placeholder": "e.g. Machinists" },
        { "key": "marital_status", "label": "Marital status", "placeholder": "e.g. Single, without dependents" },
        { "key": "record_url", "label": "Record link (optional)", "placeholder": "Paste the record-detail page address" }
      ],
      "recordNameTemplate": "Army serial number {serial_number}",
      "summaryTemplate": "Enlisted {enlistment_date} at {enlistment_place} · {grade} — {branch} · of {residence} · born {birthplace} · {education} · {civilian_occupation} · {marital_status}",
      "sourceCitation": "National Archives, Records of the National Archives and Records Administration (RG 64), World War II Army Enlistment Records — Electronic Army Serial Number Merged File, ca. 1938–1946 (AAD series 893)",
      "urlKey": "record_url"
    },
    "confirmEvent": { "eventType": "military", "detailTemplate": "{record_summary} — {register_label}" },
    "explainer": "When a man or woman enlisted in the United States Army between 1938 and 1946 a punch card was cut with their serial number, name, home county and state, place and date of enlistment, grade and branch, birthplace and birth year, education, civilian occupation, and marital status. The National Archives rebuilt about 8.7 million of those cards from a damaged microfilm copy and publishes them free in its Access to Archival Databases. Witness does not hold the file; it opens the search with the name and birth year filled in, and what you copy back becomes a record on this person. Navy, Marine, and Coast Guard enlistments are not in it, and roughly one card in ten could not be recovered."
  }
  $json$::jsonb
)
on conflict (register_key) do update
  set display_name = excluded.display_name,
      variant = excluded.variant,
      provenance_label = excluded.provenance_label,
      coverage_caveat = excluded.coverage_caveat,
      status = excluded.status,
      config = excluded.config;
