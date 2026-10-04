import test from "node:test";
import assert from "node:assert/strict";
import {
  checkIndex,
  checkInventory,
  checkTag,
  checkImage,
} from "../scripts/publish-release.mjs";

test("release preflight rejects a wrong architecture, incomplete inventory or untested commit", () => {
  const manifests = ["amd64", "arm64"].map((architecture) => ({
    platform: { os: "linux", architecture },
    digest: `sha256:${"a".repeat(64)}`,
  }));
  checkIndex({ manifests });
  assert.throws(() => checkIndex({ manifests: manifests.slice(0, 1) }));
  assert.throws(() => checkIndex({ manifests: [manifests[0], manifests[0]] }));
  const inventory = {
    version: "1.2.0",
    revision: "a".repeat(40),
    architecture: "x64",
    platform: "linux",
    debian: [1],
    browsers: [1],
    browser_notices: [1],
    native: { libvips: { vips: "8.18.6" } },
  };
  checkInventory(inventory, "1.2.0", "a".repeat(40), "amd64");
  assert.throws(() =>
    checkInventory(inventory, "1.2.0", "b".repeat(40), "amd64"),
  );
  assert.throws(() =>
    checkInventory(inventory, "1.2.0", "a".repeat(40), "arm64"),
  );
  assert.throws(() =>
    checkInventory(
      { ...inventory, native: {} },
      "1.2.0",
      "a".repeat(40),
      "amd64",
    ),
  );
});

test("retry may reuse the identical tag and manifest but must never overwrite another release", () => {
  checkTag(undefined, "commit-a");
  checkTag("commit-a", "commit-a");
  assert.throws(() => checkTag("commit-a", "commit-b"));
  checkImage(undefined, "digest-a");
  checkImage("digest-a", "digest-a");
  assert.throws(() => checkImage("digest-a", "digest-b"));
});
