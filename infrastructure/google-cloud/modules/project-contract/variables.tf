variable "billing_account_id" {
  description = "Expected billing account identifier without the billingAccounts/ prefix."
  type        = string

  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account_id))
    error_message = "billing_account_id must use the Google Cloud billing account format."
  }
}

variable "environment" {
  description = "Bazoria deployment environment."
  type        = string

  validation {
    condition     = contains(["uat", "production"], var.environment)
    error_message = "environment must be uat or production."
  }
}

variable "organization_id" {
  description = "Expected Google Cloud organization identifier."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.organization_id))
    error_message = "organization_id must contain digits only."
  }
}

variable "project_id" {
  description = "Explicit Google Cloud project identifier."
  type        = string

  validation {
    condition     = var.project_id != "catalog-classifier" && can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid non-legacy Google Cloud project identifier."
  }
}

variable "project_number" {
  description = "Expected numeric Google Cloud project number."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.project_number))
    error_message = "project_number must contain digits only."
  }
}

variable "region" {
  description = "Google Cloud region fixed for this release."
  type        = string

  validation {
    condition     = var.region == "europe-west3"
    error_message = "region must be europe-west3 for this release."
  }
}
