locals {
  reviewed_environments = {
    uat = {
      project_id     = "bazoria-uat-lnlabs"
      project_number = "145571383840"
    }
    production = {
      project_id     = "bazoria-prod-lnlabs"
      project_number = "787649115343"
    }
  }
  reviewed_environment = try(local.reviewed_environments[var.environment], null)
  threshold_percents   = [0.5, 0.8, 1.0]
  amount_units         = floor(var.monthly_amount)
  amount_nanos         = floor(var.monthly_amount * 1000000000) - (local.amount_units * 1000000000)
}

check "reviewed_environment" {
  assert {
    condition = (
      local.reviewed_environment != null &&
      var.project_id == local.reviewed_environment.project_id &&
      var.project_number == local.reviewed_environment.project_number
    )
    error_message = "The project identifier and number must match the reviewed environment."
  }
}

resource "google_billing_budget" "monthly" {
  billing_account = "billingAccounts/${var.billing_account_id}"
  deletion_policy = "PREVENT"
  display_name    = "Bazoria ${var.environment} monthly budget"
  ownership_scope = "BILLING_ACCOUNT"

  budget_filter {
    calendar_period = "MONTH"
    projects        = ["projects/${var.project_number}"]
  }

  amount {
    specified_amount {
      currency_code = var.currency_code
      units         = tostring(local.amount_units)
      nanos         = local.amount_nanos
    }
  }

  threshold_rules {
    spend_basis       = "CURRENT_SPEND"
    threshold_percent = 0.5
  }

  threshold_rules {
    spend_basis       = "CURRENT_SPEND"
    threshold_percent = 0.8
  }

  threshold_rules {
    spend_basis       = "CURRENT_SPEND"
    threshold_percent = 1.0
  }

  all_updates_rule {
    disable_default_iam_recipients   = true
    enable_project_level_recipients  = false
    monitoring_notification_channels = var.notification_channel_names
  }

  lifecycle {
    prevent_destroy = true
  }
}
