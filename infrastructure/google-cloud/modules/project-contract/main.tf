data "google_project" "target" {
  project_id = var.project_id
}

locals {
  actual_billing_account_id = trimprefix(data.google_project.target.billing_account, "billingAccounts/")
}

resource "terraform_data" "verified_project" {
  input = {
    billing_account_id = local.actual_billing_account_id
    environment        = var.environment
    organization_id    = tostring(data.google_project.target.org_id)
    project_id         = data.google_project.target.project_id
    project_number     = tostring(data.google_project.target.number)
    region             = var.region
  }

  lifecycle {
    precondition {
      condition     = tostring(data.google_project.target.number) == var.project_number
      error_message = "The configured project number does not match the selected project."
    }

    precondition {
      condition     = tostring(data.google_project.target.org_id) == var.organization_id
      error_message = "The selected project is not in the reviewed Google Cloud organization."
    }

    precondition {
      condition     = local.actual_billing_account_id == var.billing_account_id
      error_message = "The selected project is not attached to the reviewed billing account."
    }
  }
}
