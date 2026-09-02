locals {
  environment_abbreviation = var.environment == "production" ? "prod" : "uat"
  pool_id                  = "bazoria-${local.environment_abbreviation}-github"
  service_account_ids = {
    for key, value in var.service_accounts : key => "baz-${local.environment_abbreviation}-${value.suffix}"
  }
  service_account_emails = {
    for key, account_id in local.service_account_ids : key => "${account_id}@${var.project_id}.iam.gserviceaccount.com"
  }
  terraform_principal = "serviceAccount:${local.service_account_emails["terraform"]}"

  terraform_act_as_accounts = {
    for key, value in var.service_accounts : key => value
    if value.terraform_can_act_as
  }
  task_invoker_actors = {
    for key, value in var.service_accounts : key => value
    if value.can_act_as_task_invoker
  }
}

resource "google_service_account" "accounts" {
  for_each = var.service_accounts

  project      = var.project_id
  account_id   = local.service_account_ids[each.key]
  display_name = "Bazoria ${upper(local.environment_abbreviation)} ${each.value.display_name}"
  description  = "Bazoria ${var.environment}: ${each.value.description}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_iam_custom_role" "custom" {
  for_each = var.custom_roles

  project     = var.project_id
  role_id     = each.value.role_id
  title       = each.value.title
  description = each.value.description
  permissions = each.value.permissions
  stage       = "GA"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_iam_member" "terraform_predefined" {
  for_each = var.terraform_project_roles

  project = var.project_id
  role    = each.value
  member  = local.terraform_principal
}

resource "google_project_iam_member" "terraform_custom" {
  for_each = google_project_iam_custom_role.custom

  project = var.project_id
  role    = each.value.name
  member  = local.terraform_principal
}

resource "google_service_account_iam_member" "terraform_act_as" {
  for_each = local.terraform_act_as_accounts

  service_account_id = google_service_account.accounts[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = local.terraform_principal
}

resource "google_service_account_iam_member" "task_invoker_act_as" {
  for_each = local.task_invoker_actors

  service_account_id = google_service_account.accounts["taskInvoker"].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${local.service_account_emails[each.key]}"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = local.pool_id
  display_name              = "Bazoria ${upper(local.environment_abbreviation)} GitHub"
  description               = "Federates reviewed Bazoria GitHub deployment workflows."
  disabled                  = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_iam_workload_identity_pool_provider" "github" {
  for_each = var.federation_providers

  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = each.value.provider_id
  display_name                       = "Bazoria ${upper(local.environment_abbreviation)} ${title(each.key)}"
  description                        = "Trusts only the reviewed ${each.value.workflow_file} workflow."
  disabled                           = false

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner"    = "assertion.repository_owner"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
    "attribute.environment"         = "assertion.environment"
    "attribute.event_name"          = "assertion.event_name"
    "attribute.workflow_ref"        = "assertion.workflow_ref"
    "attribute.deployment_role"     = "'${each.value.deployment_role}'"
  }

  attribute_condition = join(" && ", [
    "assertion.repository == '${var.github_repository}'",
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.repository_owner == '${var.github_owner}'",
    "assertion.repository_owner_id == '${var.github_owner_id}'",
    "assertion.environment == '${var.environment}'",
    "assertion.sub == 'repo:${var.github_repository}:environment:${var.environment}'",
    "assertion.ref == '${var.github_branch_ref}'",
    "assertion.event_name in [${join(", ", [for event in sort(tolist(var.github_accepted_events)) : "'${event}'"])}]",
    "assertion.workflow_ref == '${var.github_repository}/.github/workflows/${each.value.workflow_file}@${var.github_branch_ref}'",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account_iam_member" "github_workload_identity" {
  for_each = var.federation_providers

  service_account_id = google_service_account.accounts[each.value.service_account_key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.deployment_role/${each.value.deployment_role}"
}
