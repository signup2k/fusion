-- Updating read state must not rebuild the full-text index for unchanged content.
DROP TRIGGER IF EXISTS items_fts_items_au;

CREATE TRIGGER items_fts_items_au AFTER UPDATE OF title, content ON items BEGIN
	DELETE FROM items_fts WHERE rowid = old.id;
	INSERT INTO items_fts(rowid, title, content)
	VALUES (new.id, new.title, new.content);
END;
