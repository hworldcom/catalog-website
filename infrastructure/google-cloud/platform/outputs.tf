output "foundation_inventory" {
  description = "Non-secret platform inventory used by the checked-in inventory generator."
  value = {
    enabled_services = module.platform_services.enabled_services
    environment      = var.environment
    project          = module.project_contract.verified_project
    state_bucket     = var.state_bucket_name
    state_prefix     = "terraform/platform"
  }
}
