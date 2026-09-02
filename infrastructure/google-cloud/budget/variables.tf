variable "billing_account_id" {
  description = "Reviewed billing account identifier without the billingAccounts/ prefix."
  type        = string

  validation {
    condition     = var.billing_account_id == "014CA9-692646-D9E4CE"
    error_message = "billing_account_id must be the reviewed Bazoria billing account."
  }
}

variable "currency_code" {
  description = "Three-letter currency of the reviewed billing account."
  type        = string

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.currency_code))
    error_message = "currency_code must be a three-letter uppercase currency code."
  }
}

variable "environment" {
  description = "Bazoria environment owning this budget."
  type        = string

  validation {
    condition     = contains(["uat", "production"], var.environment)
    error_message = "environment must be uat or production."
  }
}

variable "monthly_amount" {
  description = "Positive monthly budget amount in currency_code."
  type        = number

  validation {
    condition = (
      var.monthly_amount > 0 &&
      floor(var.monthly_amount * 1000000000) == var.monthly_amount * 1000000000
    )
    error_message = "monthly_amount must be greater than zero and have at most nine decimal places."
  }
}

variable "notification_channel_names" {
  description = "One to five existing verified email notification-channel resource names."
  type        = list(string)

  validation {
    condition = (
      length(var.notification_channel_names) >= 1 &&
      length(var.notification_channel_names) <= 5 &&
      length(distinct(var.notification_channel_names)) == length(var.notification_channel_names) &&
      alltrue([
        for channel in var.notification_channel_names : can(regex(
          "^projects/${var.project_id}/notificationChannels/[A-Za-z0-9_-]+$",
          channel,
        ))
      ])
    )
    error_message = "notification_channel_names must contain one to five unique channels from project_id."
  }
}

variable "project_id" {
  description = "Reviewed Google Cloud project identifier."
  type        = string
}

variable "project_number" {
  description = "Reviewed numeric Google Cloud project number used by the budget filter."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.project_number))
    error_message = "project_number must contain digits only."
  }
}
