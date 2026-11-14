output "api_ip" {
  value = vultr_instance.api.main_ip
}

output "api_url" {
  value = "https://${replace(vultr_instance.api.main_ip, ".", "-")}.sslip.io"
}
