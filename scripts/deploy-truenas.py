#!/usr/bin/python3
"""Install as /root/ouicheur/deploy.py. Only updates the Ouicheur custom app."""
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

APP = "ouicheur"
IMAGE_PREFIX = "ghcr.io/hloiseau/ouicheur@sha256:"


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def deployment_config(config, image):
    if not re.fullmatch(re.escape(IMAGE_PREFIX) + r"[a-f0-9]{64}", image):
        raise ValueError("Expected a verified Ouicheur image digest")
    if set(config.get("services", {})) != {APP}:
        raise ValueError("Refusing to update anything other than the Ouicheur service")
    updated = json.loads(json.dumps(config))
    updated["services"][APP]["image"] = image
    return updated


def main(image):
    config = json.loads(run("/usr/bin/midclt", "call", "app.config", APP))
    updated = deployment_config(config, image)
    # Download first: a registry failure must not interrupt the running app.
    run("/usr/bin/docker", "pull", image)
    containers = run(
        "/usr/bin/docker", "ps", "-q",
        "--filter", "label=com.docker.compose.project=ix-ouicheur",
        "--filter", "label=com.docker.compose.service=ouicheur",
    ).splitlines()
    if len(containers) != 1:
        raise RuntimeError("Expected one running Ouicheur container before backup")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = f"/app/backups/pre-deploy-{stamp}"
    run("/usr/bin/docker", "exec", containers[0], "node", "scripts/manage.ts", "backup", backup)
    Path(f"/root/ouicheur/compose-{stamp}.json").write_text(json.dumps(config, indent=2))
    print(f"Backup completed: {backup}", flush=True)
    run("/usr/bin/midclt", "call", "-job", "app.update", APP,
        json.dumps({"custom_compose_config": updated}))
    for _ in range(60):
        container = run(
            "/usr/bin/docker", "ps", "-q",
            "--filter", "label=com.docker.compose.project=ix-ouicheur",
            "--filter", "label=com.docker.compose.service=ouicheur",
        )
        if container:
            status = json.loads(run("/usr/bin/docker", "inspect", container))[0]
            if status["Config"]["Image"] == image and status["State"].get("Health", {}).get("Status") == "healthy":
                print(f"Deployed {image}")
                return
        time.sleep(2)
    raise RuntimeError(f"Ouicheur did not become healthy. Keep backup {backup}; inspect app logs before restoring.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: deploy.py ghcr.io/hloiseau/ouicheur@sha256:DIGEST")
    main(sys.argv[1])
