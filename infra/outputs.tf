output "api_ip" {
  value = vultr_reserved_ip.api.subnet
}

output "api_url" {
  value = "https://${replace(vultr_reserved_ip.api.subnet, ".", "-")}.sslip.io"
}

output "registry_urn" {
  description = "Registry address; push the image to <registry_urn>/kip:latest and set var.image to it."
  value       = vultr_container_registry.kip.urn
}
