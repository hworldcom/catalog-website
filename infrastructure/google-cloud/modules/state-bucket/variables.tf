variable "bootstrap_operator_principal" {
  description = "Reviewed direct break-glass principal for initial state access."
  type        = string

  validation {
    condition     = can(regex("^(user|group):[^[:space:]]+@[^[:space:]]+$", var.bootstrap_operator_principal))
    error_message = "bootstrap_operator_principal must be an explicit user: or group: email principal."
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

variable "project_id" {
  description = "Explicit project that owns the state bucket."
  type        = string
}

variable "region" {
  description = "Regional bucket location."
  type        = string
}

variable "state_bucket_name" {
  description = "Globally unique deterministic state bucket name."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "state_bucket_name must be a valid Google Cloud Storage bucket name."
  }
}
