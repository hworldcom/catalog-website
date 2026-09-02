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
