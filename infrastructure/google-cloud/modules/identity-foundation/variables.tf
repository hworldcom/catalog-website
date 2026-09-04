variable "custom_roles" {
  description = "Reviewed project custom roles for the Terraform identity."
  type = map(object({
    role_id     = string
    title       = string
    description = string
    permissions = set(string)
  }))
}

variable "environment" {
  description = "Bazoria deployment environment."
  type        = string

  validation {
    condition     = contains(["uat", "production"], var.environment)
    error_message = "environment must be uat or production."
  }
}

variable "federation_providers" {
  description = "Reviewed GitHub workflow-specific federation providers."
  type = map(object({
    provider_id         = string
    deployment_role     = string
    service_account_key = string
    workflow_files      = set(string)
  }))
}

variable "github_accepted_events" {
  description = "GitHub event names accepted by both providers."
  type        = set(string)
}

variable "github_branch_ref" {
  description = "Exact GitHub branch reference trusted by federation."
  type        = string
}

variable "github_owner" {
  description = "Exact GitHub repository owner name."
  type        = string
}

variable "github_owner_id" {
  description = "Immutable numeric GitHub repository owner identifier."
  type        = string
}

variable "github_repository" {
  description = "Exact GitHub owner and repository name."
  type        = string
}

variable "github_repository_id" {
  description = "Immutable numeric GitHub repository identifier."
  type        = string
}

variable "project_id" {
  description = "Explicit Google Cloud project identifier."
  type        = string
}

variable "project_number" {
  description = "Numeric Google Cloud project number used in principal-set names."
  type        = string
}

variable "service_accounts" {
  description = "Reviewed service-account purposes and naming suffixes."
  type = map(object({
    suffix                  = string
    display_name            = string
    description             = string
    terraform_can_act_as    = bool
    can_act_as_task_invoker = bool
  }))
}

variable "terraform_project_roles" {
  description = "Exact predefined project roles granted to Terraform."
  type        = set(string)
}
