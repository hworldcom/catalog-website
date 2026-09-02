variable "billing_account_id" {
  description = "Expected billing account identifier."
  type        = string
}

variable "bootstrap_operator_principal" {
  description = "Reviewed principal performing the initial bootstrap."
  type        = string
}

variable "environment" {
  description = "Bazoria deployment environment."
  type        = string
}

variable "github_owner" {
  description = "Reviewed GitHub repository owner."
  type        = string

  validation {
    condition     = var.github_owner == "hworldcom"
    error_message = "github_owner must be hworldcom."
  }
}

variable "github_owner_id" {
  description = "Immutable numeric GitHub owner identifier."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.github_owner_id))
    error_message = "github_owner_id must be numeric."
  }
}

variable "github_repository" {
  description = "Reviewed GitHub owner and repository."
  type        = string

  validation {
    condition     = var.github_repository == "hworldcom/catalog-website"
    error_message = "github_repository must be hworldcom/catalog-website."
  }
}

variable "github_repository_id" {
  description = "Immutable numeric GitHub repository identifier."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "github_repository_id must be numeric."
  }
}

variable "organization_id" {
  description = "Expected organization identifier."
  type        = string
}

variable "project_id" {
  description = "Explicit Google Cloud project identifier."
  type        = string
}

variable "project_number" {
  description = "Expected numeric project number."
  type        = string
}

variable "region" {
  description = "Google Cloud region."
  type        = string
}

variable "state_bucket_name" {
  description = "Deterministic environment state bucket name."
  type        = string
}
