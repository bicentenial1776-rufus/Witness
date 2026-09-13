-- Family Tree Maker exports write the literal word "(null)" where a
-- citation has no transcribed text, page, or URL; the importer now drops
-- it (transform.ts withoutFtmNull), and this clears what earlier imports
-- stored. The Sources tab was printing "(null)" in quotation marks.
update citations set text_excerpt = null where text_excerpt ~* '^\s*\(null\)\s*$';
update citations set page = null where page ~* '^\s*\(null\)\s*$';
update citations set url = null where url ~* '^\s*\(null\)\s*$';
