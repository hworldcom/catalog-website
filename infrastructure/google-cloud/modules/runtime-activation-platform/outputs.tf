output "runtime_inventory" {
  description = "Non-secret runtime resource and direct access inventory."
  value = {
    image_reference = var.runtime_configuration.image_reference
    website = {
      name            = google_cloud_run_v2_service.website.name
      location        = google_cloud_run_v2_service.website.location
      service_account = var.service_account_emails.website
      ingress         = google_cloud_run_v2_service.website.ingress
      public_invoker  = google_cloud_run_v2_service.website.invoker_iam_disabled
    }
    worker = {
      name            = google_cloud_run_v2_service.worker.name
      location        = google_cloud_run_v2_service.worker.location
      service_account = var.service_account_emails.worker
      ingress         = google_cloud_run_v2_service.worker.ingress
      url             = local.worker_url
      invoker         = google_cloud_run_v2_service_iam_member.worker_invoker.member
    }
    reconciliation = {
      name            = google_cloud_run_v2_job.reconciliation.name
      location        = google_cloud_run_v2_job.reconciliation.location
      service_account = var.service_account_emails.reconciliation
      invoker         = google_cloud_run_v2_job_iam_member.reconciliation_invoker.member
    }
    queue = {
      name         = google_cloud_tasks_queue.activation.name
      location     = google_cloud_tasks_queue.activation.location
      target_url   = "${local.worker_url}${var.runtime_contract.queue.targetPath}"
      task_invoker = var.service_account_emails.task_invoker
      operator_bindings = [
        for binding in values(local.task_operator_bindings) : {
          member = binding.member
          role   = binding.role
        }
      ]
    }
    scheduler = {
      name            = google_cloud_scheduler_job.reconciliation.name
      region          = google_cloud_scheduler_job.reconciliation.region
      service_account = var.service_account_emails.scheduler
      schedule        = google_cloud_scheduler_job.reconciliation.schedule
    }
  }
}
