import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db";
import { initializeOwner, hashToken } from "../lib/auth";
import {
  inviteMember,
  acceptInvitation,
  updateMemberAccess,
  saveFamilyProfile,
  assignFamilyProfile,
} from "../lib/family";
import { saveList, listLists } from "../lib/lists";
import {
  createSuggestion,
  listSuggestions,
  manageSuggestion,
  acceptSuggestion,
} from "../lib/suggestions";
import {
  secretInbox,
  reviewSecretSuggestion,
  setSuggestionCoordinator,
} from "../lib/secret-suggestions";
import { listGifts } from "../lib/gifts";
const password = "secret-test-only-password";
async function fixture() {
  const db = openDatabase(":memory:");
  await initializeOwner(db, "Owner", password);
  saveList(db, {
    id: "default",
    name: "Surprises",
    visibility: "public",
    suggestions_enabled: true,
  });
  const i = inviteMember(db, {
    name: "Alex",
    login: "alex",
    lists: ["default"],
    confirm: true,
  });
  const token = await acceptInvitation(db, {
    token: i.token,
    password,
    confirmation: password,
  });
  setSuggestionCoordinator(db, {
    list_id: "default",
    member_id: i.id,
    confirm: true,
  });
  return { db, token, member: i.id };
}
const idea = {
  list_id: "default",
  title: "SECRET_CANARY",
  message: "private message",
  nickname: "Alex",
  recipient_visible: false,
};
test("secret suggestions stay out of owner inbox, gifts, audit and notifications; acceptance is private and idempotent", async () => {
  const { db, token } = await fixture();
  try {
    assert.equal(listLists(db)[0].secret_suggestions_available, true);
    const created = createSuggestion(db, idea);
    const rows = secretInbox(db, token);
    assert.equal(rows.length, 1);
    assert.equal(listSuggestions(db, {}).total, 0);
    assert.equal(listGifts(db, true).length, 0);
    assert.equal(
      JSON.stringify(db.prepare("SELECT * FROM audit").all()).includes(
        idea.title,
      ),
      false,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM notification_jobs").get()!.n,
      0,
    );
    assert.throws(
      () => acceptSuggestion(db, String(rows[0].id), {}),
      /introuvable/,
    );
    for (let n = 0; n < 2; n++)
      reviewSecretSuggestion(db, token, {
        id: rows[0].id,
        action: "accept",
        confirm: true,
      });
    reviewSecretSuggestion(db, token, {
      id: rows[0].id,
      action: "save",
      title: "Prêt en secret",
      note: "Do not export",
      prepared: true,
      confirm: true,
    });
    const status = manageSuggestion(db, {
      token: created.token,
      action: "status",
    });
    assert.ok("secret" in status && status.secret);
    assert.equal("plan_note" in status, false);
    assert.equal("prepared" in status, false);
    assert.equal(listGifts(db, true).length, 0);
    const rotated = manageSuggestion(db, {
      token: created.token,
      action: "rotate",
      confirm: true,
    });
    assert.ok("token" in rotated && typeof rotated.token === "string");
    assert.throws(
      () => manageSuggestion(db, { token: created.token, action: "status" }),
      /introuvable/,
    );
    manageSuggestion(db, {
      token: rotated.token,
      action: "delete",
      confirm: true,
    });
    assert.equal(secretInbox(db, token).length, 0);
  } finally {
    db.close();
  }
});
test("secret audience cannot become the recipient or be transferred when a coordinator changes", async () => {
  const { db, token, member } = await fixture();
  try {
    createSuggestion(db, idea);
    const id = String(secretInbox(db, token)[0].id);
    const other = inviteMember(db, {
      name: "Other",
      login: "other",
      lists: ["default"],
      confirm: true,
    });
    const otherToken = await acceptInvitation(db, {
      token: other.token,
      password,
      confirmation: password,
    });
    setSuggestionCoordinator(db, {
      list_id: "default",
      member_id: other.id,
      confirm: true,
    });
    assert.equal(secretInbox(db, otherToken).length, 0);
    assert.throws(
      () =>
        reviewSecretSuggestion(db, otherToken, {
          id,
          action: "accept",
          confirm: true,
        }),
      /introuvable/,
    );
    const profile = saveFamilyProfile(db, {
      name: "Recipient",
      kind: "adult",
      recipient: member,
    });
    assignFamilyProfile(db, {
      list_id: "default",
      profile_id: profile,
      confirm: true,
    });
    assert.equal(secretInbox(db, token).length, 0);
    assert.throws(
      () =>
        reviewSecretSuggestion(db, token, {
          id,
          action: "accept",
          confirm: true,
        }),
      /introuvable/,
    );
    assert.throws(
      () =>
        setSuggestionCoordinator(db, {
          list_id: "default",
          member_id: member,
          confirm: true,
        }),
      /différent du destinataire/,
    );
    updateMemberAccess(db, { id: other.id, action: "disable", confirm: true });
    assert.equal(listLists(db)[0].secret_suggestions_available, false);
    assert.throws(() => createSuggestion(db, idea), /Aucun coorganisateur/);
    assert.throws(() => secretInbox(db, otherToken), /Connexion/);
  } finally {
    db.close();
  }
});
