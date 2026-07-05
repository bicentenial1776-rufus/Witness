-- The curated historical-event library moves server-side so new prompt
-- cards can ship to every user without an app update — the "living
-- chronicle" compounding the brief promises. The bundled TS list remains
-- as an offline/error fallback; slugs are the stable contract between
-- the two. Rows are global (no user_id): authenticated users read,
-- only the service role writes.

create table historical_events (
  id text primary key,
  name text not null,
  start_year integer not null,
  end_year integer not null,
  region text not null,
  summary text not null,
  keywords text[],
  sort_order integer not null,
  created_at timestamptz not null default now()
);

alter table historical_events enable row level security;

create policy "Authenticated users read the event library" on historical_events
  for select to authenticated using (true);

insert into historical_events (id, name, start_year, end_year, region, summary, keywords, sort_order) values
  ('mayflower-landing', 'The Mayflower Lands', 1620, 1620, 'New England', 'The Pilgrims anchored off Cape Cod and founded Plymouth Colony.', array['mayflower','pilgrims','plymouth'], 10),
  ('king-philips-war', 'King Philip''s War', 1675, 1678, 'New England', 'The deadliest war per capita in American colonial history swept through the towns of New England.', null, 20),
  ('salem-witch-trials', 'Salem Witch Trials', 1692, 1693, 'New England', 'Accusations of witchcraft consumed Salem and the surrounding Massachusetts villages.', null, 30),
  ('french-and-indian-war', 'French and Indian War', 1754, 1763, 'North America', 'Britain and France fought for the continent, drawing colonial militias into the frontier.', null, 40),
  ('grand-derangement', 'Le Grand Dérangement', 1755, 1764, 'Acadia', 'The British expelled the Acadian people from their homeland, scattering families across the Atlantic world.', array['acadian','expulsion','cajun'], 50),
  ('boston-tea-party', 'Boston Tea Party', 1773, 1773, 'New England', 'Colonists dumped 342 chests of British tea into Boston Harbor.', null, 60),
  ('american-revolution', 'American Revolution', 1775, 1783, 'North America', 'Thirteen colonies fought an eight-year war for independence.', array['revolutionary war'], 70),
  ('declaration-of-independence', 'Signing of the Declaration of Independence', 1776, 1776, 'North America', 'The colonies declared themselves free and independent states.', null, 80),
  ('constitution-ratified', 'Ratification of the Constitution', 1788, 1788, 'United States', 'The United States adopted the framework of government still in force today.', null, 90),
  ('louisiana-purchase', 'Louisiana Purchase', 1803, 1803, 'United States', 'The nation doubled in size overnight for fifteen million dollars.', null, 100),
  ('war-of-1812', 'War of 1812', 1812, 1815, 'North America', 'The young republic fought Britain again, from the Great Lakes to a burning Washington.', null, 110),
  ('erie-canal', 'Opening of the Erie Canal', 1825, 1825, 'United States', 'A 363-mile canal linked the Atlantic to the Great Lakes and pulled migration westward.', null, 120),
  ('irish-famine', 'The Great Famine', 1845, 1852, 'Ireland', 'Famine killed a million people in Ireland and drove two million more to emigrate.', null, 130),
  ('california-gold-rush', 'California Gold Rush', 1848, 1855, 'United States', 'Three hundred thousand people raced to California in search of gold.', null, 140),
  ('civil-war', 'American Civil War', 1861, 1865, 'United States', 'The war between North and South touched nearly every American family.', array['union','confederacy'], 150),
  ('lincoln-assassination', 'Assassination of Abraham Lincoln', 1865, 1865, 'United States', 'Five days after Appomattox, the president was shot at Ford’s Theatre.', null, 160),
  ('transcontinental-railroad', 'Completion of the Transcontinental Railroad', 1869, 1869, 'United States', 'A golden spike at Promontory Summit joined the coasts by rail.', null, 170),
  ('great-chicago-fire', 'Great Chicago Fire', 1871, 1871, 'United States', 'Fire destroyed three square miles of Chicago and left a third of the city homeless.', null, 180),
  ('ellis-island-opens', 'Opening of Ellis Island', 1892, 1892, 'United States', 'The great gateway of American immigration opened in New York Harbor.', null, 190),
  ('san-francisco-earthquake', 'San Francisco Earthquake', 1906, 1906, 'United States', 'Earthquake and fire destroyed most of San Francisco in three days.', null, 200),
  ('titanic', 'Sinking of the Titanic', 1912, 1912, 'World', 'The unsinkable ship went down in the North Atlantic on its maiden voyage.', null, 210),
  ('world-war-i', 'World War I', 1914, 1918, 'World', 'The Great War drew millions of Americans into the trenches of Europe.', null, 220),
  ('influenza-1918', '1918 Influenza Pandemic', 1918, 1920, 'World', 'A pandemic killed more people than the war it followed.', array['spanish flu','pandemic'], 230),
  ('womens-suffrage', 'Ratification of the 19th Amendment', 1920, 1920, 'United States', 'American women won the constitutional right to vote.', null, 240),
  ('great-depression', 'Great Depression', 1929, 1939, 'World', 'A decade of economic collapse reshaped how a generation lived and worked.', null, 250),
  ('world-war-ii', 'World War II', 1939, 1945, 'World', 'The largest war in human history reached into every American town.', null, 260),
  ('moon-landing', 'Apollo 11 Moon Landing', 1969, 1969, 'World', 'Six hundred million people watched a human step onto the Moon.', null, 270)
;
