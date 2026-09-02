output "foundation_inventory" {
  description = "Non-secret bootstrap inventory used by the checked-in inventory generator."
  value = {
    artifact_registry_audit_logging = {
      log_types = ["DATA_WRITE"]
      project   = var.project_id
      service   = google_project_iam_audit_config.artifact_registry_data_write.service
    }
    direct_state_bindings   = module.state_bucket.direct_bindings
    direct_state_principals = module.state_bucket.direct_principals
    enabled_services        = module.bootstrap_services.enabled_services
    environment             = var.environment
    identity = {
      custom_roles     = module.identity_foundation.custom_roles
      federation       = module.identity_foundation.federation
      service_accounts = module.identity_foundation.service_accounts
    }
    project      = module.project_contract.verified_project
    state_bucket = module.state_bucket.bucket_name
    state_prefix = "terraform/bootstrap"
  }
}
