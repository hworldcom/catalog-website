output "budget_inventory" {
  description = "Non-sensitive operator inventory for the environment budget."
  value = {
    currency_code      = var.currency_code
    display_name       = google_billing_budget.monthly.display_name
    environment        = var.environment
    monthly_amount     = var.monthly_amount
    project_id         = var.project_id
    threshold_percents = local.threshold_percents
  }
}
