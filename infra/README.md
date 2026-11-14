# Infra

Terraform for Kip's server: a Vultr instance in London behind Caddy, its firewall, a private
container registry, and the MongoDB Atlas access entry for the instance's IP. Tiger Cloud is
passed in as a URI. Architecture and the deploy flow: `docs/ARCHITECTURE.md` ("Deploy").

## What it creates
| Resource | Notes |
|---|---|
| `vultr_ssh_key.team` | From `ssh_public_key_path` (default `~/.ssh/id_ed25519.pub`) |
| `vultr_container_registry.kip` | Private, plan `start_up`, in `region` |
| `vultr_firewall_group.api` + rules | 22 from `admin_ip` only; 80 and 443 open for Caddy |
| `vultr_reserved_ip.api` | Fixed IPv4, so the API URL survives `-replace` |
| `vultr_instance.api` | `vc2-2c-4gb`, Ubuntu 24.04 (`os_id` 2284), in `lhr`, on the reserved IP |
| `mongodbatlas_project_ip_access_list.api` | Allows the instance's IP into Atlas |

`cloud-init.yaml.tftpl` installs Docker, writes `/opt/kip/.env`, a Caddyfile and a compose file,
derives `<ip>.sslip.io` from instance metadata, logs in to the registry and starts the API, the
worker and Caddy. Outputs: `api_ip`, `api_url`, `registry_urn`.

## First apply
1. Credentials in your shell (from 1Password or the MLH emails, never committed):
   `VULTR_API_KEY`, `MONGODB_ATLAS_PUBLIC_KEY`, `MONGODB_ATLAS_PRIVATE_KEY`.
2. `cp terraform.tfvars.example terraform.tfvars` and fill it in (git-ignored).
3. Create the registry first, then push the image to it:
   ```bash
   terraform -chdir=infra init
   terraform -chdir=infra apply -target=vultr_container_registry.kip
   terraform -chdir=infra output registry_urn          # e.g. lhr.vultrcr.com/kip
   docker login <registry host>                        # registry credentials from the Vultr console
   docker build --platform linux/amd64 -t <registry_urn>/kip:latest .
   docker push <registry_urn>/kip:latest
   ```
   Set `image = "<registry_urn>/kip:latest"` and the registry credentials in `terraform.tfvars`.
   Check the template renders: `cd infra && ./scripts/check-cloud-init.sh` (needs Python YAML).
4. `terraform -chdir=infra apply`. Give cloud-init a few minutes, then open `api_url`.

## Ship a new build
```bash
docker build --platform linux/amd64 -t <registry_urn>/kip:latest . && docker push <registry_urn>/kip:latest
ssh root@$(terraform -chdir=infra output -raw api_ip) 'cd /opt/kip && docker compose pull && docker compose up -d'
```

## Rebuild the server live (demo)
```bash
terraform -chdir=infra plan
terraform -chdir=infra apply -replace=vultr_instance.api
```
This replaces only the instance. It comes back on the same reserved IP, so `api_url` and the iOS
build keep working, and the Atlas access entry stays valid. Data lives in Atlas and Tiger Cloud,
so it stays put; the API retries its database connections while the server boots.

## Still to confirm with a real key
- `region = "lhr"` and the `start_up` registry plan: `vultr-cli regions list`,
  `vultr-cli container-registry plans` (checked against the provider schema only).
- `urn` and `root_user` exist on `vultr_container_registry` (provider 2.33 schema). `urn` is used
  for the image address; registry login uses explicit variables because `root_user`'s map keys
  aren't documented in the schema.
