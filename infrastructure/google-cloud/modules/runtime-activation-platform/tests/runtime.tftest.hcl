mock_provider "google" {}

variables {
  artifact_repository_id = "bazoria-uat-containers"
  environment            = "uat"
  project_id             = "bazoria-uat-lnlabs"
  project_number         = "145571383840"
  region                 = "europe-west3"
  runtime_contract       = jsondecode(file("../../runtime-catalog.json"))
  runtime_configuration = {
    image_reference                      = "europe-west3-docker.pkg.dev/bazoria-uat-lnlabs/bazoria-uat-containers/bazoria-web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    release_commit                       = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    build_id                             = "terraform-test"
    supabase_url                         = "https://mekobnkujzpzeiwmecyy.supabase.co"
    supabase_publishable_key             = "sb_publishable_test"
    supabase_service_role_secret_version = "projects/bazoria-uat-lnlabs/secrets/bazoria-uat-supabase-service-role/versions/1"
    openai_api_key_secret_version        = "projects/bazoria-uat-lnlabs/secrets/bazoria-uat-openai-api-key/versions/1"
    canonical_origin                     = "https://uat2026.bazoria.pl"
    prototype_administrator_user_ids     = "00000000-0000-4000-8000-000000000001"
    description_generation_model         = "gpt-5.4-nano"
  }
  service_account_emails = {
    website        = "baz-uat-web@bazoria-uat-lnlabs.iam.gserviceaccount.com"
    worker         = "baz-uat-activation-worker@bazoria-uat-lnlabs.iam.gserviceaccount.com"
    reconciliation = "baz-uat-reconciliation@bazoria-uat-lnlabs.iam.gserviceaccount.com"
    task_invoker   = "baz-uat-task-invoker@bazoria-uat-lnlabs.iam.gserviceaccount.com"
    scheduler      = "baz-uat-scheduler@bazoria-uat-lnlabs.iam.gserviceaccount.com"
  }
  secret_ids = {
    openai_api_key        = "bazoria-uat-openai-api-key"
    supabase_service_role = "bazoria-uat-supabase-service-role"
  }
}

run "uat_runtime_plan_matches_reviewed_contract" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.website.ingress == "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
    error_message = "The website ingress differs."
  }

  assert {
    condition     = google_cloud_run_v2_service.website.template[0].scaling[0].min_instance_count == 0
    error_message = "UAT website minimum instances differ."
  }

  assert {
    condition     = google_cloud_run_v2_service.website.template[0].scaling[0].max_instance_count == 2
    error_message = "UAT website maximum instances differ."
  }

  assert {
    condition     = google_cloud_run_v2_service_iam_member.website_public.member == "allUsers"
    error_message = "The load-balancer-restricted website must permit anonymous invocation."
  }

  assert {
    condition     = google_cloud_run_v2_service.worker.ingress == "INGRESS_TRAFFIC_INTERNAL_ONLY"
    error_message = "The activation worker must use internal ingress."
  }

  assert {
    condition     = google_cloud_run_v2_service.worker.template[0].max_instance_request_concurrency == 1
    error_message = "The activation worker concurrency differs."
  }

  assert {
    condition     = google_cloud_run_v2_service_iam_member.worker_invoker.member == "serviceAccount:baz-uat-task-invoker@bazoria-uat-lnlabs.iam.gserviceaccount.com"
    error_message = "Only the matching task invoker may invoke the worker."
  }

  assert {
    condition     = google_cloud_run_v2_job.reconciliation.template[0].task_count == 1 && google_cloud_run_v2_job.reconciliation.template[0].parallelism == 1
    error_message = "The reconciliation job must remain single-task and sequential."
  }

  assert {
    condition     = google_cloud_tasks_queue.activation.rate_limits[0].max_concurrent_dispatches == 10
    error_message = "The queue concurrency differs."
  }

  assert {
    condition     = google_cloud_tasks_queue.activation.http_target[0].oidc_token[0].audience == "https://bazoria-uat-activation-worker-145571383840.europe-west3.run.app"
    error_message = "The queue audience must be the deterministic worker URL."
  }

  assert {
    condition     = google_cloud_tasks_queue.activation.http_target[0].uri_override[0].path_override[0].path == "/internal/tasks/activate-product-submission"
    error_message = "The queue target path differs."
  }

  assert {
    condition     = length(google_cloud_tasks_queue_iam_member.task_operators) == 4
    error_message = "Website and reconciliation must each receive queue-scoped create and read roles."
  }

  assert {
    condition     = !contains(values(google_cloud_tasks_queue_iam_member.task_operators)[*].member, "serviceAccount:baz-uat-activation-worker@bazoria-uat-lnlabs.iam.gserviceaccount.com")
    error_message = "The activation worker must not receive queue access."
  }

  assert {
    condition     = google_cloud_scheduler_job.reconciliation.http_target[0].uri == "https://run.googleapis.com/v2/projects/bazoria-uat-lnlabs/locations/europe-west3/jobs/bazoria-uat-activation-reconciliation:run"
    error_message = "The scheduler must invoke only the matching reconciliation job."
  }

  assert {
    condition     = output.runtime_inventory.worker.url == "https://bazoria-uat-activation-worker-145571383840.europe-west3.run.app"
    error_message = "The worker inventory URL differs."
  }
}

run "production_runtime_plan_matches_reviewed_contract" {
  command = plan

  variables {
    artifact_repository_id = "bazoria-prod-containers"
    environment            = "production"
    project_id             = "bazoria-prod-lnlabs"
    project_number         = "787649115343"
    runtime_configuration = {
      image_reference                      = "europe-west3-docker.pkg.dev/bazoria-prod-lnlabs/bazoria-prod-containers/bazoria-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      release_commit                       = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      build_id                             = "terraform-production-test"
      supabase_url                         = "https://njtgjrctfmtvackjmlww.supabase.co"
      supabase_publishable_key             = "sb_publishable_production_test"
      supabase_service_role_secret_version = "projects/bazoria-prod-lnlabs/secrets/bazoria-prod-supabase-service-role/versions/2"
      openai_api_key_secret_version        = "projects/bazoria-prod-lnlabs/secrets/bazoria-prod-openai-api-key/versions/2"
      canonical_origin                     = "https://bazoria.pl"
      prototype_administrator_user_ids     = "00000000-0000-4000-8000-000000000002"
      description_generation_model         = "gpt-5.4-nano"
    }
    service_account_emails = {
      website        = "baz-prod-web@bazoria-prod-lnlabs.iam.gserviceaccount.com"
      worker         = "baz-prod-activation-worker@bazoria-prod-lnlabs.iam.gserviceaccount.com"
      reconciliation = "baz-prod-reconciliation@bazoria-prod-lnlabs.iam.gserviceaccount.com"
      task_invoker   = "baz-prod-task-invoker@bazoria-prod-lnlabs.iam.gserviceaccount.com"
      scheduler      = "baz-prod-scheduler@bazoria-prod-lnlabs.iam.gserviceaccount.com"
    }
    secret_ids = {
      openai_api_key        = "bazoria-prod-openai-api-key"
      supabase_service_role = "bazoria-prod-supabase-service-role"
    }
  }

  assert {
    condition     = google_cloud_run_v2_service.website.name == "bazoria-prod-web"
    error_message = "The production website name differs."
  }

  assert {
    condition     = google_cloud_run_v2_service.website.template[0].scaling[0].min_instance_count == 1
    error_message = "The production website minimum instances differ."
  }

  assert {
    condition     = google_cloud_run_v2_service.website.template[0].scaling[0].max_instance_count == 3
    error_message = "The production website maximum instances differ."
  }

  assert {
    condition     = output.runtime_inventory.worker.url == "https://bazoria-prod-activation-worker-787649115343.europe-west3.run.app"
    error_message = "The production worker inventory URL differs."
  }

  assert {
    condition     = google_cloud_scheduler_job.reconciliation.name == "bazoria-prod-activation-reconciliation"
    error_message = "The production scheduler name differs."
  }
}

run "rejects_mutable_runtime_image" {
  command = plan

  variables {
    runtime_configuration = {
      image_reference                      = "europe-west3-docker.pkg.dev/bazoria-uat-lnlabs/bazoria-uat-containers/bazoria-web:latest"
      release_commit                       = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      build_id                             = "terraform-test"
      supabase_url                         = "https://mekobnkujzpzeiwmecyy.supabase.co"
      supabase_publishable_key             = "sb_publishable_test"
      supabase_service_role_secret_version = "projects/bazoria-uat-lnlabs/secrets/bazoria-uat-supabase-service-role/versions/1"
      openai_api_key_secret_version        = "projects/bazoria-uat-lnlabs/secrets/bazoria-uat-openai-api-key/versions/1"
      canonical_origin                     = "https://uat2026.bazoria.pl"
      prototype_administrator_user_ids     = ""
      description_generation_model         = "gpt-5.4-nano"
    }
  }

  expect_failures = [check.runtime_image]
}

run "rejects_cross_environment_runtime_configuration" {
  command = plan

  variables {
    runtime_configuration = {
      image_reference                      = "europe-west3-docker.pkg.dev/bazoria-prod-lnlabs/bazoria-prod-containers/bazoria-web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      release_commit                       = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      build_id                             = "terraform-test"
      supabase_url                         = "https://njtgjrctfmtvackjmlww.supabase.co"
      supabase_publishable_key             = "sb_publishable_test"
      supabase_service_role_secret_version = "projects/bazoria-prod-lnlabs/secrets/bazoria-prod-supabase-service-role/versions/1"
      openai_api_key_secret_version        = "projects/bazoria-prod-lnlabs/secrets/bazoria-prod-openai-api-key/versions/1"
      canonical_origin                     = "https://bazoria.pl"
      prototype_administrator_user_ids     = ""
      description_generation_model         = "gpt-5.4-nano"
    }
  }

  expect_failures = [
    check.runtime_image,
    check.runtime_public_configuration,
    check.supabase_secret_version,
    check.openai_secret_version,
  ]
}

run "rejects_latest_secret_versions" {
  command = plan

  variables {
    runtime_configuration = {
      image_reference                      = "europe-west3-docker.pkg.dev/bazoria-uat-lnlabs/bazoria-uat-containers/bazoria-web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      release_commit                       = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      build_id                             = "terraform-test"
      supabase_url                         = "https://mekobnkujzpzeiwmecyy.supabase.co"
      supabase_publishable_key             = "sb_publishable_test"
      supabase_service_role_secret_version = "projects/bazoria-uat-lnlabs/secrets/bazoria-uat-supabase-service-role/versions/latest"
      openai_api_key_secret_version        = "projects/bazoria-uat-lnlabs/secrets/bazoria-uat-openai-api-key/versions/latest"
      canonical_origin                     = "https://uat2026.bazoria.pl"
      prototype_administrator_user_ids     = ""
      description_generation_model         = "gpt-5.4-nano"
    }
  }

  expect_failures = [
    check.supabase_secret_version,
    check.openai_secret_version,
  ]
}
