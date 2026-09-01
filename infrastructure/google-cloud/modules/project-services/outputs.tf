output "enabled_services" {
  description = "Sorted API service inventory."
  value       = sort(keys(google_project_service.enabled))
}

output "services_retained_on_destroy" {
  description = "Whether every managed API remains enabled when removed from state."
  value       = alltrue([for service in google_project_service.enabled : !service.disable_on_destroy])
}
