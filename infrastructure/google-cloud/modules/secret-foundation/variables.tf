variable "environment" {
  description = "Bazoria deployment environment used in resource labels."
  type        = string

  validation {
    condition     = contains(["uat", "production"], var.environment)
    error_message = "environment must be uat or production."
  }
}

variable "project_id" {
  description = "Explicit Google Cloud project identifier."
  type        = string
}

variable "region" {
  description = "Single user-managed secret replication region."
  type        = string

  validation {
    condition     = var.region == "europe-west3"
    error_message = "secret replication must remain in europe-west3."
  }
}

variable "secrets" {
  description = "Reviewed non-secret container metadata and accessor principals."
  type = map(object({
    accessor_members = set(string)
    purpose_label    = string
    secret_id        = string
  }))
}
