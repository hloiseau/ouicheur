import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../lib/db";
import {
  authorized,
  createSession,
  hashPassword,
  hashToken,
  initializeOwner,
  sessionDevice,
  setPassword,
} from "../lib/auth";
import {
  changeSessionPassword,
  listSessions,
  loginOwner,
  revokeSessions,
  touchSession,
} from "../lib/sessions";

const password = "test-only-session-password";
test("session migration preserves existing logins and surprise choices without inventing dates", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("migrations")
      .filter((f) => f.endsWith(".sql") && f < "014")
      .sort())
      db.exec(readFileSync(`migrations/${file}`, "utf8"));
    const token = "a".repeat(64);
    const expiry = Date.now() + 60000;
    db.prepare(
      "INSERT INTO sessions(hash,expires,surprises_revealed) VALUES (?,?,1)",
    ).run(hashToken(token), expiry);
    db.exec(readFileSync("migrations/014-session-management.sql", "utf8"));
    assert.ok(authorized(db, token));
    const [session] = listSessions(db, token);
    assert.equal(session.created_at, null);
    assert.equal(session.last_seen, null);
    assert.equal(session.device, "");
    assert.match(session.id, /^[a-f0-9]{32}$/);
    assert.equal(session.expires_at, new Date(expiry).toISOString());
    assert.equal(
      db.prepare("SELECT surprises_revealed FROM sessions").get()!
        .surprises_revealed,
      1,
    );
  } finally {
    db.close();
  }
});

test("session summaries never expose credentials and activity does not extend expiry", () => {
  const db = openDatabase(":memory:");
  try {
    const token = createSession(
      db,
      "Mozilla/5.0 (Linux; Android) Chrome/140.0 Safari/537.36 secret-contact",
    );
    const other = createSession(db);
    const [current, second] = listSessions(db, token);
    assert.ok(current.current);
    assert.equal(second.current, false);
    assert.equal(current.device, "Chrome · Android");
    assert.ok(!authorized(db, current.id));
    const encoded = JSON.stringify(listSessions(db, token));
    for (const secret of [
      token,
      other,
      hashToken(token),
      hashToken(other),
      "secret-contact",
      "Mozilla",
      "140.0",
    ])
      assert.ok(!encoded.includes(secret), secret);
    db.prepare("UPDATE sessions SET last_seen=1 WHERE hash=?").run(
      hashToken(token),
    );
    touchSession(db, token);
    const after = listSessions(db, token)[0];
    assert.ok(Date.parse(after.last_seen!) > 1);
    assert.equal(after.expires_at, current.expires_at);
    assert.equal(sessionDevice("<script>arbitrary personal data</script>"), "");
  } finally {
    db.close();
  }
});

test("revoke a device, all other devices or self; invalidated sessions cannot act", () => {
  const db = openDatabase(":memory:");
  try {
    const current = createSession(db),
      other = createSession(db),
      third = createSession(db);
    const otherId = listSessions(db, other)[0].id;
    assert.deepEqual(revokeSessions(db, current, otherId), {
      signed_out: false,
    });
    assert.ok(!authorized(db, other));
    assert.ok(authorized(db, current));
    assert.throws(() => listSessions(db, other), { status: 401 });
    assert.throws(() => revokeSessions(db, other, "others"), { status: 401 });
    assert.throws(() => revokeSessions(db, current, otherId), { status: 404 });
    assert.throws(() => revokeSessions(db, current, "' OR 1=1 --"), {
      status: 404,
    });
    revokeSessions(db, current, "others");
    assert.ok(!authorized(db, third));
    assert.equal(listSessions(db, current).length, 1);
    assert.deepEqual(
      revokeSessions(db, current, listSessions(db, current)[0].id),
      { signed_out: true },
    );
    assert.ok(!authorized(db, current));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n, 0);
    const audit = JSON.stringify(db.prepare("SELECT * FROM audit").all());
    assert.ok(!audit.includes(current) && !audit.includes(hashToken(current)));
  } finally {
    db.close();
  }
});

test("expired sessions cannot list, revoke or renew themselves; storage stays bounded", () => {
  const db = openDatabase(":memory:");
  try {
    const expired = createSession(db);
    db.prepare("UPDATE sessions SET expires=?").run(Date.now() - 1);
    assert.ok(!authorized(db, expired));
    assert.throws(() => revokeSessions(db, expired, "others"), { status: 401 });
    touchSession(db, expired);
    assert.ok(!authorized(db, expired));
    let newest = "";
    for (let i = 0; i < 105; i++) newest = createSession(db);
    assert.equal(listSessions(db, newest).length, 100);
    assert.ok(authorized(db, newest));
    assert.equal(
      db.prepare("SELECT 1 FROM sessions WHERE hash=?").get(hashToken(expired)),
      undefined,
    );
  } finally {
    db.close();
  }
});

test("password changes rotate the current session and revoke every former token", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", password);
    const current = await loginOwner(db, password),
      other = await loginOwner(db, password);
    await assert.rejects(
      changeSessionPassword(
        db,
        current,
        "incorrect-password",
        "replacement-password",
      ),
      { status: 403 },
    );
    assert.ok(authorized(db, current) && authorized(db, other));
    await assert.rejects(changeSessionPassword(db, current, password, "short"));
    assert.ok(authorized(db, current));
    const replacement = await changeSessionPassword(
      db,
      current,
      password,
      "replacement-password",
    );
    assert.ok(authorized(db, replacement));
    assert.ok(!authorized(db, current) && !authorized(db, other));
    assert.equal(listSessions(db, replacement).length, 1);
    assert.equal(
      db.prepare("SELECT surprises_revealed FROM sessions").get()!
        .surprises_revealed,
      0,
    );
    await assert.rejects(loginOwner(db, password), { status: 401 });
    assert.ok(authorized(db, await loginOwner(db, "replacement-password")));
    await setPassword(db, "local-recovery-password");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n, 0);
    assert.ok(authorized(db, await loginOwner(db, "local-recovery-password")));
  } finally {
    db.close();
  }
});

test("an in-flight login cannot resurrect access after a concurrent password reset", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", password);
    const replacement = await hashPassword("another-local-password");
    const pending = loginOwner(db, password);
    db.prepare("UPDATE owner SET password_hash=? WHERE id=1").run(replacement);
    await assert.rejects(pending, { status: 401 });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n, 0);
  } finally {
    db.close();
  }
});

test("a revoked or expired session cannot complete a password change already in progress", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeOwner(db, "Test", password);
    const token = createSession(db);
    const pending = changeSessionPassword(
      db,
      token,
      password,
      "replacement-password",
    );
    revokeSessions(db, token, listSessions(db, token)[0].id);
    await assert.rejects(pending, { status: 401 });
    assert.ok(authorized(db, await loginOwner(db, password)));
  } finally {
    db.close();
  }
});
