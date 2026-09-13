-- The AAD search link drops its birth-year filter. First live use: a
-- man the VA places in the Army Air Forces searched as GEILER#JOHN born
-- "25" and found nothing — the file's two-digit years are often wrong,
-- and the results table shows the year in its own column anyway, so the
-- filter only manufactures empty pages. Name only from here; the reader
-- judges the year by eye. Open candidates take the new link on the next
-- match-records sweep (it refreshes finding_aid_url on every open one).
update registers
  set config = jsonb_set(
    config,
    '{deepLinkTemplate}',
    '"https://aad.archives.gov/aad/display-partial-records.jsp?dt=893&sc=24994,24995,24996,24998,24997,24993,24981,24983&cat=all&tf=F&bc=sl,fd&q=&nfo_24995=V,24,1900&op_24995=0&txt_24995={surname_upper}%23{given_upper}&rpp=50&pg=1"'
  )
  where register_key = 'aad-wwii-enlistment';

update person_register_links
  set finding_aid_url = regexp_replace(finding_aid_url, '&nfo_24983=V,2,1900&op_24983=0&txt_24983=[0-9]*', '')
  where register_key = 'aad-wwii-enlistment' and finding_aid_url like '%txt_24983=%';
