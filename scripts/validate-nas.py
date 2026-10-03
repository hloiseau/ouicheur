"""Preliminary TrueNAS rendering with an explicit upstream library checkout.

Usage: python scripts/validate-nas.py /path/to/truenas/apps/library/2.3.15
Requires the upstream Python dependencies and Jinja2. This does not replace the
catalog container validation or a real NAS installation.
"""
import copy
import importlib
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import xml.etree.ElementTree as ET

import jinja2
import yaml

root = Path(__file__).resolve().parents[1]
app = root / "deploy/truenas/ouicheur"
metadata = yaml.safe_load((app / "app.yaml").read_text())
if len(sys.argv) != 2:
    raise SystemExit(__doc__)
library = Path(sys.argv[1]).resolve()
if library.name != metadata["lib_version"]:
    raise SystemExit("Choose the library version declared in app.yaml")
hashes = yaml.safe_load((library.parent / "hashes.yaml").read_text())
assert hashes[library.name] == metadata["lib_version_hash"]
os.environ["FAKE_ENV"] = "1"
sys.path.insert(0, str(library))
renderer = importlib.import_module("render")
environment = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(app / "templates")),
    extensions=["jinja2.ext.do"],
    undefined=jinja2.StrictUndefined,
)
static = yaml.safe_load((app / "ix_values.yaml").read_text())
expected_image = ":".join(static["images"]["image"][k] for k in ["repository", "tag"])
xml = ET.parse(root / "templates/ouicheur.xml").getroot()
assert xml.findtext("Repository") == expected_image
assert xml.findtext("Privileged") == "false"
for file in sorted((app / "templates/test_values").glob("*.yaml")):
    values = copy.deepcopy(static)
    values.update(yaml.safe_load(file.read_text()))
    values["ix_context"] = {"app_metadata": metadata}
    output = json.loads(
        environment.get_template("docker-compose.yaml").render(
            values=values,
            ix_lib=SimpleNamespace(base=SimpleNamespace(render=renderer)),
        )
    )
    services = output["services"]
    service = services["ouicheur"]
    assert service["image"] == expected_image
    assert service["user"] == f'{values["run_as"]["user"]}:{values["run_as"]["group"]}'
    assert "ALL" in service["cap_drop"]
    assert not service.get("privileged", False)
    assert len(service["volumes"]) >= 2
    print(json.dumps({
        "case": file.name,
        "services": list(services),
        "user": service["user"],
        "ports": service.get("ports", []),
        "image": service["image"],
    }))
