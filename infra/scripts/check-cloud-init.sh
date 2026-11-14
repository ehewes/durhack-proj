#!/usr/bin/env bash
# Renders cloud-init.yaml.tftpl with sample values (including app_env) and checks it is valid
# YAML with the files cloud-init needs. `terraform validate` can't catch template mistakes.
# Run from infra/ after `terraform init`.
set -euo pipefail
rendered=$(printf '%s\n' 'templatefile("cloud-init.yaml.tftpl", { image = "registry.example/kip/kip:latest", registry_host = "registry.example", registry_user = "user", registry_password = "pass", mongo_uri = "mongodb://m", tiger_uri = "postgres://t", app_env = { GEMINI_API_KEY = "g", ELEVENLABS_API_KEY = "e" } })' | terraform console)
printf '%s\n' "$rendered" | sed '1d;$d' | python3 -c '
import sys, yaml
doc = yaml.safe_load(sys.stdin)
files = {f["path"]: f["content"] for f in doc["write_files"]}
env = files["/opt/kip/.env"].splitlines()
assert {"MONGO_URI=mongodb://m", "GEMINI_API_KEY=g", "ELEVENLABS_API_KEY=e"} <= set(env), env
assert "reverse_proxy api:8080" in files["/opt/kip/Caddyfile"]
assert yaml.safe_load(files["/opt/kip/compose.yaml"])["services"].keys() >= {"api", "worker", "caddy"}
print("cloud-init renders to valid YAML with", len(env), "env lines")
'
