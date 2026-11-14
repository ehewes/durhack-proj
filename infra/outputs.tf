output "api_ip" {
  value = vultr_instance.api.main_ip
}

output "api_url" {
  value = "https://${replace(vultr_instance.api.main_ip, ".", "-")}.sslip.io"
}

output "registry_urn" {
  description = "Registry address; push the image to <registry_urn>/kip:latest and set var.image to it."
  value       = vultr_container_registry.kip.urn
}
