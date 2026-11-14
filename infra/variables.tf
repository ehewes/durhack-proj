variable "region" {
  description = "Vultr region; lhr is London. Confirm with `vultr-cli regions list`."
  type        = string
  default     = "lhr"
}

variable "admin_ip" {
  description = "Your public IPv4, the only address allowed to SSH in."
  type        = string
}

variable "ssh_public_key_path" {
  type    = string
  default = "~/.ssh/id_ed25519.pub"
}

variable "atlas_project_id" {
  type = string
}

variable "image" {
  description = "Full image reference in the Vultr registry, e.g. <registry host>/kip/kip:latest (Vultr console shows the host)."
  type        = string
}

variable "registry_user" {
  type      = string
  sensitive = true
}

variable "registry_password" {
  type      = string
  sensitive = true
}

variable "mongo_uri" {
  type      = string
  sensitive = true
}

variable "tiger_uri" {
  type      = string
  sensitive = true
}

variable "app_env" {
  description = "Other API secrets (GEMINI_API_KEY, ELEVENLABS_API_KEY, ...), written to the server's .env."
  type        = map(string)
  default     = {}
  sensitive   = true
}
