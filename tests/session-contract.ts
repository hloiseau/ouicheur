import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashPassword,
  hashToken,
  newSession,
  sessionLimit,
} from "../lib/session-credentials.ts";
import { sessionService, type SessionStore } from "../lib/session-service.ts";

export const sessionPassword = "contract-test-password";
export interface SessionFixture {
  store: SessionStore;
  logins: [string, string];
  disable(login: string): Promise<void>;
  reset(login: string, encoded: string): Promise<void>;
  expire(hash: string): Promise<void>;
  age(hash: string): Promise<void>;
  close(): Promise<void>;
}
export function sessionContract(
  name: string,
  fixture: () => Promise<SessionFixture>,
) {
  const scenario = (
    label: string,
    run: (
      f: SessionFixture,
      service: ReturnType<typeof sessionService>,
    ) => Promise<void>,
  ) => {
    test(`${name}: ${label}`, async () => {
      const f = await fixture();
      try {
        await run(f, sessionService(f.store));
      } finally {
        await f.close();
      }
    });
  };
  scenario(
    "accounts cannot revoke each other's sessions",
    async (f, service) => {
      const a = await service.login(f.logins[0], sessionPassword);
      const b = await service.login(f.logins[1], sessionPassword);
      assert.equal((await service.list(a)).length, 1);
      await assert.rejects(service.revoke(a, (await service.list(b))[0].id), {
        status: 404,
      });
      const a2 = await service.login(f.logins[0], sessionPassword);
      assert.deepEqual(await service.revoke(a, "others"), {
        signed_out: false,
      });
      await assert.rejects(service.list(a2), { status: 401 });
      assert.equal((await service.list(b)).length, 1);
      assert.deepEqual(await service.revoke(a, (await service.list(a))[0].id), {
        signed_out: true,
      });
      await assert.rejects(service.list(a), { status: 401 });
    },
  );
  scenario(
    "password rotation invalidates all prior sessions only for that account",
    async (f, service) => {
      const a = await service.login(f.logins[0], sessionPassword);
      const a2 = await service.login(f.logins[0], sessionPassword);
      const b = await service.login(f.logins[1], sessionPassword);
      await assert.rejects(
        service.changePassword(a, "wrong", "replacement-contract-password"),
        { status: 403 },
      );
      const replacement = await service.changePassword(
        a,
        sessionPassword,
        "replacement-contract-password",
      );
      for (const token of [a, a2])
        await assert.rejects(service.list(token), { status: 401 });
      assert.equal((await service.list(replacement)).length, 1);
      assert.equal((await service.list(b)).length, 1);
      await assert.rejects(service.login(f.logins[0], sessionPassword), {
        status: 401,
      });
      await service.login(f.logins[0], "replacement-contract-password");
    },
  );
  scenario(
    "summaries redact secrets; activity cannot extend expiry",
    async (f, service) => {
      const token = await service.login(
        f.logins[0],
        sessionPassword,
        "Firefox/155.0 Linux confidential-UA",
      );
      const before = (await service.list(token))[0];
      assert.equal(before.device, "Firefox · Linux");
      await f.age(hashToken(token));
      await service.touch(token);
      const after = (await service.list(token))[0];
      assert.equal(after.expires_at, before.expires_at);
      assert.ok(Date.parse(after.last_seen!) > 1);
      for (const secret of [
        token,
        hashToken(token),
        "confidential-UA",
        sessionPassword,
      ])
        assert.ok(!JSON.stringify(after).includes(secret));
      await f.expire(hashToken(token));
      await service.touch(token);
      await assert.rejects(service.list(token), { status: 401 });
      await assert.rejects(
        service.changePassword(
          token,
          sessionPassword,
          "replacement-contract-password",
        ),
        { status: 401 },
      );
    },
  );
  scenario(
    "stale password verification cannot resurrect login or overwrite a reset",
    async (f, service) => {
      const before = (await f.store.credential(f.logins[0]))!;
      const token = await service.login(f.logins[0], sessionPassword);
      const encoded = await hashPassword("replacement-contract-password");
      await f.reset(f.logins[0], encoded);
      assert.equal(await f.store.login(before, newSession().record), false);
      // A reset implementation may also revoke; either rejection is safe.
      assert.ok(
        ["changed", "expired"].includes(
          await f.store.change(
            hashToken(token),
            before,
            before.passwordHash,
            newSession().record,
          ),
        ),
      );
      await service.login(f.logins[0], "replacement-contract-password");
    },
  );
  scenario(
    "revocation and disable invalidate an already verified password change/login",
    async (f, service) => {
      const before = (await f.store.credential(f.logins[0]))!;
      const token = await service.login(f.logins[0], sessionPassword);
      await service.revoke(token, (await service.list(token))[0].id);
      assert.equal(
        await f.store.change(
          hashToken(token),
          before,
          before.passwordHash,
          newSession().record,
        ),
        "expired",
      );
      const other = await service.login(f.logins[1], sessionPassword);
      const member = (await f.store.credential(f.logins[1]))!;
      await f.disable(f.logins[1]);
      await assert.rejects(service.list(other), { status: 401 });
      assert.equal(await f.store.login(member, newSession().record), false);
      await assert.rejects(service.login(f.logins[1], sessionPassword), {
        status: 401,
      });
    },
  );
  scenario(
    "session cap keeps the newest session, including identical creation times",
    async (f, service) => {
      const before = (await f.store.credential(f.logins[0]))!;
      const now = Date.now();
      let newest = "";
      for (let i = 0; i < sessionLimit + 5; i++) {
        const next = newSession("", now);
        assert.equal(await f.store.login(before, next.record), true);
        newest = next.token;
      }
      assert.equal((await service.list(newest)).length, sessionLimit);
      for (const token of ["", "not-a-session", "f".repeat(64)])
        await assert.rejects(service.list(token), { status: 401 });
    },
  );
}
