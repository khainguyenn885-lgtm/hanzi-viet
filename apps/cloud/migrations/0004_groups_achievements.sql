ALTER TABLE users ADD COLUMN study_uid TEXT;
ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';
ALTER TABLE flashcard_reviews ADD COLUMN success_streak INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_study_uid_idx ON users(study_uid);
CREATE TABLE IF NOT EXISTS roles (
  role_key TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
INSERT OR IGNORE INTO roles(role_key,label) VALUES ('user','Thành viên'),('admin','Quản trị viên');
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL REFERENCES roles(role_key),
  PRIMARY KEY(user_id,role_key)
);
CREATE TABLE IF NOT EXISTS review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('remembered','forgot')),
  occurred_at INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  client_event_id TEXT NOT NULL,
  UNIQUE(user_id,client_event_id)
);
CREATE INDEX IF NOT EXISTS review_events_user_date_idx ON review_events(user_id,local_date);
CREATE TABLE IF NOT EXISTS badge_awards (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,badge_key)
);
CREATE TABLE IF NOT EXISTS study_groups (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('pair','group')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(group_id,user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members(user_id);
CREATE TABLE IF NOT EXISTS group_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_study_uid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_deck_shares (
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL REFERENCES user_decks(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(group_id,deck_id)
);
CREATE TRIGGER IF NOT EXISTS group_members_limit BEFORE INSERT ON group_members
WHEN (SELECT COUNT(*) FROM group_members WHERE group_id=NEW.group_id) >=
  CASE (SELECT kind FROM study_groups WHERE id=NEW.group_id) WHEN 'pair' THEN 2 ELSE 5 END
BEGIN
  SELECT RAISE(ABORT, 'GROUP_FULL');
END;
