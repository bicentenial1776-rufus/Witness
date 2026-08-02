-- The gedcom-files bucket and its RLS policy have existed since the first
-- schema migration; nothing ever wrote to them. The brief promises the raw
-- file is "encrypted on your device before it ever reaches our servers", and
-- until now it simply never reached them at all — safer than claimed, but not
-- what was claimed, and with no way to get a tree back from Witness alone.
--
-- These columns record where a tree's encrypted original lives and how big it
-- is. The key never appears here or anywhere else server-side: it is generated
-- on the device, kept in the iOS Keychain, and shown to the user once as a
-- recovery code. A row with gedcom_path set and no matching key on any device
-- is unreadable ciphertext, permanently, by design.

alter table trees
  add column if not exists gedcom_path text,
  add column if not exists gedcom_bytes bigint,
  add column if not exists gedcom_uploaded_at timestamptz;

comment on column trees.gedcom_path is
  'Object key in the gedcom-files bucket ({user_id}/{tree_id}.enc), or null if the original was never stored. Contents are AES-256-GCM ciphertext the server cannot decrypt.';
comment on column trees.gedcom_bytes is
  'Size of the stored ciphertext in bytes — lets the app show what a restore will cost without a round trip to Storage.';
