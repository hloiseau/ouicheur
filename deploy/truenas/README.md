# TrueNAS catalog candidate

The `ouicheur/` directory is prepared for `ix-dev/community/ouicheur/` in
https://github.com/truenas/apps. It uses rendering library **2.3.14**, inspected at
upstream commit `c988f4a626e1540c9849b6278780a7c1df00f3d3` on 28 September 2026.
Check the current library before submitting. The icon points to the real upstream
512 × 512 PNG; catalog maintainers can mirror it to their CDN.

The template exposes port 3000, a configurable host port, public origin, proxy
trust, UID/GID, separate data/backup storage, and CPU/memory limits. New ixVolumes
use the catalog's permission-init container. Existing host paths require explicit
permissions for the selected UID/GID. The application drops all capabilities and
does not require privileged mode, host networking or the Docker socket. The
temporary permission-init container is a separate catalog-managed exception.

The image reference is an existing tested commit tag, not a fabricated release.
It predates this proposal's license-packaging change. Before final submission,
publish the corrected numbered image and update `ix_values.yaml` and
`app_version`. No `latest` tag is assumed. Catalog metadata (`capabilities`,
`run_as_context`, hashes and `item.yaml`) must be regenerated with upstream tools;
the checked-in values here are initial input, not certified generated metadata.

## Validate in a checkout of truenas/apps

Copy `ouicheur/` into `ix-dev/community/ouicheur/`, then run with Docker available:

```sh
python .github/scripts/ci.py --app ouicheur --train community --test-file basic-values.yaml --render-only=true
python .github/scripts/ci.py --app ouicheur --train community --test-file basic-values.yaml
python .github/scripts/ci.py --app ouicheur --train community --test-file host-path-values.yaml
```

The two scenarios cover default ixVolumes and preconfigured host paths with a
different UID/GID. They contain synthetic test paths, not paths to reuse on a NAS.
Local rendering with the upstream Python library is a useful preliminary check,
but does not replace these commands or testing on TrueNAS.

Before requesting merge, verify initial setup, persistence after restart, actual
Chromium imports under the selected UID, upgrade from the old image, backup and
restore onto empty storage. The 2 CPU / 2048 MiB defaults are initial settings,
not measured minimum requirements. The compatibility annotation is a proposed
Docker-era catalog baseline, not a claim of testing every TrueNAS release.

Source: https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md.
