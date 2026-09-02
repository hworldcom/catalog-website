locals {
  environment_abbreviation = var.environment == "production" ? "prod" : "uat"
  resource_prefix          = "bazoria-${local.environment_abbreviation}"
  website_name             = "${local.resource_prefix}-${var.runtime_contract.resourceSuffixes.website}"
  worker_name              = "${local.resource_prefix}-${var.runtime_contract.resourceSuffixes.worker}"
  reconciliation_job_name  = "${local.resource_prefix}-${var.runtime_contract.resourceSuffixes.reconciliationJob}"
  activation_queue_name    = "${local.resource_prefix}-${var.runtime_contract.resourceSuffixes.activationQueue}"
  scheduler_name           = "${local.resource_prefix}-${var.runtime_contract.resourceSuffixes.reconciliationScheduler}"
  worker_url               = "https://${local.worker_name}-${var.project_number}.${var.region}.run.app"
  worker_host              = trimprefix(local.worker_url, "https://")
  resource_labels = {
    website = {
      environment   = var.environment
      service_role  = "web"
      managed_by    = "terraform"
      release_owner = "bazoria_web"
      purpose       = "website"
    }
    worker = {
      environment   = var.environment
      service_role  = "activation_worker"
      managed_by    = "terraform"
      release_owner = "bazoria_web"
      purpose       = "product-activation-worker"
    }
    reconciliation = {
      environment   = var.environment
      service_role  = "reconciliation"
      managed_by    = "terraform"
      release_owner = "bazoria_web"
      purpose       = "product-activation-reconciliation"
    }
  }

  supabase_secret_parts   = split("/", var.runtime_configuration.supabase_service_role_secret_version)
  openai_secret_parts     = split("/", var.runtime_configuration.openai_api_key_secret_version)
  supabase_secret_name    = try(join("/", slice(local.supabase_secret_parts, 0, 4)), "")
  supabase_secret_version = try(local.supabase_secret_parts[5], "")
  openai_secret_name      = try(join("/", slice(local.openai_secret_parts, 0, 4)), "")
  openai_secret_version   = try(local.openai_secret_parts[5], "")

  common_plain_environment = {
    BAZORIA_BUILD_ID               = var.runtime_configuration.build_id
    BAZORIA_DEPLOYMENT_ENVIRONMENT = var.environment
    BAZORIA_RELEASE_COMMIT         = var.runtime_configuration.release_commit
    SUPABASE_URL                   = var.runtime_configuration.supabase_url
  }
  publication_plain_environment = {
    BAZORIA_PRODUCT_PUBLICATION_MAXIMUM_IMAGE_COUNT     = tostring(var.runtime_contract.publication.maximumImageCount)
    BAZORIA_PRODUCT_PUBLICATION_ITEM_CONCURRENCY        = tostring(var.runtime_contract.publication.itemConcurrency)
    BAZORIA_PRODUCT_PUBLICATION_ITEM_TIMEOUT_SECONDS    = tostring(var.runtime_contract.publication.itemTimeoutSeconds)
    BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS = tostring(var.runtime_contract.publication.workerDeadlineSeconds)
    BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS   = tostring(var.runtime_contract.publication.claimTimeoutSeconds)
  }
  cloud_tasks_plain_environment = {
    BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE                   = "cloud_tasks"
    GOOGLE_CLOUD_PROJECT                                        = var.project_id
    BAZORIA_PRODUCT_PUBLICATION_TASK_LOCATION                   = var.region
    BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE                      = local.activation_queue_name
    BAZORIA_PRODUCT_PUBLICATION_WORKER_URL                      = local.worker_url
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT            = var.service_account_emails.task_invoker
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE                   = local.worker_url
    BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS  = tostring(var.runtime_contract.queue.dispatchDeadlineSeconds)
    BAZORIA_PRODUCT_PUBLICATION_TASK_CLIENT_TIMEOUT_SECONDS     = tostring(var.runtime_contract.publication.taskClientTimeoutSeconds)
    BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS = tostring(var.runtime_contract.queue.maximumRetryDurationSeconds)
  }
  website_plain_environment = merge(
    local.common_plain_environment,
    local.publication_plain_environment,
    local.cloud_tasks_plain_environment,
    {
      SUPABASE_PUBLISHABLE_KEY                   = var.runtime_configuration.supabase_publishable_key
      BAZORIA_PUBLIC_SITE_URL                    = var.runtime_configuration.canonical_origin
      BAZORIA_PROTOTYPE_ADMIN_USER_IDS           = var.runtime_configuration.prototype_administrator_user_ids
      BAZORIA_DESCRIPTION_GENERATION_MODEL       = var.runtime_configuration.description_generation_model
      BAZORIA_ADMIN_PRODUCT_DRAFTS_ENABLED       = "true"
      BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED = "false"
      BAZORIA_GOOGLE_SIGN_IN_ENABLED             = "false"
    },
  )
  worker_plain_environment = merge(
    local.common_plain_environment,
    local.publication_plain_environment,
    {
      BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE         = local.worker_url
      BAZORIA_PRODUCT_PUBLICATION_TASK_MAXIMUM_ATTEMPTS = tostring(var.runtime_contract.queue.maximumAttempts)
      BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT  = var.service_account_emails.task_invoker
      PORT                                              = "8080"
    },
  )
  reconciliation_plain_environment = merge(
    local.common_plain_environment,
    local.publication_plain_environment,
    local.cloud_tasks_plain_environment,
    {
      BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_BATCH_SIZE       = tostring(var.runtime_contract.reconciliation.batchSize)
      BAZORIA_PRODUCT_ACTIVATION_RECONCILIATION_DEADLINE_SECONDS = tostring(var.runtime_contract.reconciliation.applicationDeadlineSeconds)
    },
  )

  website_environment = merge(
    { for name, value in local.website_plain_environment : name => { value = value, secret = null, version = null } },
    {
      SUPABASE_SERVICE_ROLE_KEY = { value = null, secret = local.supabase_secret_name, version = local.supabase_secret_version }
      OPENAI_API_KEY            = { value = null, secret = local.openai_secret_name, version = local.openai_secret_version }
    },
  )
  worker_environment = merge(
    { for name, value in local.worker_plain_environment : name => { value = value, secret = null, version = null } },
    {
      SUPABASE_SERVICE_ROLE_KEY = { value = null, secret = local.supabase_secret_name, version = local.supabase_secret_version }
    },
  )
  reconciliation_environment = merge(
    { for name, value in local.reconciliation_plain_environment : name => { value = value, secret = null, version = null } },
    {
      SUPABASE_SERVICE_ROLE_KEY = { value = null, secret = local.supabase_secret_name, version = local.supabase_secret_version }
    },
  )

  task_operator_members = toset([
    "serviceAccount:${var.service_account_emails.website}",
    "serviceAccount:${var.service_account_emails.reconciliation}",
  ])
  task_operator_roles = toset([
    "roles/cloudtasks.enqueuer",
    "roles/cloudtasks.viewer",
  ])
  task_operator_bindings = {
    for pair in setproduct(local.task_operator_members, local.task_operator_roles) :
    "${pair[0]} ${pair[1]}" => { member = pair[0], role = pair[1] }
  }
}

check "runtime_catalog" {
  assert {
    condition = (
      var.runtime_contract.schemaVersion == 1 &&
      var.runtime_contract.region == var.region &&
      var.runtime_contract.imagePath == "bazoria-web"
    )
    error_message = "The runtime catalog differs from the reviewed contract."
  }
}

check "runtime_image" {
  assert {
    condition = can(regex(
      "^${var.region}-docker\\.pkg\\.dev/${var.project_id}/${var.artifact_repository_id}/${var.runtime_contract.imagePath}@sha256:[0-9a-f]{64}$",
      var.runtime_configuration.image_reference,
    ))
    error_message = "The runtime image must use the matching repository and an immutable lowercase sha256 digest."
  }
}

check "runtime_metadata" {
  assert {
    condition = (
      can(regex("^[0-9a-f]{40}$", var.runtime_configuration.release_commit)) &&
      can(regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$", var.runtime_configuration.build_id))
    )
    error_message = "Release commit or build identifier is invalid."
  }
}

check "runtime_public_configuration" {
  assert {
    condition = (
      var.runtime_configuration.supabase_url == var.runtime_contract.supabaseUrls[var.environment] &&
      var.runtime_configuration.canonical_origin == var.runtime_contract.canonicalOrigins[var.environment] &&
      var.runtime_configuration.description_generation_model == var.runtime_contract.descriptionGenerationModel &&
      trimspace(var.runtime_configuration.supabase_publishable_key) != ""
    )
    error_message = "The public runtime configuration does not match the selected environment."
  }
}

check "administrator_allowlist" {
  assert {
    condition = (
      var.runtime_configuration.prototype_administrator_user_ids == "" ||
      can(regex(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(,[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})*$",
        var.runtime_configuration.prototype_administrator_user_ids,
      ))
    )
    error_message = "Prototype administrator identifiers must be an empty value or comma-separated UUIDs without whitespace."
  }
}

check "supabase_secret_version" {
  assert {
    condition = (
      length(local.supabase_secret_parts) == 6 &&
      local.supabase_secret_name == "projects/${var.project_id}/secrets/${var.secret_ids.supabase_service_role}" &&
      local.supabase_secret_parts[4] == "versions" &&
      can(regex("^[1-9][0-9]*$", local.supabase_secret_version))
    )
    error_message = "The Supabase secret must use an explicit matching-project version resource name."
  }
}

check "openai_secret_version" {
  assert {
    condition = (
      length(local.openai_secret_parts) == 6 &&
      local.openai_secret_name == "projects/${var.project_id}/secrets/${var.secret_ids.openai_api_key}" &&
      local.openai_secret_parts[4] == "versions" &&
      can(regex("^[1-9][0-9]*$", local.openai_secret_version))
    )
    error_message = "The OpenAI secret must use an explicit matching-project version resource name."
  }
}

check "runtime_time_budgets" {
  assert {
    condition = (
      var.runtime_contract.publication.workerDeadlineSeconds + 30 <= var.runtime_contract.queue.dispatchDeadlineSeconds &&
      var.runtime_contract.queue.dispatchDeadlineSeconds + 30 <= var.runtime_contract.worker.timeoutSeconds &&
      var.runtime_contract.publication.workerDeadlineSeconds + 60 <= var.runtime_contract.publication.claimTimeoutSeconds &&
      var.runtime_contract.publication.claimTimeoutSeconds + 60 <= var.runtime_contract.queue.maximumRetryDurationSeconds &&
      var.runtime_contract.reconciliation.applicationDeadlineSeconds <= var.runtime_contract.reconciliation.timeoutSeconds
    )
    error_message = "Worker, claim, queue, or reconciliation time budgets are inconsistent."
  }
}

resource "google_cloud_run_v2_service" "website" {
  project             = var.project_id
  location            = var.region
  name                = local.website_name
  description         = "Public Bazoria ${var.environment} website."
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = true

  labels = local.resource_labels.website

  template {
    labels                           = local.resource_labels.website
    service_account                  = var.service_account_emails.website
    timeout                          = "${var.runtime_contract.website.timeoutSeconds}s"
    max_instance_request_concurrency = var.runtime_contract.website.concurrency

    scaling {
      min_instance_count = var.runtime_contract.website.minimumInstances[var.environment]
      max_instance_count = var.runtime_contract.website.maximumInstances[var.environment]
    }

    containers {
      name  = "website"
      image = var.runtime_configuration.image_reference

      ports {
        name           = "http1"
        container_port = 8080
      }

      resources {
        cpu_idle = true
        limits = {
          cpu    = var.runtime_contract.website.cpu
          memory = var.runtime_contract.website.memory
        }
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 2
        period_seconds        = 3
        failure_threshold     = 20

        http_get {
          path = var.runtime_contract.website.healthPath
          port = 8080
        }
      }

      liveness_probe {
        initial_delay_seconds = 5
        timeout_seconds       = 2
        period_seconds        = 10
        failure_threshold     = 3

        http_get {
          path = var.runtime_contract.website.healthPath
          port = 8080
        }
      }

      dynamic "env" {
        for_each = local.website_environment

        content {
          name  = env.key
          value = env.value.value

          dynamic "value_source" {
            for_each = env.value.secret == null ? [] : [env.value]

            content {
              secret_key_ref {
                secret  = value_source.value.secret
                version = value_source.value.version
              }
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "website_public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.website.location
  name     = google_cloud_run_v2_service.website.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service" "worker" {
  project             = var.project_id
  location            = var.region
  name                = local.worker_name
  description         = "Private Bazoria ${var.environment} product activation worker."
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = true

  labels = local.resource_labels.worker

  template {
    labels                           = local.resource_labels.worker
    service_account                  = var.service_account_emails.worker
    timeout                          = "${var.runtime_contract.worker.timeoutSeconds}s"
    max_instance_request_concurrency = var.runtime_contract.worker.concurrency

    scaling {
      min_instance_count = var.runtime_contract.worker.minimumInstances
      max_instance_count = var.runtime_contract.worker.maximumInstances
    }

    containers {
      name    = "activation-worker"
      image   = var.runtime_configuration.image_reference
      command = var.runtime_contract.worker.command
      args    = var.runtime_contract.worker.args

      ports {
        name           = "http1"
        container_port = 8080
      }

      resources {
        cpu_idle = true
        limits = {
          cpu    = var.runtime_contract.worker.cpu
          memory = var.runtime_contract.worker.memory
        }
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 2
        period_seconds        = 3
        failure_threshold     = 20

        http_get {
          path = var.runtime_contract.worker.healthPath
          port = 8080
        }
      }

      liveness_probe {
        initial_delay_seconds = 5
        timeout_seconds       = 2
        period_seconds        = 10
        failure_threshold     = 3

        http_get {
          path = var.runtime_contract.worker.healthPath
          port = 8080
        }
      }

      dynamic "env" {
        for_each = local.worker_environment

        content {
          name  = env.key
          value = env.value.value

          dynamic "value_source" {
            for_each = env.value.secret == null ? [] : [env.value]

            content {
              secret_key_ref {
                secret  = value_source.value.secret
                version = value_source.value.version
              }
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "worker_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.worker.location
  name     = google_cloud_run_v2_service.worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.service_account_emails.task_invoker}"
}

resource "google_cloud_run_v2_job" "reconciliation" {
  project             = var.project_id
  location            = var.region
  name                = local.reconciliation_job_name
  deletion_protection = true

  labels = local.resource_labels.reconciliation

  template {
    labels      = local.resource_labels.reconciliation
    task_count  = var.runtime_contract.reconciliation.taskCount
    parallelism = var.runtime_contract.reconciliation.parallelism

    template {
      service_account = var.service_account_emails.reconciliation
      timeout         = "${var.runtime_contract.reconciliation.timeoutSeconds}s"
      max_retries     = var.runtime_contract.reconciliation.executionRetries

      containers {
        name    = "activation-reconciliation"
        image   = var.runtime_configuration.image_reference
        command = var.runtime_contract.reconciliation.command
        args    = var.runtime_contract.reconciliation.args

        resources {
          limits = {
            cpu    = var.runtime_contract.reconciliation.cpu
            memory = var.runtime_contract.reconciliation.memory
          }
        }

        dynamic "env" {
          for_each = local.reconciliation_environment

          content {
            name  = env.key
            value = env.value.value

            dynamic "value_source" {
              for_each = env.value.secret == null ? [] : [env.value]

              content {
                secret_key_ref {
                  secret  = value_source.value.secret
                  version = value_source.value.version
                }
              }
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_job_iam_member" "reconciliation_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_job.reconciliation.location
  name     = google_cloud_run_v2_job.reconciliation.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.service_account_emails.scheduler}"
}

resource "google_cloud_tasks_queue" "activation" {
  project  = var.project_id
  location = var.region
  name     = local.activation_queue_name

  rate_limits {
    max_concurrent_dispatches = var.runtime_contract.queue.maximumConcurrentDispatches
    max_dispatches_per_second = var.runtime_contract.queue.maximumDispatchRate
  }

  retry_config {
    max_attempts       = var.runtime_contract.queue.maximumAttempts
    max_retry_duration = "${var.runtime_contract.queue.maximumRetryDurationSeconds}s"
    min_backoff        = "${var.runtime_contract.queue.minimumBackoffSeconds}s"
    max_backoff        = "${var.runtime_contract.queue.maximumBackoffSeconds}s"
  }

  http_target {
    http_method = "POST"

    oidc_token {
      service_account_email = var.service_account_emails.task_invoker
      audience              = local.worker_url
    }

    uri_override {
      scheme                    = "HTTPS"
      host                      = local.worker_host
      uri_override_enforce_mode = "ALWAYS"

      path_override {
        path = var.runtime_contract.queue.targetPath
      }
    }
  }
}

resource "google_cloud_tasks_queue_iam_member" "task_operators" {
  for_each = local.task_operator_bindings

  project  = var.project_id
  location = google_cloud_tasks_queue.activation.location
  name     = google_cloud_tasks_queue.activation.name
  role     = each.value.role
  member   = each.value.member
}

resource "google_cloud_scheduler_job" "reconciliation" {
  project          = var.project_id
  region           = var.region
  name             = local.scheduler_name
  description      = "Runs bounded Bazoria product activation reconciliation."
  schedule         = var.runtime_contract.scheduler.schedule
  time_zone        = var.runtime_contract.scheduler.timeZone
  attempt_deadline = "${var.runtime_contract.scheduler.attemptDeadlineSeconds}s"

  retry_config {
    retry_count          = var.runtime_contract.scheduler.retryCount
    max_retry_duration   = "${var.runtime_contract.scheduler.maximumRetryDurationSeconds}s"
    min_backoff_duration = "${var.runtime_contract.scheduler.minimumBackoffSeconds}s"
    max_backoff_duration = "${var.runtime_contract.scheduler.maximumBackoffSeconds}s"
    max_doublings        = 0
  }

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${local.reconciliation_job_name}:run"
    body        = base64encode("{}")
    headers = {
      "Content-Type" = "application/json"
    }

    oauth_token {
      service_account_email = var.service_account_emails.scheduler
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [google_cloud_run_v2_job_iam_member.reconciliation_invoker]
}
