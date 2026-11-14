resource "vultr_ssh_key" "team" {
  name    = "kip-team"
  ssh_key = trimspace(file(pathexpand(var.ssh_public_key_path)))
}

resource "vultr_container_registry" "kip" {
  name   = "kip"
  region = var.region
  plan   = "start_up" # confirm plans in the provider docs
  public = false
}

resource "vultr_firewall_group" "api" {
  description = "kip-api"
}

resource "vultr_firewall_rule" "ssh" {
  firewall_group_id = vultr_firewall_group.api.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = var.admin_ip
  subnet_size       = 32
  port              = "22"
}

resource "vultr_firewall_rule" "web" {
  for_each          = toset(["80", "443"]) # 80 for Caddy's certificate challenge
  firewall_group_id = vultr_firewall_group.api.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = each.value
}

# Survives `terraform apply -replace=vultr_instance.api`, so the sslip.io URL baked into the
# iOS build keeps working
resource "vultr_reserved_ip" "api" {
  label   = "kip-api"
  region  = var.region
  ip_type = "v4"
}

resource "vultr_instance" "api" {
  label             = "kip-api"
  region            = var.region
  plan              = "vc2-2c-4gb"
  os_id             = 2284 # Ubuntu 24.04
  ssh_key_ids       = [vultr_ssh_key.team.id]
  firewall_group_id = vultr_firewall_group.api.id
  reserved_ip_id    = vultr_reserved_ip.api.id

  # Installs Docker, writes .env and compose.yaml, derives an <ip>.sslip.io hostname for Caddy,
  # then pulls and runs the API, the worker and Caddy.
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    image             = var.image
    registry_host     = split("/", var.image)[0]
    registry_user     = var.registry_user
    registry_password = var.registry_password
    mongo_uri         = var.mongo_uri
    tiger_uri         = var.tiger_uri
    app_env           = var.app_env
  })
}

resource "mongodbatlas_project_ip_access_list" "api" {
  project_id = var.atlas_project_id
  ip_address = vultr_reserved_ip.api.subnet
  comment    = "kip-api"
}
