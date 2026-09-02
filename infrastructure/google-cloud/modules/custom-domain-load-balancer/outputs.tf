output "edge_inventory" {
  description = "Non-secret edge resources and exact operator-managed DNS instructions."
  value = {
    canonical_origin = var.canonical_origin
    hostname         = local.canonical_hostname
    ipv4_address     = google_compute_global_address.website.address
    website_service  = var.website_service_name
    load_balancer = {
      scheme           = google_compute_backend_service.website.load_balancing_scheme
      backend          = google_compute_backend_service.website.name
      https_forwarding = google_compute_global_forwarding_rule.https.name
      http_forwarding  = google_compute_global_forwarding_rule.http.name
      tls_policy       = google_compute_ssl_policy.website.name
      certificate_map  = google_certificate_manager_certificate_map.website.name
    }
    dns_records = {
      application = {
        name  = local.canonical_hostname
        type  = "A"
        value = google_compute_global_address.website.address
      }
      certificate_authorization = {
        name  = google_certificate_manager_dns_authorization.website.dns_resource_record[0].name
        type  = google_certificate_manager_dns_authorization.website.dns_resource_record[0].type
        value = google_certificate_manager_dns_authorization.website.dns_resource_record[0].data
        home_pl_value = endswith(
          google_certificate_manager_dns_authorization.website.dns_resource_record[0].data,
          ".",
        ) ? google_certificate_manager_dns_authorization.website.dns_resource_record[0].data : "${google_certificate_manager_dns_authorization.website.dns_resource_record[0].data}."
      }
    }
    certificate_status_commands = [
      "gcloud certificate-manager certificates describe ${google_certificate_manager_certificate.website.name} --project=${var.project_id} --location=global --format=yaml(name,managed.state,managed.authorizationAttemptInfo)",
      "gcloud certificate-manager maps entries describe ${google_certificate_manager_certificate_map_entry.website.name} --map=${google_certificate_manager_certificate_map.website.name} --project=${var.project_id} --location=global --format=yaml(name,state,hostname)",
    ]
    verification_commands = [
      "dig +short A ${local.canonical_hostname}",
      "dig +short CNAME ${google_certificate_manager_dns_authorization.website.dns_resource_record[0].name}",
      "curl --fail --silent --show-error --head ${var.canonical_origin}/healthz",
      "curl --fail --silent --show-error --head http://${local.canonical_hostname}/healthz",
    ]
  }
}
