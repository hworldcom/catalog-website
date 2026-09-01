output "verified_project" {
  description = "Verified non-secret project inventory."
  value       = terraform_data.verified_project.output
}
