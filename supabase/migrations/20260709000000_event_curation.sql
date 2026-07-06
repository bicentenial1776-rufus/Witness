-- Curation metadata for the three-surface query architecture
-- (docs/QUERY_LIBRARY.md): events are never browsed as a catalog — they
-- reach the user as "Lived Through" tags on ancestor cards and as the
-- curated shelf in Explore, both of which need to know how wide an event's
-- reach was (tier), where it happened (geo_scope), and which heritage
-- branches it speaks to (lens_affinity). The existing `summary` column is
-- the library's one-sentence context_line; it keeps its name because the
-- deployed app selects it by name.
--
-- Also completes the Section I 🟢 NOW seed: the ~44 buildable event
-- queries resolve to the distinct events below (age-filter variants like
-- "of fighting age during WWII" share their war's row).

alter table historical_events
  add column tier text not null default 'major'
    check (tier in ('major', 'regional', 'local')),
  add column geo_scope jsonb,
  add column lens_affinity text[];

-- geo_scope shape: {"regions": [...]} using the canonical display regions
-- the place classifier produces (US states, Canadian provinces incl.
-- Acadia, or country names). Null means the event touched everywhere.

update historical_events set tier = 'regional',
  geo_scope = '{"regions": ["Massachusetts", "Rhode Island", "Connecticut", "New Hampshire", "Maine", "Vermont"]}',
  lens_affinity = array['colonial_new_england']
  where id in ('mayflower-landing', 'king-philips-war');

update historical_events set tier = 'local',
  geo_scope = '{"regions": ["Massachusetts"]}',
  lens_affinity = array['colonial_new_england']
  where id in ('salem-witch-trials', 'boston-tea-party');

update historical_events set
  geo_scope = '{"regions": ["New York", "Pennsylvania", "Virginia", "Massachusetts", "New Hampshire", "Maine", "Quebec", "Nova Scotia"]}',
  lens_affinity = array['colonial_new_england', 'french_canadian']
  where id = 'french-and-indian-war';

update historical_events set tier = 'regional',
  geo_scope = '{"regions": ["Acadia", "Nova Scotia", "New Brunswick", "Prince Edward Island"]}',
  lens_affinity = array['acadian']
  where id = 'grand-derangement';

-- The audit's query is the construction era (1817–1825), which is when
-- the canal pulled lives and migration along its route.
update historical_events set
  name = 'Construction of the Erie Canal',
  start_year = 1817,
  summary = 'Eight years of digging carved a 363-mile canal that linked the Atlantic to the Great Lakes and pulled migration westward.',
  tier = 'regional',
  geo_scope = '{"regions": ["New York"]}'
  where id = 'erie-canal';

update historical_events set tier = 'regional',
  geo_scope = '{"regions": ["Ireland"]}',
  lens_affinity = array['irish']
  where id = 'irish-famine';

update historical_events set tier = 'regional',
  geo_scope = '{"regions": ["California"]}'
  where id = 'california-gold-rush';

update historical_events set tier = 'local',
  geo_scope = '{"regions": ["Illinois"]}'
  where id = 'great-chicago-fire';

update historical_events set tier = 'local',
  geo_scope = '{"regions": ["California"]}'
  where id = 'san-francisco-earthquake';

insert into historical_events (id, name, start_year, end_year, region, summary, keywords, sort_order, tier, geo_scope, lens_affinity) values
  ('founding-of-rhode-island', 'Founding of Rhode Island', 1636, 1636, 'New England', 'Roger Williams, banished from Massachusetts Bay, founded Providence on the principle of liberty of conscience.', array['roger williams','providence'], 15, 'regional', '{"regions": ["Rhode Island", "Massachusetts"]}', array['colonial_new_england']),
  ('great-awakening', 'The Great Awakening', 1730, 1745, 'American Colonies', 'A wave of religious revival swept the colonies, filling meetinghouses and splitting congregations.', array['revival','whitefield','edwards'], 35, 'regional', '{"regions": ["Massachusetts", "Rhode Island", "Connecticut", "New Hampshire", "Maine", "Vermont"]}', array['colonial_new_england']),
  ('stamp-act', 'The Stamp Act', 1765, 1766, 'American Colonies', 'Britain''s first direct tax on the colonies required stamped paper for nearly every printed document.', null, 55, 'major', null, null),
  ('boston-massacre', 'Boston Massacre', 1770, 1770, 'New England', 'British soldiers fired into a Boston crowd, killing five and hardening colonial resistance.', null, 56, 'local', '{"regions": ["Massachusetts"]}', array['colonial_new_england']),
  ('washington-dies', 'Death of George Washington', 1799, 1799, 'United States', 'George Washington died at Mount Vernon, and the young republic mourned its founding figure.', null, 95, 'major', null, null),
  ('trail-of-tears', 'Trail of Tears', 1838, 1839, 'United States', 'The United States forced the Cherokee from their homelands on a march west that killed thousands.', array['cherokee','removal'], 125, 'regional', '{"regions": ["Georgia", "Tennessee", "Alabama", "North Carolina", "Oklahoma"]}', null),
  ('mexican-american-war', 'Mexican-American War', 1846, 1848, 'North America', 'War with Mexico carried American arms to the Pacific and redrew the continent''s map.', null, 135, 'major', null, null),
  ('gilded-age', 'The Gilded Age', 1870, 1900, 'United States', 'Railroads, factories, and vast new fortunes transformed America in a single generation.', null, 172, 'major', null, null),
  ('panic-of-1873', 'Panic of 1873', 1873, 1879, 'United States', 'A banking collapse set off a depression that idled railroads, factories, and farms for years.', array['depression'], 182, 'major', null, null),
  ('panic-of-1893', 'Panic of 1893', 1893, 1897, 'United States', 'Railroad failures and bank runs plunged the country into the deepest depression it had yet known.', array['depression'], 192, 'major', null, null),
  ('klondike-gold-rush', 'Klondike Gold Rush', 1896, 1899, 'Yukon', 'Word of gold on the Klondike sent a hundred thousand stampeders toward the Yukon.', array['yukon','alaska'], 195, 'regional', '{"regions": ["Alaska", "British Columbia"]}', null),
  ('wright-brothers-flight', 'First Flight at Kitty Hawk', 1903, 1903, 'United States', 'At Kitty Hawk, the Wright brothers flew a powered aircraft for twelve seconds.', array['airplane','aviation'], 197, 'major', null, null),
  ('prohibition', 'Prohibition', 1920, 1933, 'United States', 'The Eighteenth Amendment outlawed the manufacture and sale of alcohol nationwide.', array['temperance','speakeasy'], 245, 'major', null, null),
  ('dust-bowl', 'The Dust Bowl', 1930, 1936, 'United States', 'Drought and dust storms stripped the southern Plains and drove families from their farms.', null, 255, 'regional', '{"regions": ["Oklahoma", "Kansas", "Texas", "Colorado", "New Mexico", "Nebraska"]}', null),
  ('atomic-bomb', 'The Atomic Bomb', 1945, 1945, 'World', 'Atomic bombs destroyed Hiroshima and Nagasaki, ending the war and opening the nuclear age.', array['hiroshima','nagasaki'], 262, 'major', null, null),
  ('korean-war', 'Korean War', 1950, 1953, 'World', 'American forces fought three years of war on the Korean peninsula.', null, 263, 'major', null, null),
  ('civil-rights-movement', 'Civil Rights Movement', 1954, 1968, 'United States', 'From Montgomery to Selma, a movement dismantled legal segregation in America.', array['montgomery','selma','king'], 264, 'major', null, null),
  ('vietnam-war', 'Vietnam War Era', 1955, 1975, 'World', 'Two decades of war in Vietnam divided America and defined a generation.', null, 265, 'major', null, null),
  ('jfk-assassination', 'Assassination of John F. Kennedy', 1963, 1963, 'United States', 'President Kennedy was shot in Dallas, and the country stopped.', array['kennedy','dallas'], 266, 'major', null, null),
  ('aids-crisis', 'The AIDS Crisis', 1981, 1996, 'World', 'An epidemic killed hundreds of thousands of Americans while the country was slow to respond.', array['hiv','epidemic'], 280, 'major', null, null),
  ('september-11', 'September 11 Attacks', 2001, 2001, 'United States', 'Hijacked airliners destroyed the World Trade Center and struck the Pentagon, killing nearly 3,000 people.', array['9/11','world trade center'], 290, 'major', null, null)
;
