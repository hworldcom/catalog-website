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

variable "cleanup" {
  description = "Reviewed cleanup policy values for the two reserved Artifact Registry packages."
  type = object({
    application_package                = string
    application_retention_days         = number
    keep_recent_version_count          = number
    permission_smoke_package           = string
    permission_smoke_retention_days    = number
    permission_smoke_tag_prefix        = string
    policy_ids                         = map(string)
    protected_application_tag_prefixes = list(string)
  })

  validation {
    condition = (
      var.cleanup.application_package == "bazoria-web" &&
      var.cleanup.application_retention_days == (var.environment == "production" ? 30 : 14) &&
      var.cleanup.keep_recent_version_count == 5 &&
      var.cleanup.permission_smoke_package == "permission-smoke" &&
      var.cleanup.permission_smoke_retention_days == 7 &&
      var.cleanup.permission_smoke_tag_prefix == "latest" &&
      jsonencode(var.cleanup.policy_ids) == jsonencode({
        deleteApplicationByAge          = "delete-bazoria-web-by-age"
        deleteSupersededPermissionSmoke = "delete-superseded-permission-smoke"
        keepPermissionSmokeLatest       = "keep-permission-smoke-latest"
        keepProtectedApplicationTags    = "keep-bazoria-web-protected-tags"
        keepRecentApplicationVersions   = "keep-recent-bazoria-web"
      }) &&
      jsonencode(var.cleanup.protected_application_tag_prefixes) == jsonencode([
        "deployed-",
        "rollback-",
        "promotion-eligible-",
      ])
    )
    error_message = "Artifact Registry cleanup must match the five reviewed package, tag, age, and recent-version policies."
  }
}

variable "cleanup_policy_dry_run" {
  description = "Whether Artifact Registry reports cleanup candidates without deleting them."
  type        = bool
}

variable "region" {
  description = "Single regional Artifact Registry location."
  type        = string

  validation {
    condition     = var.region == "europe-west3"
    error_message = "Artifact Registry must remain in europe-west3."
  }
}

variable "repository" {
  description = "Reviewed private repository metadata and direct access principals."
  type = object({
    format         = string
    immutable_tags = bool
    mode           = string
    purpose_label  = string
    reader_members = set(string)
    repository_id  = string
    writer_members = set(string)
  })

  validation {
    condition = (
      var.repository.format == "DOCKER" &&
      var.repository.mode == "STANDARD_REPOSITORY" &&
      var.repository.immutable_tags == false
    )
    error_message = "The repository must be a standard Docker repository with mutable release tags."
  }
}
