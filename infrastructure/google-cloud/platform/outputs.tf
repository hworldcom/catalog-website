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

output "runtime_inventory" {
  description = "Non-secret runtime inventory, or null before the first digest-bound release."
  value       = try(module.runtime_activation_platform["enabled"].runtime_inventory, null)
}

output "edge_inventory" {
  description = "Non-secret load-balancer and DNS inventory, or null before a digest-bound release."
  value       = try(module.custom_domain_load_balancer["enabled"].edge_inventory, null)
}

output "monitoring_inventory" {
  description = "Non-secret metrics, alerts, checks, and notification-channel resource names, or null before activation."
  value       = try(module.operational_monitoring["enabled"].monitoring_inventory, null)
}
