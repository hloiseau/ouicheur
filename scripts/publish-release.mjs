import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const digest = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export function checkIndex(index) {
  assert.ok(
    Array.isArray(index.manifests),
    "A multi-architecture index is required",
  );
  assert.deepEqual(
    index.manifests
      .map((m) => `${m.platform?.os}/${m.platform?.architecture}`)
      .sort(),
    ["linux/amd64", "linux/arm64"],
    "Both tested Linux architectures must be present exactly once",
  );
  for (const m of index.manifests)
    assert.match(m.digest, /^sha256:[a-f0-9]{64}$/);
}

export function checkInventory(inventory, version, revision, arch) {
  assert.equal(inventory.version, version, "Inventory version differs");
  assert.equal(inventory.revision, revision, "Inventory commit differs");
  assert.equal(inventory.architecture, arch === "amd64" ? "x64" : "arm64");
  assert.equal(inventory.platform, "linux");
  assert.ok(
    inventory.debian?.length &&
      inventory.browsers?.length &&
      inventory.browser_notices?.length,
  );
  assert.ok(
    Object.values(inventory.native || {}).some((v) => v.vips),
    "Native inventory is missing",
  );
}

export function checkTag(existingSha, revision) {
  assert.ok(
    !existingSha || existingSha === revision,
    "Refusing to move an existing release tag",
  );
}

export function checkImage(existingDigest, sourceDigest) {
  assert.ok(
    !existingDigest || existingDigest === sourceDigest,
    "Refusing to replace a numbered image",
  );
}

export async function publish() {
  const {
    GITHUB_REPOSITORY: repo,
    GITHUB_SHA: revision,
    GITHUB_RUN_ID: runId,
    GH_TOKEN: token,
  } = process.env;
  assert.match(repo || "", /^[\w.-]+\/[\w.-]+$/);
  assert.match(revision || "", /^[a-f0-9]{40}$/);
  assert.match(runId || "", /^\d+$/);
  assert.ok(token, "GitHub Actions token is required");
  assert.equal(process.env.GITHUB_REF, "refs/heads/main");
  assert.ok(
    ["push", "workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME),
  );
  const { version } = JSON.parse(readFileSync("release-request.json", "utf8"));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  if (JSON.parse(readFileSync("package.json", "utf8")).version !== version) {
    console.log("No release requested for the current development version.");
    return;
  }
  const tag = `v${version}`;
  const base = `https://api.github.com/repos/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  async function api(path, method = "GET", body = undefined) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (method === "GET" && response.status === 404) return null;
    assert.ok(response.ok, `GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  let release;
  for (let page = 1; ; page++) {
    const entries = await api(`/releases?per_page=100&page=${page}`);
    release = entries.find((r) => r.tag_name === tag);
    if (release || entries.length < 100) break;
  }
  if (release && !release.draft) {
    console.log(
      `${tag} is already published; leaving its tag, images and assets unchanged.`,
    );
    return;
  }
  if (release)
    assert.equal(
      release.target_commitish,
      revision,
      "Resume a draft using its original workflow run",
    );

  const run = await api(`/actions/runs/${runId}`);
  assert.equal(run.head_sha, revision);
  assert.equal(run.head_branch, "main");
  assert.equal(run.path, ".github/workflows/ci.yml");
  const jobs = (await api(`/actions/runs/${runId}/jobs?per_page=100`)).jobs;
  for (const name of [
    "verify (ubuntu-24.04, amd64)",
    "verify (ubuntu-24.04-arm, arm64)",
    "PostgreSQL catalog contracts",
    "verify",
    "publish-manifest",
  ]) {
    assert.ok(
      jobs.some(
        (j) =>
          j.name === name &&
          j.status === "completed" &&
          j.conclusion === "success",
      ),
      `Required job did not pass: ${name}`,
    );
  }
  let ref = await api(`/git/ref/tags/${tag}`);
  let object = ref?.object;
  for (let i = 0; object?.type === "tag" && i < 5; i++)
    object = (await api(`/git/tags/${object.sha}`)).object;
  if (object) assert.equal(object.type, "commit");
  checkTag(object?.sha, revision);

  // Anonymous reads prove public availability, including both image configurations.
  const imageRepo = repo.toLowerCase();
  const image = `ghcr.io/${imageRepo}`;
  const auth = await fetch(
    `https://ghcr.io/token?${new URLSearchParams({ service: "ghcr.io", scope: `repository:${imageRepo}:pull` })}`,
    { signal: AbortSignal.timeout(30000) },
  );
  assert.ok(auth.ok, `Public registry authentication: HTTP ${auth.status}`);
  const registryToken = (await auth.json()).token;
  assert.ok(registryToken);
  async function registry(path, optional = false) {
    const response = await fetch(`https://ghcr.io/v2/${imageRepo}/${path}`, {
      headers: {
        Authorization: `Bearer ${registryToken}`,
        Accept:
          "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (optional && response.status === 404) return null;
    assert.ok(response.ok, `Public registry ${path}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    return { bytes, digest: digest(bytes), data: JSON.parse(bytes.toString()) };
  }
  const source = await registry(`manifests/sha-${revision}`);
  checkIndex(source.data);
  for (const manifest of source.data.manifests) {
    const child = await registry(`manifests/${manifest.digest}`);
    assert.equal(child.digest, manifest.digest);
    const config = await registry(`blobs/${child.data.config.digest}`);
    assert.equal(config.digest, child.data.config.digest);
    assert.equal(config.data.architecture, manifest.platform.architecture);
    assert.equal(
      config.data.config.Labels["org.opencontainers.image.revision"],
      revision,
    );
  }
  const numbered = await registry(`manifests/${version}`, true);
  checkImage(numbered?.digest, source.digest);

  const folder = mkdtempSync(join(tmpdir(), "ouicheur-release-"));
  try {
    const artifacts = (
      await api(`/actions/runs/${runId}/artifacts?per_page=100`)
    ).artifacts;
    const assets = [];
    for (const arch of ["amd64", "arm64"]) {
      const artifact = artifacts.find(
        (a) => a.name === `release-inventory-${arch}` && !a.expired,
      );
      assert.ok(artifact, `Missing ${arch} inventory`);
      assert.equal(artifact.workflow_run.head_sha, revision);
      const response = await fetch(
        `${base}/actions/artifacts/${artifact.id}/zip`,
        { headers, redirect: "manual", signal: AbortSignal.timeout(30000) },
      );
      let download = response;
      if (response.status === 302) {
        const location = new URL(response.headers.get("location"));
        assert.equal(location.protocol, "https:");
        // Do not forward the GitHub token to the signed artifact storage URL.
        download = await fetch(location, {
          signal: AbortSignal.timeout(60000),
        });
      }
      assert.ok(download.ok, `Inventory download: HTTP ${download.status}`);
      const bytes = Buffer.from(await download.arrayBuffer());
      const name = `release-inventory-${arch}.zip`;
      const path = join(folder, name);
      writeFileSync(path, bytes);
      checkInventory(
        JSON.parse(
          execFileSync("unzip", ["-p", path, "runtime-inventory.json"], {
            encoding: "utf8",
            maxBuffer: 8 * 1024 * 1024,
          }),
        ),
        version,
        revision,
        arch,
      );
      assets.push({ name, bytes });
    }
    assets.push({
      name: "release-proof.json",
      bytes: Buffer.from(
        JSON.stringify(
          {
            version,
            revision,
            image: `${image}:${version}`,
            digest: source.digest,
            ci: run.html_url,
            architectures: ["linux/amd64", "linux/arm64"],
            inventories: assets.map((a) => ({
              name: a.name,
              digest: digest(a.bytes),
            })),
          },
          null,
          2,
        ) + "\n",
      ),
    });
    assets.push({
      name: "SHA256SUMS",
      bytes: Buffer.from(
        assets.map((a) => `${digest(a.bytes).slice(7)}  ${a.name}\n`).join(""),
      ),
    });
    let notes = readFileSync(`docs/releases/${version}.md`, "utf8");
    notes = notes.replace(
      /\]\((\.\.?\/[^)]+)\)/g,
      (_, target) =>
        `](${new URL(target, `https://github.com/${repo}/blob/${tag}/docs/releases/`).href})`,
    );
    notes += `\n## Publication vérifiée\n\n- Commit : \`${revision}\`.\n- Image : \`${image}:${version}\`.\n- Digest : \`${source.digest}\`.\n- Architectures : Linux AMD64 et ARM64.\n- [CI et tests des images](${run.html_url}).\n\nL’image numérotée reprend exactement le manifeste et les inventaires vérifiés dans cette CI, sans reconstruction. Les essais NAS et limites restent décrits ci-dessus.\n`;

    // Every preflight has passed. Existing numbered images and tags are never moved.
    if (!numbered)
      execFileSync(
        "docker",
        [
          "buildx",
          "imagetools",
          "create",
          "--tag",
          `${image}:${version}`,
          `${image}@${source.digest}`,
        ],
        { stdio: "inherit" },
      );
    assert.equal(
      (await registry(`manifests/${version}`)).digest,
      source.digest,
    );
    if (!ref)
      await api("/git/refs", "POST", {
        ref: `refs/tags/${tag}`,
        sha: revision,
      });
    if (!release)
      release = await api("/releases", "POST", {
        tag_name: tag,
        target_commitish: revision,
        name: `Ouicheur ${version}`,
        body: notes,
        draft: true,
        prerelease: false,
      });
    const existingAssets = await api(
      `/releases/${release.id}/assets?per_page=100`,
    );
    for (const asset of assets) {
      const existing = existingAssets.find((a) => a.name === asset.name);
      if (existing) {
        assert.equal(
          existing.digest,
          digest(asset.bytes),
          `Existing release asset differs: ${asset.name}`,
        );
        continue;
      }
      const response = await fetch(
        `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?${new URLSearchParams({ name: asset.name })}`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          body: asset.bytes,
          signal: AbortSignal.timeout(60000),
        },
      );
      assert.ok(response.ok, `Upload ${asset.name}: HTTP ${response.status}`);
      assert.equal((await response.json()).digest, digest(asset.bytes));
    }
    const published = await api(`/releases/${release.id}`, "PATCH", {
      body: notes,
      draft: false,
      prerelease: false,
      make_latest: "true",
    });
    assert.equal(published.draft, false);
    console.log(`Published ${published.html_url}\n${image}@${source.digest}`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await publish();
