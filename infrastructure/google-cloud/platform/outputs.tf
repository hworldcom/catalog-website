output "foundation_inventory" {
  description = "Non-secret platform inventory used by the checked-in inventory generator."
  value = {
    artifact_repository = merge(module.artifact_registry_foundation.repository, {
      inherited_cloud_run_service_agent = {
        principal = "serviceAccount:service-${var.project_number}@serverless-robot-prod.iam.gserviceaccount.com"
        role      = local.artifact_catalog.inheritedServiceAgentRole
        scope     = "projects/${var.project_id}"
      }
      reserved_runtime_image_paths = local.artifact_catalog.reservedRuntimeImagePaths
    })
    enabled_services  = module.platform_services.enabled_services
    environment       = var.environment
    project           = module.project_contract.verified_project
    secret_containers = module.secret_foundation.secret_containers
    state_bucket      = var.state_bucket_name
    state_prefix      = "terraform/platform"
  }
}
