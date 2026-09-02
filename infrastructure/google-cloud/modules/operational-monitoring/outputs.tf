output "monitoring_inventory" {
  description = "Non-secret operational metrics, alerts, checks, and selected notification channels."
  value = {
    environment           = var.environment
    enabled               = var.alerting_enabled
    notification_channels = var.notification_channel_names
    logging_metrics = {
      pending_age              = google_logging_metric.pending_age.name
      reconciliation_failures  = google_logging_metric.reconciliation_failures.name
      reconciliation_successes = google_logging_metric.reconciliation_successes.name
      retry_limit              = google_logging_metric.retry_limit.name
      worker_errors            = google_logging_metric.worker_errors.name
    }
    alert_policies = merge(
      { website_5xx = google_monitoring_alert_policy.website_5xx.display_name },
      { for key, policy in google_monitoring_alert_policy.log_counter : key => policy.display_name },
      { for key, policy in google_monitoring_alert_policy.pending_age : "pending_age_${key}" => policy.display_name },
      { reconciliation_heartbeat = google_monitoring_alert_policy.reconciliation_heartbeat.display_name },
      { for key, policy in google_monitoring_alert_policy.uptime : "uptime_${key}" => policy.display_name },
    )
    uptime_checks = {
      for key, check in google_monitoring_uptime_check_config.public : key => {
        display_name = check.display_name
        hostname     = local.canonical_hostname
        path         = var.monitoring_contract.uptime.checks[key].path
        status       = var.monitoring_contract.uptime.checks[key].status
      }
    }
  }
}
