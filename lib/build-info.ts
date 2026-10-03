import packageInfo from "../package.json" with { type: "json" };

// Public build metadata, never derived from instance data.
const revision = process.env.NEXT_PUBLIC_BUILD_REVISION || "";
export const buildInfo = {
  version: packageInfo.version,
  revision: /^[a-f0-9]{40}$/.test(revision) ? revision : "local",
};
