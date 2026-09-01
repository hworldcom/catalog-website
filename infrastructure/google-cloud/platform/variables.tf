variable "billing_account_id" {
  description = "Expected billing account identifier."
  type        = string
}

variable "environment" {
  description = "Bazoria deployment environment."
  type        = string
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
  description = "Environment state bucket created by bootstrap."
  type        = string
}
