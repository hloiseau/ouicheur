-- ICU supplies the numeric, case/accent-insensitive title ordering used by the
-- browser's Intl.Collator. Installation fails explicitly if ICU is unavailable.
CREATE COLLATION ouicheur.wishlist_fr (provider=icu,locale='fr-u-kn-true-ks-level1',deterministic=false);
CREATE COLLATION ouicheur.wishlist_en (provider=icu,locale='en-u-kn-true-ks-level1',deterministic=false);
ALTER TABLE ouicheur.tenants
  ADD COLUMN name text NOT NULL DEFAULT 'Ouicheur',
  ADD COLUMN bio text NOT NULL DEFAULT '',
  ADD COLUMN avatar text NOT NULL DEFAULT '',
  ADD COLUMN banner text NOT NULL DEFAULT '',
  ADD COLUMN socials text NOT NULL DEFAULT '[]',
  ADD COLUMN background text NOT NULL DEFAULT '',
  ADD COLUMN accent text NOT NULL DEFAULT '#ff6682',
  ADD COLUMN banner_position integer NOT NULL DEFAULT 50 CHECK(banner_position BETWEEN 0 AND 100),
  ADD COLUMN layout text NOT NULL DEFAULT 'compact' CHECK(layout IN ('compact','comfortable'));
