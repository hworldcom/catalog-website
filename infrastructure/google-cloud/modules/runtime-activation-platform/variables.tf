variable "artifact_repository_id" {
  description = "Matching private Artifact Registry repository identifier."
  type        = string
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
  description = "Explicit Google Cloud project identifier."
  type        = string
}

variable "project_number" {
  description = "Numeric project number used by deterministic Cloud Run URLs."
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]+$", var.project_number))
    error_message = "project_number must be numeric."
  }
}

variable "region" {
  description = "Single regional runtime location."
  type        = string

  validation {
    condition     = var.region == "europe-west3"
    error_message = "Runtime resources must remain in europe-west3."
  }
}

variable "runtime_configuration" {
  description = "Explicit non-secret runtime values and Secret Manager version resource names."
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
}

variable "runtime_contract" {
  description = "Reviewed resource, queue, scheduler, and application runtime contract."
  type = object({
    schemaVersion = number
    region        = string
    imagePath     = string
    resourceSuffixes = object({
      website                 = string
      worker                  = string
      reconciliationJob       = string
      activationQueue         = string
      reconciliationScheduler = string
    })
    website = object({
      cpu              = string
      memory           = string
      concurrency      = number
      minimumInstances = map(number)
      maximumInstances = map(number)
      timeoutSeconds   = number
      healthPath       = string
    })
    worker = object({
      cpu              = string
      memory           = string
      concurrency      = number
      minimumInstances = number
      maximumInstances = number
      timeoutSeconds   = number
      healthPath       = string
      command          = list(string)
      args             = list(string)
    })
    reconciliation = object({
      cpu                        = string
      memory                     = string
      taskCount                  = number
      parallelism                = number
      executionRetries           = number
      timeoutSeconds             = number
      applicationDeadlineSeconds = number
      batchSize                  = number
      command                    = list(string)
      args                       = list(string)
    })
    publication = object({
      maximumImageCount        = number
      itemConcurrency          = number
      itemTimeoutSeconds       = number
      workerDeadlineSeconds    = number
      claimTimeoutSeconds      = number
      taskClientTimeoutSeconds = number
    })
    queue = object({
      maximumConcurrentDispatches = number
      maximumDispatchRate         = number
      dispatchDeadlineSeconds     = number
      maximumRetryDurationSeconds = number
      maximumAttempts             = number
      minimumBackoffSeconds       = number
      maximumBackoffSeconds       = number
      targetPath                  = string
    })
    scheduler = object({
      schedule                    = string
      timeZone                    = string
      attemptDeadlineSeconds      = number
      retryCount                  = number
      maximumRetryDurationSeconds = number
      minimumBackoffSeconds       = number
      maximumBackoffSeconds       = number
    })
    supabaseUrls               = map(string)
    canonicalOrigins           = map(string)
    descriptionGenerationModel = string
  })
}

variable "service_account_emails" {
  description = "Existing matching-environment runtime and invocation service accounts."
  type = object({
    website        = string
    worker         = string
    reconciliation = string
    task_invoker   = string
    scheduler      = string
  })
}

variable "secret_ids" {
  description = "Existing matching-environment Secret Manager container identifiers."
  type = object({
    openai_api_key        = string
    supabase_service_role = string
  })
}
