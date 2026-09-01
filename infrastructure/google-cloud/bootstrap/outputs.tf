output "foundation_inventory" {
  description = "Non-secret bootstrap inventory used by the checked-in inventory generator."
  value = {
    direct_state_principals = module.state_bucket.direct_principals
    enabled_services        = module.bootstrap_services.enabled_services
    environment             = var.environment
    project                 = module.project_contract.verified_project
    state_bucket            = module.state_bucket.bucket_name
    state_prefix            = "terraform/bootstrap"
  }
}
