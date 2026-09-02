mock_provider "google" {}

run "uat_budget_is_isolated_and_informational" {
  command = plan

  variables {
    billing_account_id         = "014CA9-692646-D9E4CE"
    currency_code              = "PLN"
    environment                = "uat"
    monthly_amount             = 100.50
    notification_channel_names = ["projects/bazoria-uat-lnlabs/notificationChannels/uat-email"]
    project_id                 = "bazoria-uat-lnlabs"
    project_number             = "145571383840"
  }

  assert {
    condition = (
      length(google_billing_budget.monthly.budget_filter[0].projects) == 1 &&
      contains(google_billing_budget.monthly.budget_filter[0].projects, "projects/145571383840")
    )
    error_message = "UAT budget must filter only the UAT project."
  }

  assert {
    condition     = google_billing_budget.monthly.budget_filter[0].calendar_period == "MONTH"
    error_message = "The budget must use a calendar-month period."
  }

  assert {
    condition     = google_billing_budget.monthly.all_updates_rule[0].disable_default_iam_recipients
    error_message = "Default billing-account recipients must remain disabled."
  }

  assert {
    condition     = !google_billing_budget.monthly.all_updates_rule[0].enable_project_level_recipients
    error_message = "Project-owner recipients must remain disabled."
  }

  assert {
    condition     = output.budget_inventory.threshold_percents == [0.5, 0.8, 1.0]
    error_message = "The budget thresholds must remain exactly 50, 80, and 100 percent."
  }

  assert {
    condition = (
      length(google_billing_budget.monthly.threshold_rules) == 3 &&
      toset([for rule in google_billing_budget.monthly.threshold_rules : rule.threshold_percent]) == toset([0.5, 0.8, 1.0]) &&
      alltrue([for rule in google_billing_budget.monthly.threshold_rules : rule.spend_basis == "CURRENT_SPEND"])
    )
    error_message = "The provider resource must retain exactly three actual-spend thresholds."
  }

  assert {
    condition = (
      google_billing_budget.monthly.ownership_scope == "BILLING_ACCOUNT" &&
      google_billing_budget.monthly.deletion_policy == "PREVENT"
    )
    error_message = "Budget ownership and API deletion protection must remain operator-controlled."
  }
}

run "production_budget_is_isolated" {
  command = plan

  variables {
    billing_account_id         = "014CA9-692646-D9E4CE"
    currency_code              = "PLN"
    environment                = "production"
    monthly_amount             = 250
    notification_channel_names = ["projects/bazoria-prod-lnlabs/notificationChannels/prod-email"]
    project_id                 = "bazoria-prod-lnlabs"
    project_number             = "787649115343"
  }

  assert {
    condition = (
      length(google_billing_budget.monthly.budget_filter[0].projects) == 1 &&
      contains(google_billing_budget.monthly.budget_filter[0].projects, "projects/787649115343")
    )
    error_message = "Production budget must filter only the production project."
  }

  assert {
    condition     = output.budget_inventory.environment == "production"
    error_message = "Production output must retain environment ownership."
  }
}

run "reject_non_positive_amount" {
  command = plan

  variables {
    billing_account_id         = "014CA9-692646-D9E4CE"
    currency_code              = "PLN"
    environment                = "uat"
    monthly_amount             = 0
    notification_channel_names = ["projects/bazoria-uat-lnlabs/notificationChannels/uat-email"]
    project_id                 = "bazoria-uat-lnlabs"
    project_number             = "145571383840"
  }

  expect_failures = [var.monthly_amount]
}

run "reject_wrong_project_contract" {
  command = plan

  variables {
    billing_account_id         = "014CA9-692646-D9E4CE"
    currency_code              = "PLN"
    environment                = "uat"
    monthly_amount             = 100
    notification_channel_names = ["projects/bazoria-prod-lnlabs/notificationChannels/prod-email"]
    project_id                 = "bazoria-prod-lnlabs"
    project_number             = "787649115343"
  }

  expect_failures = [check.reviewed_environment]
}

run "reject_duplicate_channels" {
  command = plan

  variables {
    billing_account_id = "014CA9-692646-D9E4CE"
    currency_code      = "PLN"
    environment        = "uat"
    monthly_amount     = 100
    notification_channel_names = [
      "projects/bazoria-uat-lnlabs/notificationChannels/uat-email",
      "projects/bazoria-uat-lnlabs/notificationChannels/uat-email",
    ]
    project_id     = "bazoria-uat-lnlabs"
    project_number = "145571383840"
  }

  expect_failures = [var.notification_channel_names]
}

run "reject_cross_project_channel" {
  command = plan

  variables {
    billing_account_id         = "014CA9-692646-D9E4CE"
    currency_code              = "PLN"
    environment                = "uat"
    monthly_amount             = 100
    notification_channel_names = ["projects/bazoria-prod-lnlabs/notificationChannels/prod-email"]
    project_id                 = "bazoria-uat-lnlabs"
    project_number             = "145571383840"
  }

  expect_failures = [var.notification_channel_names]
}

run "reject_wrong_billing_account" {
  command = plan

  variables {
    billing_account_id         = "000000-000000-000000"
    currency_code              = "PLN"
    environment                = "uat"
    monthly_amount             = 100
    notification_channel_names = ["projects/bazoria-uat-lnlabs/notificationChannels/uat-email"]
    project_id                 = "bazoria-uat-lnlabs"
    project_number             = "145571383840"
  }

  expect_failures = [var.billing_account_id]
}

run "reject_wrong_project_number" {
  command = plan

  variables {
    billing_account_id         = "014CA9-692646-D9E4CE"
    currency_code              = "PLN"
    environment                = "uat"
    monthly_amount             = 100
    notification_channel_names = ["projects/bazoria-uat-lnlabs/notificationChannels/uat-email"]
    project_id                 = "bazoria-uat-lnlabs"
    project_number             = "787649115343"
  }

  expect_failures = [check.reviewed_environment]
}

run "reject_missing_channels" {
  command = plan

  variables {
    billing_account_id         = "014CA9-692646-D9E4CE"
    currency_code              = "PLN"
    environment                = "uat"
    monthly_amount             = 100
    notification_channel_names = []
    project_id                 = "bazoria-uat-lnlabs"
    project_number             = "145571383840"
  }

  expect_failures = [var.notification_channel_names]
}
