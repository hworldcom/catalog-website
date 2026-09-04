mock_provider "google" {}

variables {
  alerting_enabled           = true
  canonical_origin           = "https://uat2026.bazoria.pl"
  environment                = "uat"
  expected_canonical_origin  = "https://uat2026.bazoria.pl"
  monitoring_contract        = jsondecode(file("../../monitoring-catalog.json"))
  notification_channel_names = ["projects/bazoria-uat-lnlabs/notificationChannels/123456"]
  project_id                 = "bazoria-uat-lnlabs"
  reconciliation_job_name    = "bazoria-uat-activation-reconciliation"
  region                     = "europe-west3"
  website_service_name       = "bazoria-uat-web"
  worker_service_name        = "bazoria-uat-activation-worker"
}

run "uat_monitoring_matches_the_reviewed_contract" {
  command = plan

  assert {
    condition     = google_logging_metric.worker_errors.name == "bazoria-uat-activation-worker-errors"
    error_message = "The worker error metric must use the exact environment-isolated name."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.log_counter) == 4
    error_message = "The four reviewed counter alert policies must exist."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.pending_age) == 2
    error_message = "The warning and critical durable-age policies must exist."
  }

  assert {
    condition     = google_logging_metric.pending_age.metric_descriptor[0].value_type == "DISTRIBUTION"
    error_message = "The pending-age metric must use a distribution value type for its value extractor."
  }

  assert {
    condition     = length(google_monitoring_uptime_check_config.public) == 2
    error_message = "The public health and catalog uptime checks must exist."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.uptime) == 2
    error_message = "Each public uptime check must have its own critical policy."
  }

  assert {
    condition = (
      google_monitoring_uptime_check_config.public["health"].http_check[0].path == "/healthz" &&
      google_monitoring_uptime_check_config.public["health"].http_check[0].accepted_response_status_codes[0].status_value == 204 &&
      length(google_monitoring_uptime_check_config.public["health"].content_matchers) == 0
    )
    error_message = "The health check must require exactly HTTP 204 without content matching."
  }

  assert {
    condition = (
      google_monitoring_uptime_check_config.public["catalog"].http_check[0].path == "/?lang=EN&audience=women" &&
      google_monitoring_uptime_check_config.public["catalog"].http_check[0].accepted_response_status_codes[0].status_value == 200 &&
      google_monitoring_uptime_check_config.public["catalog"].content_matchers[0].content == "bazoria-public-catalog-v1"
    )
    error_message = "The catalog check must require the exact public route, status, and bounded marker."
  }

  assert {
    condition = (
      google_monitoring_alert_policy.website_5xx.conditions[0].condition_threshold[0].threshold_value == 0.05 &&
      google_monitoring_alert_policy.website_5xx.conditions[1].condition_threshold[0].threshold_value == 19 &&
      strcontains(google_monitoring_alert_policy.website_5xx.conditions[0].condition_threshold[0].filter, "metric.label.response_code_class=\"5xx\"") &&
      google_monitoring_alert_policy.website_5xx.combiner == "AND_WITH_MATCHING_RESOURCE"
    )
    error_message = "The website ratio and minimum-volume contract must stay resource-matched."
  }

  assert {
    condition = (
      google_monitoring_alert_policy.pending_age["warning"].conditions[0].condition_threshold[0].threshold_value == 300000 &&
      google_monitoring_alert_policy.pending_age["critical"].conditions[0].condition_threshold[0].threshold_value == 900000
    )
    error_message = "Durable pending warning and critical thresholds differ."
  }

  assert {
    condition = (
      google_monitoring_alert_policy.reconciliation_heartbeat.conditions[0].condition_absent[0].duration == "300s" &&
      google_monitoring_alert_policy.uptime["health"].conditions[0].condition_threshold[0].duration == "120s"
    )
    error_message = "Heartbeat and consecutive uptime failure windows differ."
  }

  assert {
    condition = alltrue([
      for check in values(google_monitoring_uptime_check_config.public) :
      check.monitored_resource[0].labels.host == "uat2026.bazoria.pl" &&
      check.http_check[0].use_ssl &&
      check.http_check[0].validate_ssl
    ])
    error_message = "Uptime checks must target only the canonical validated HTTPS hostname."
  }
}

run "production_monitoring_uses_only_the_production_origin_and_resources" {
  command = plan

  variables {
    canonical_origin           = "https://bazoria.pl"
    environment                = "production"
    expected_canonical_origin  = "https://bazoria.pl"
    notification_channel_names = ["projects/bazoria-prod-lnlabs/notificationChannels/654321"]
    project_id                 = "bazoria-prod-lnlabs"
    reconciliation_job_name    = "bazoria-prod-activation-reconciliation"
    website_service_name       = "bazoria-prod-web"
    worker_service_name        = "bazoria-prod-activation-worker"
  }

  assert {
    condition = alltrue([
      for check in values(google_monitoring_uptime_check_config.public) :
      check.monitored_resource[0].labels.host == "bazoria.pl" &&
      check.monitored_resource[0].labels.project_id == "bazoria-prod-lnlabs"
    ])
    error_message = "Production uptime checks must not reference UAT."
  }

  assert {
    condition = (
      strcontains(google_logging_metric.worker_errors.filter, "bazoria-prod-activation-worker") &&
      !strcontains(google_logging_metric.worker_errors.filter, "bazoria-uat")
    )
    error_message = "Production worker metrics must not reference UAT."
  }
}

run "rejects_cross_project_notification_channel" {
  command = plan

  variables {
    notification_channel_names = ["projects/bazoria-prod-lnlabs/notificationChannels/123456"]
  }

  expect_failures = [check.notification_channels]
}

run "rejects_empty_notification_channels" {
  command = plan

  variables {
    notification_channel_names = []
  }

  expect_failures = [check.notification_channels]
}

run "rejects_a_direct_cloud_run_origin" {
  command = plan

  variables {
    canonical_origin          = "https://bazoria-uat-web-145571383840.europe-west3.run.app"
    expected_canonical_origin = "https://bazoria-uat-web-145571383840.europe-west3.run.app"
  }

  expect_failures = [check.canonical_origin]
}
