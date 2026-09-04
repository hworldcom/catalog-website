locals {
  environment_abbreviation = var.environment == "production" ? "prod" : "uat"
  resource_prefix          = "bazoria-${local.environment_abbreviation}"
  canonical_hostname       = trimprefix(var.canonical_origin, "https://")
  labels = {
    environment   = var.environment
    service_role  = "observability"
    managed_by    = "terraform"
    release_owner = "bazoria_web"
  }

  worker_resource_filter = join(" AND ", [
    "resource.type=\"${var.monitoring_contract.workerErrors.resourceType}\"",
    "resource.labels.project_id=\"${var.project_id}\"",
    "resource.labels.location=\"${var.region}\"",
    "resource.labels.service_name=\"${var.worker_service_name}\"",
  ])
  reconciliation_resource_filter = join(" AND ", [
    "resource.type=\"${var.monitoring_contract.pendingAge.resourceType}\"",
    "resource.labels.project_id=\"${var.project_id}\"",
    "resource.labels.location=\"${var.region}\"",
    "resource.labels.job_name=\"${var.reconciliation_job_name}\"",
  ])
  website_metric_filter = join(" AND ", [
    "metric.type=\"${var.monitoring_contract.website5xx.metricType}\"",
    "resource.type=\"${var.monitoring_contract.website5xx.resourceType}\"",
    "resource.labels.project_id=\"${var.project_id}\"",
    "resource.labels.location=\"${var.region}\"",
    "resource.labels.service_name=\"${var.website_service_name}\"",
  ])
  website_5xx_metric_filter = join(" AND ", [
    local.website_metric_filter,
    "metric.label.response_code_class=\"${var.monitoring_contract.website5xx.responseCodeClass}\"",
  ])
  worker_metric_filter = join(" AND ", [
    "metric.type=\"logging.googleapis.com/user/${google_logging_metric.worker_errors.name}\"",
    local.worker_resource_filter,
  ])
  reconciliation_failure_metric_filter = join(" AND ", [
    "metric.type=\"logging.googleapis.com/user/${google_logging_metric.reconciliation_failures.name}\"",
    local.reconciliation_resource_filter,
  ])
  reconciliation_success_metric_filter = join(" AND ", [
    "metric.type=\"logging.googleapis.com/user/${google_logging_metric.reconciliation_successes.name}\"",
    local.reconciliation_resource_filter,
  ])
  retry_limit_metric_filter = join(" AND ", [
    "metric.type=\"logging.googleapis.com/user/${google_logging_metric.retry_limit.name}\"",
    local.worker_resource_filter,
  ])
  pending_age_metric_filter = join(" AND ", [
    "metric.type=\"logging.googleapis.com/user/${google_logging_metric.pending_age.name}\"",
    local.reconciliation_resource_filter,
  ])
  counter_policies = {
    worker_errors = {
      display_name        = "[${upper(var.environment)}] Product activation worker errors"
      condition_name      = "At least ${var.monitoring_contract.workerErrors.thresholdCount} worker errors in five minutes"
      filter              = local.worker_metric_filter
      threshold_exclusive = var.monitoring_contract.workerErrors.thresholdCount - 1
      window_seconds      = var.monitoring_contract.workerErrors.alignmentWindowSeconds
      severity            = var.monitoring_contract.workerErrors.severity
      group_by_fields = [
        "resource.label.project_id",
        "resource.label.location",
        "resource.label.service_name",
      ]
    }
    reconciliation_warning = {
      display_name        = "[${upper(var.environment)}] Product activation reconciliation failure"
      condition_name      = "At least one reconciliation failure in five minutes"
      filter              = local.reconciliation_failure_metric_filter
      threshold_exclusive = var.monitoring_contract.reconciliationFailures.warningThresholdCount - 1
      window_seconds      = var.monitoring_contract.reconciliationFailures.alignmentWindowSeconds
      severity            = var.monitoring_contract.reconciliationFailures.warningSeverity
      group_by_fields = [
        "resource.label.project_id",
        "resource.label.location",
        "resource.label.job_name",
      ]
    }
    reconciliation_critical = {
      display_name        = "[${upper(var.environment)}] Repeated product activation reconciliation failure"
      condition_name      = "At least two reconciliation failures in five minutes"
      filter              = local.reconciliation_failure_metric_filter
      threshold_exclusive = var.monitoring_contract.reconciliationFailures.criticalThresholdCount - 1
      window_seconds      = var.monitoring_contract.reconciliationFailures.alignmentWindowSeconds
      severity            = var.monitoring_contract.reconciliationFailures.criticalSeverity
      group_by_fields = [
        "resource.label.project_id",
        "resource.label.location",
        "resource.label.job_name",
      ]
    }
    retry_limit = {
      display_name        = "[${upper(var.environment)}] Product activation retry limit reached"
      condition_name      = "At least one unsuccessful final configured task attempt"
      filter              = local.retry_limit_metric_filter
      threshold_exclusive = var.monitoring_contract.retryLimit.thresholdCount - 1
      window_seconds      = var.monitoring_contract.retryLimit.alignmentWindowSeconds
      severity            = var.monitoring_contract.retryLimit.severity
      group_by_fields = [
        "resource.label.project_id",
        "resource.label.location",
        "resource.label.service_name",
      ]
    }
  }
  pending_age_policies = {
    warning = {
      display_name = "[${upper(var.environment)}] Product activation pending over five minutes"
      threshold    = var.monitoring_contract.pendingAge.warningThresholdMs
      severity     = var.monitoring_contract.pendingAge.warningSeverity
    }
    critical = {
      display_name = "[${upper(var.environment)}] Product activation pending over fifteen minutes"
      threshold    = var.monitoring_contract.pendingAge.criticalThresholdMs
      severity     = var.monitoring_contract.pendingAge.criticalSeverity
    }
  }
}

check "monitoring_catalog" {
  assert {
    condition = (
      var.monitoring_contract.schemaVersion == 1 &&
      var.monitoring_contract.notificationChannelSource == "terraform_input" &&
      var.monitoring_contract.website5xx.metricType == "run.googleapis.com/request_count" &&
      var.monitoring_contract.uptime.metricType == "monitoring.googleapis.com/uptime_check/check_passed" &&
      var.monitoring_contract.uptime.periodSeconds == 60 &&
      var.monitoring_contract.uptime.timeoutSeconds == 10 &&
      var.monitoring_contract.uptime.failureDurationSeconds == 120
    )
    error_message = "The monitoring catalog differs from the reviewed contract."
  }
}

check "canonical_origin" {
  assert {
    condition = (
      var.canonical_origin == var.expected_canonical_origin &&
      !endswith(local.canonical_hostname, ".run.app") &&
      can(regex(
        "^https://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$",
        var.canonical_origin,
      ))
    )
    error_message = "The monitoring origin must be an exact public HTTPS hostname."
  }
}

check "notification_channels" {
  assert {
    condition = (
      length(var.notification_channel_names) > 0 &&
      length(toset(var.notification_channel_names)) == length(var.notification_channel_names) &&
      alltrue([
        for channel in var.notification_channel_names : can(regex(
          "^projects/${var.project_id}/notificationChannels/[A-Za-z0-9_-]+$",
          channel,
        ))
      ])
    )
    error_message = "Notification channels must be non-empty full resource names from the matching project."
  }
}

resource "google_logging_metric" "worker_errors" {
  project     = var.project_id
  name        = "${local.resource_prefix}-${var.monitoring_contract.resourceSuffixes.workerErrorsMetric}"
  description = "${var.environment} product activation worker error outcomes."
  filter = join(" AND ", [
    local.worker_resource_filter,
    "jsonPayload.service=\"${var.monitoring_contract.workerErrors.service}\"",
    "jsonPayload.event=\"${var.monitoring_contract.workerErrors.event}\"",
    "severity>=ERROR",
  ])

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_logging_metric" "reconciliation_failures" {
  project     = var.project_id
  name        = "${local.resource_prefix}-${var.monitoring_contract.resourceSuffixes.reconciliationFailuresMetric}"
  description = "${var.environment} product activation reconciliation execution failures."
  filter = join(" AND ", [
    local.reconciliation_resource_filter,
    "jsonPayload.service=\"${var.monitoring_contract.reconciliationFailures.service}\"",
    "jsonPayload.event=\"${var.monitoring_contract.reconciliationFailures.event}\"",
    "severity>=ERROR",
  ])

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_logging_metric" "reconciliation_successes" {
  project     = var.project_id
  name        = "${local.resource_prefix}-${var.monitoring_contract.resourceSuffixes.reconciliationSuccessesMetric}"
  description = "${var.environment} successful product activation reconciliation heartbeats."
  filter = join(" AND ", [
    local.reconciliation_resource_filter,
    "jsonPayload.service=\"${var.monitoring_contract.reconciliationHeartbeat.service}\"",
    "jsonPayload.event=\"${var.monitoring_contract.reconciliationHeartbeat.event}\"",
    "severity=INFO",
  ])

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_logging_metric" "retry_limit" {
  project     = var.project_id
  name        = "${local.resource_prefix}-${var.monitoring_contract.resourceSuffixes.retryLimitMetric}"
  description = "${var.environment} unsuccessful final configured activation task attempts."
  filter = join(" AND ", [
    local.worker_resource_filter,
    "jsonPayload.service=\"${var.monitoring_contract.retryLimit.service}\"",
    "jsonPayload.event=\"${var.monitoring_contract.retryLimit.event}\"",
    "jsonPayload.${var.monitoring_contract.retryLimit.field}=true",
    "severity>=ERROR",
  ])

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_logging_metric" "pending_age" {
  project         = var.project_id
  name            = "${local.resource_prefix}-${var.monitoring_contract.resourceSuffixes.pendingAgeMetric}"
  description     = "${var.environment} oldest durable pending product activation age in milliseconds."
  value_extractor = "EXTRACT(jsonPayload.${var.monitoring_contract.pendingAge.field})"
  filter = join(" AND ", [
    local.reconciliation_resource_filter,
    "jsonPayload.service=\"${var.monitoring_contract.pendingAge.service}\"",
    "jsonPayload.event=\"${var.monitoring_contract.pendingAge.event}\"",
    "jsonPayload.${var.monitoring_contract.pendingAge.field}>=0",
  ])

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"
  }
}

resource "google_monitoring_alert_policy" "website_5xx" {
  project               = var.project_id
  display_name          = "[${upper(var.environment)}] Website 5xx ratio"
  combiner              = "AND_WITH_MATCHING_RESOURCE"
  enabled               = var.alerting_enabled
  severity              = var.monitoring_contract.website5xx.severity
  notification_channels = var.notification_channel_names
  user_labels           = local.labels

  documentation {
    mime_type = "text/markdown"
    subject   = "[${upper(var.environment)}] Website 5xx ratio exceeded"
    content   = "Bazoria ${var.environment} website returned more than five percent server errors with at least twenty requests in the same five-minute window."
  }

  conditions {
    display_name = "5xx ratio exceeds five percent"

    condition_threshold {
      filter             = local.website_5xx_metric_filter
      denominator_filter = local.website_metric_filter
      comparison         = "COMPARISON_GT"
      threshold_value    = var.monitoring_contract.website5xx.ratioThreshold
      duration           = "0s"

      aggregations {
        alignment_period     = "${var.monitoring_contract.website5xx.alignmentWindowSeconds}s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields = [
          "resource.label.project_id",
          "resource.label.location",
          "resource.label.service_name",
        ]
      }

      denominator_aggregations {
        alignment_period     = "${var.monitoring_contract.website5xx.alignmentWindowSeconds}s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields = [
          "resource.label.project_id",
          "resource.label.location",
          "resource.label.service_name",
        ]
      }
    }
  }

  conditions {
    display_name = "At least twenty website requests"

    condition_threshold {
      filter          = local.website_metric_filter
      comparison      = "COMPARISON_GT"
      threshold_value = var.monitoring_contract.website5xx.minimumRequestCount - 1
      duration        = "0s"

      aggregations {
        alignment_period     = "${var.monitoring_contract.website5xx.alignmentWindowSeconds}s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields = [
          "resource.label.project_id",
          "resource.label.location",
          "resource.label.service_name",
        ]
      }
    }
  }
}

resource "google_monitoring_alert_policy" "log_counter" {
  for_each = local.counter_policies

  project               = var.project_id
  display_name          = each.value.display_name
  combiner              = "OR"
  enabled               = var.alerting_enabled
  severity              = each.value.severity
  notification_channels = var.notification_channel_names
  user_labels           = local.labels

  documentation {
    mime_type = "text/markdown"
    subject   = each.value.display_name
    content   = "A Bazoria ${var.environment} operational threshold was exceeded. Inspect the exact matching Cloud Run resource and stable structured event before retrying work."
  }

  conditions {
    display_name = each.value.condition_name

    condition_threshold {
      filter          = each.value.filter
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.threshold_exclusive
      duration        = "0s"

      aggregations {
        alignment_period     = "${each.value.window_seconds}s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = each.value.group_by_fields
      }
    }
  }
}

resource "google_monitoring_alert_policy" "pending_age" {
  for_each = local.pending_age_policies

  project               = var.project_id
  display_name          = each.value.display_name
  combiner              = "OR"
  enabled               = var.alerting_enabled
  severity              = each.value.severity
  notification_channels = var.notification_channel_names
  user_labels           = local.labels

  documentation {
    mime_type = "text/markdown"
    subject   = each.value.display_name
    content   = "The oldest durable pending Bazoria ${var.environment} product activation exceeded ${each.value.threshold} milliseconds. Inspect reconciliation and Cloud Tasks before retrying."
  }

  conditions {
    display_name = "Oldest durable pending activation exceeds ${each.value.threshold} milliseconds"

    condition_threshold {
      filter          = local.pending_age_metric_filter
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.threshold
      duration        = "0s"

      aggregations {
        alignment_period     = "${var.monitoring_contract.pendingAge.alignmentWindowSeconds}s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields = [
          "resource.label.project_id",
          "resource.label.location",
          "resource.label.job_name",
        ]
      }
    }
  }
}

resource "google_monitoring_alert_policy" "reconciliation_heartbeat" {
  project               = var.project_id
  display_name          = "[${upper(var.environment)}] Product activation reconciliation heartbeat missing"
  combiner              = "OR"
  enabled               = var.alerting_enabled
  severity              = var.monitoring_contract.reconciliationHeartbeat.severity
  notification_channels = var.notification_channel_names
  user_labels           = local.labels

  documentation {
    mime_type = "text/markdown"
    subject   = "[${upper(var.environment)}] Reconciliation heartbeat missing"
    content   = "No successful Bazoria ${var.environment} product activation reconciliation heartbeat was observed for five minutes. Inspect the scheduler and reconciliation job."
  }

  conditions {
    display_name = "No successful reconciliation for five minutes"

    condition_absent {
      filter   = local.reconciliation_success_metric_filter
      duration = "${var.monitoring_contract.reconciliationHeartbeat.absenceSeconds}s"
    }
  }
}

resource "google_monitoring_uptime_check_config" "public" {
  for_each = var.monitoring_contract.uptime.checks

  project            = var.project_id
  display_name       = "[${upper(var.environment)}] Bazoria ${each.key}"
  period             = "${var.monitoring_contract.uptime.periodSeconds}s"
  timeout            = "${var.monitoring_contract.uptime.timeoutSeconds}s"
  checker_type       = "STATIC_IP_CHECKERS"
  log_check_failures = true
  user_labels        = local.labels

  http_check {
    path           = each.value.path
    port           = 443
    request_method = "GET"
    use_ssl        = true
    validate_ssl   = true

    accepted_response_status_codes {
      status_value = each.value.status
    }
  }

  monitored_resource {
    type = var.monitoring_contract.uptime.resourceType
    labels = {
      project_id = var.project_id
      host       = local.canonical_hostname
    }
  }

  dynamic "content_matchers" {
    for_each = each.value.contentMarker == null ? [] : [each.value.contentMarker]

    content {
      content = content_matchers.value
      matcher = "CONTAINS_STRING"
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  for_each = google_monitoring_uptime_check_config.public

  project               = var.project_id
  display_name          = "[${upper(var.environment)}] Bazoria ${each.key} uptime failure"
  combiner              = "OR"
  enabled               = var.alerting_enabled
  severity              = var.monitoring_contract.uptime.severity
  notification_channels = var.notification_channel_names
  user_labels           = local.labels

  documentation {
    mime_type = "text/markdown"
    subject   = "[${upper(var.environment)}] Bazoria ${each.key} uptime failure"
    content   = "The public Bazoria ${var.environment} ${each.key} check failed twice consecutively in at least two checker regions."
  }

  conditions {
    display_name = "Two consecutive ${each.key} check failures"

    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"${var.monitoring_contract.uptime.metricType}\"",
        "metric.label.check_id=\"${each.value.uptime_check_id}\"",
        "resource.type=\"${var.monitoring_contract.uptime.resourceType}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.monitoring_contract.uptime.minimumFailedRegions - 1
      duration        = "${var.monitoring_contract.uptime.failureDurationSeconds}s"

      aggregations {
        alignment_period     = "${var.monitoring_contract.uptime.periodSeconds}s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }

      trigger {
        count = 1
      }
    }
  }
}
