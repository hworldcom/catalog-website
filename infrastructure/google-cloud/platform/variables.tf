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

variable "runtime_configuration" {
  description = "Optional explicit runtime activation; omitted until a real immutable release exists."
  type = object({
    image_reference                      = string
    release_commit                       = string
    build_id                             = string
    supabase_url                         = string
    supabase_publishable_key             = string
    supabase_service_role_secret_version = string
    openai_api_key_secret_version        = string
    canonical_origin                     = string
    prototype_administrator_user_ids     = string
    description_generation_model         = string
  })
  default = null
}

variable "state_bucket_name" {
  description = "Environment state bucket created by bootstrap."
  type        = string
}
