variable "alerting_enabled" {
  description = "Whether the reviewed alert policies are enabled outside a maintenance window."
  type        = bool
}

variable "canonical_origin" {
  description = "Exact public HTTPS origin monitored through the external load balancer."
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

variable "expected_canonical_origin" {
  description = "Reviewed environment origin from the runtime catalog."
  type        = string
}

variable "monitoring_contract" {
  description = "Reviewed metrics, thresholds, checks, and resource naming contract."
  type = object({
    schemaVersion             = number
    notificationChannelSource = string
    resourceSuffixes          = map(string)
    website5xx = object({
      metricType             = string
      resourceType           = string
      responseCodeClass      = string
      ratioThreshold         = number
      minimumRequestCount    = number
      alignmentWindowSeconds = number
      severity               = string
    })
    workerErrors = object({
      service                = string
      event                  = string
      resourceType           = string
      thresholdCount         = number
      alignmentWindowSeconds = number
      severity               = string
    })
    pendingAge = object({
      service                = string
      event                  = string
      field                  = string
      resourceType           = string
      alignmentWindowSeconds = number
      warningThresholdMs     = number
      criticalThresholdMs    = number
      warningSeverity        = string
      criticalSeverity       = string
    })
    reconciliationFailures = object({
      service                = string
      event                  = string
      resourceType           = string
      alignmentWindowSeconds = number
      warningThresholdCount  = number
      criticalThresholdCount = number
      warningSeverity        = string
      criticalSeverity       = string
    })
    reconciliationHeartbeat = object({
      service        = string
      event          = string
      resourceType   = string
      absenceSeconds = number
      severity       = string
    })
    retryLimit = object({
      service                = string
      event                  = string
      field                  = string
      resourceType           = string
      thresholdCount         = number
      alignmentWindowSeconds = number
      severity               = string
    })
    uptime = object({
      metricType             = string
      resourceType           = string
      periodSeconds          = number
      timeoutSeconds         = number
      failureDurationSeconds = number
      minimumFailedRegions   = number
      severity               = string
      checks = map(object({
        path          = string
        status        = number
        contentMarker = optional(string)
      }))
    })
  })
}

variable "notification_channel_names" {
  description = "Existing full Cloud Monitoring notification-channel resource names."
  type        = list(string)
}

variable "project_id" {
  description = "Explicit matching Google Cloud project identifier."
  type        = string
}

variable "reconciliation_job_name" {
  description = "Exact matching-environment Cloud Run reconciliation job name."
  type        = string
}

variable "region" {
  description = "Region shared by the monitored Cloud Run resources."
  type        = string
}

variable "website_service_name" {
  description = "Exact matching-environment Cloud Run website service name."
  type        = string
}

variable "worker_service_name" {
  description = "Exact matching-environment Cloud Run activation worker service name."
  type        = string
}
