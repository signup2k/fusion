ALTER TABLE feeds ADD COLUMN filter_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (filter_mode IN ('none', 'blocklist', 'allowlist'));

ALTER TABLE feeds ADD COLUMN filter_keywords TEXT NOT NULL DEFAULT '';
