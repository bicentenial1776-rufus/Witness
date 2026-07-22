-- The Query Library: a server-side catalog of questions the app evaluates
-- client-side against the tree (packages/core query/library.ts). Entries
-- ship and evolve without app releases. Presentation doctrine: entries are
-- always listed with their live result count for the user's tree — a
-- personalized answer list, never a generic catalog (QUERY_LIBRARY.md).

create table query_catalog (
  id text primary key,
  category text not null,
  title text not null,
  detail text,
  keywords text[] not null default '{}',
  kind text not null,
  params jsonb not null default '{}',
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

alter table query_catalog enable row level security;
create policy "Catalog is readable by all signed-in users" on query_catalog
  for select using (auth.role() = 'authenticated');

-- Pinned questions: a small set of active curiosities per user. (Freshness
-- badges and auto-archive are a later phase; the shape supports them.)
create table library_pins (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  query_id text not null references query_catalog (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, query_id)
);

alter table library_pins enable row level security;
create policy "Users manage their own pins" on library_pins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seeds. Categories render in the order defined by LIBRARY_CATEGORIES in
-- @witness/core; sort_order orders entries within a category.

insert into query_catalog (id, category, title, detail, keywords, kind, params, sort_order) values

-- Lives in wartime -----------------------------------------------------------
('alive-revolution', 'wartime', 'Who was alive during the Revolution?', 'The War of Independence, 1775–1783.', '{revolution,war,independence,1776}', 'alive_during', '{"start_year":1775,"end_year":1783}', 10),
('fighting-age-revolution', 'wartime', 'Who was of fighting age in the Revolution?', 'Men born 1740–1763 — old enough to shoulder a musket.', '{revolution,soldier,militia,war}', 'birth_window', '{"birth_from":1740,"birth_to":1763,"sex":"M"}', 20),
('alive-1812', 'wartime', 'Who lived through the War of 1812?', null, '{1812,war,britain}', 'alive_during', '{"start_year":1812,"end_year":1815}', 30),
('alive-civil-war', 'wartime', 'Who was alive during the Civil War?', '1861–1865.', '{civil,war,union,confederate}', 'alive_during', '{"start_year":1861,"end_year":1865}', 40),
('fighting-age-civil-war', 'wartime', 'Who was of fighting age in the Civil War?', 'Men born 1826–1847.', '{civil,war,soldier}', 'birth_window', '{"birth_from":1826,"birth_to":1847,"sex":"M"}', 50),
('alive-wwi', 'wartime', 'Who lived through World War I?', '1914–1918.', '{wwi,world,war,great}', 'alive_during', '{"start_year":1914,"end_year":1918}', 60),
('fighting-age-wwi', 'wartime', 'Who was of fighting age in World War I?', 'Men born 1880–1900.', '{wwi,world,war,doughboy,soldier}', 'birth_window', '{"birth_from":1880,"birth_to":1900,"sex":"M"}', 70),
('alive-wwii', 'wartime', 'Who lived through World War II?', '1939–1945.', '{wwii,world,war}', 'alive_during', '{"start_year":1939,"end_year":1945}', 80),
('fighting-age-wwii', 'wartime', 'Who was of fighting age in World War II?', 'Men born 1910–1927.', '{wwii,world,war,soldier,gi}', 'birth_window', '{"birth_from":1910,"birth_to":1927,"sex":"M"}', 90),
('alive-korea', 'wartime', 'Who was alive during the Korean War?', '1950–1953.', '{korea,korean,war}', 'alive_during', '{"start_year":1950,"end_year":1953}', 100),
('alive-vietnam', 'wartime', 'Who lived through the Vietnam era?', '1955–1975.', '{vietnam,war}', 'alive_during', '{"start_year":1955,"end_year":1975}', 110),

-- Their world's great events --------------------------------------------------
('alive-mayflower', 'great-events', 'Who was alive when the Mayflower landed?', '1620 — the crossing that started New England.', '{mayflower,pilgrim,plymouth,1620}', 'alive_during', '{"start_year":1620,"end_year":1620}', 10),
('alive-salem', 'great-events', 'Who lived through the Salem witch trials?', '1692.', '{salem,witch,trials}', 'alive_during', '{"start_year":1692,"end_year":1693}', 20),
('alive-declaration', 'great-events', 'Who was alive when the Declaration was signed?', 'July 1776.', '{declaration,independence,1776}', 'alive_during', '{"start_year":1776,"end_year":1776}', 30),
('alive-louisiana', 'great-events', 'Who was alive for the Louisiana Purchase?', '1803 — the nation doubled overnight.', '{louisiana,purchase,1803}', 'alive_during', '{"start_year":1803,"end_year":1803}', 40),
('alive-famine', 'great-events', 'Who was alive during the Great Famine in Ireland?', '1845–1852.', '{famine,ireland,irish,hunger}', 'alive_during', '{"start_year":1845,"end_year":1852}', 50),
('alive-gold-rush', 'great-events', 'Who was alive during the California Gold Rush?', '1848–1855.', '{gold,rush,california,49er}', 'alive_during', '{"start_year":1848,"end_year":1855}', 60),
('alive-railroad', 'great-events', 'Who was alive when the transcontinental railroad was completed?', '1869 — the golden spike.', '{railroad,transcontinental,train,1869}', 'alive_during', '{"start_year":1869,"end_year":1869}', 70),
('alive-ellis', 'great-events', 'Who was alive when Ellis Island opened?', '1892.', '{ellis,island,immigration,1892}', 'alive_during', '{"start_year":1892,"end_year":1892}', 80),
('alive-wright', 'great-events', 'Who was alive when the Wright brothers flew?', 'Kitty Hawk, 1903.', '{wright,flight,airplane,1903}', 'alive_during', '{"start_year":1903,"end_year":1903}', 90),
('survived-1918-flu', 'great-events', 'Who survived the 1918 influenza pandemic?', 'Alive in 1918 and lived past 1919.', '{flu,influenza,pandemic,1918,spanish}', 'survived', '{"alive_year":1918,"survive_past":1919}', 100),
('alive-depression', 'great-events', 'Who lived through the Great Depression?', '1929–1939.', '{depression,crash,1929,dust}', 'alive_during', '{"start_year":1929,"end_year":1939}', 110),
('alive-moon', 'great-events', 'Who was alive for the first moon landing?', 'July 1969.', '{moon,apollo,landing,1969,space}', 'alive_during', '{"start_year":1969,"end_year":1969}', 120),
('alive-sept-11', 'great-events', 'Who was alive on September 11, 2001?', null, '{september,2001,attacks}', 'alive_during', '{"start_year":2001,"end_year":2001}', 130),

-- Long lives & short ----------------------------------------------------------
('reached-90', 'long-lives', 'Who lived past 90?', null, '{90,longevity,old,age,elder}', 'reached_age', '{"min":90}', 10),
('centenarians', 'long-lives', 'Who reached 100?', 'The centenarians.', '{100,centenarian,longevity}', 'reached_age', '{"min":100}', 20),
('longest-lived', 'long-lives', 'Who lived the longest?', 'The 25 longest lives in your tree.', '{longest,oldest,lifespan}', 'longest_lived', '{"limit":25}', 30),
('three-centuries', 'long-lives', 'Who lived in three different centuries?', 'Born in one century, died two later.', '{century,centuries,span}', 'century_span', '{"min_centuries":3}', 40),
('died-in-childhood', 'long-lives', 'Who died in childhood?', 'Lives that ended before age 10 — the hardest rows in any tree.', '{child,childhood,infant,young,mortality}', 'age_at_death', '{"from":0,"to":9}', 50),
('died-in-twenties', 'long-lives', 'Who died in their twenties?', null, '{twenties,young,died}', 'age_at_death', '{"from":20,"to":29}', 60),
('born-before-1700', 'long-lives', 'Who was born before 1700?', 'The deepest roots.', '{1700,oldest,colonial,earliest}', 'born_before', '{"year":1699}', 70),

-- Family patterns -------------------------------------------------------------
('most-children', 'family-patterns', 'Who raised the biggest families?', 'The 25 parents with the most recorded children.', '{children,family,biggest,large}', 'most_children', '{"limit":25}', 10),
('married-more-than-once', 'family-patterns', 'Who married more than once?', null, '{married,marriages,remarried,widow}', 'married_more_than_once', '{}', 20),

-- Where they lived ------------------------------------------------------------
('lived-new-england', 'where-they-lived', 'Who lived in New England?', null, '{maine,vermont,hampshire,massachusetts,connecticut,rhode,england,new}', 'place_lived', '{"needles":["Maine","Vermont","New Hampshire","Massachusetts","Connecticut","Rhode Island"]}', 10),
('lived-ireland', 'where-they-lived', 'Who lived in Ireland?', null, '{ireland,irish}', 'place_lived', '{"needles":["Ireland"]}', 20),
('lived-england', 'where-they-lived', 'Who lived in England?', null, '{england,english,britain}', 'place_lived', '{"needles":["England"]}', 30),
('lived-france', 'where-they-lived', 'Who lived in France?', null, '{france,french}', 'place_lived', '{"needles":["France"]}', 40),
('lived-canada', 'where-they-lived', 'Who lived in Canada?', null, '{canada,canadian,quebec,acadia}', 'place_lived', '{"needles":["Canada","Québec","Quebec","Acadia","Nova Scotia","New Brunswick"]}', 50),
('lived-germany', 'where-they-lived', 'Who lived in Germany?', null, '{germany,german,prussia}', 'place_lived', '{"needles":["Germany","Prussia"]}', 60);
