mock_provider "google" {}

variables {
  canonical_origin          = "https://uat2026.bazoria.pl"
  edge_contract             = jsondecode(file("../../edge-catalog.json"))
  environment               = "uat"
  expected_canonical_origin = "https://uat2026.bazoria.pl"
  project_id                = "bazoria-uat-lnlabs"
  region                    = "europe-west3"
  website_service_name      = "bazoria-uat-web"
}

run "uat_edge_plan_matches_reviewed_contract" {
  command = plan

  assert {
    condition     = google_compute_global_address.website.name == "bazoria-uat-web-ip"
    error_message = "The UAT fixed address name differs."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.website.region == "europe-west3"
    error_message = "The serverless network endpoint group region differs."
  }

  assert {
    condition     = one(google_compute_region_network_endpoint_group.website.cloud_run).service == "bazoria-uat-web"
    error_message = "The UAT edge backend must target the matching website."
  }

  assert {
    condition     = google_compute_backend_service.website.load_balancing_scheme == "EXTERNAL_MANAGED"
    error_message = "The load-balancing scheme differs."
  }

  assert {
    condition     = google_compute_backend_service.website.enable_cdn == false
    error_message = "Cloud CDN must remain disabled."
  }

  assert {
    condition     = contains(one(google_compute_url_map.https.host_rule).hosts, "uat2026.bazoria.pl")
    error_message = "The HTTPS URL map must contain only the reviewed UAT host."
  }

  assert {
    condition     = one(google_compute_url_map.https.default_url_redirect).host_redirect == "uat2026.bazoria.pl"
    error_message = "Unmatched HTTPS hosts must redirect to the canonical UAT host."
  }

  assert {
    condition     = one(google_compute_url_map.http_redirect.default_url_redirect).https_redirect
    error_message = "The HTTP URL map must redirect to HTTPS."
  }

  assert {
    condition     = one(google_compute_url_map.http_redirect.default_url_redirect).strip_query == false
    error_message = "The HTTP redirect must preserve the query string."
  }

  assert {
    condition     = google_compute_ssl_policy.website.profile == "MODERN" && google_compute_ssl_policy.website.min_tls_version == "TLS_1_2"
    error_message = "The TLS policy differs."
  }

  assert {
    condition     = google_certificate_manager_dns_authorization.website.type == "PER_PROJECT_RECORD"
    error_message = "Certificate authorization must be isolated per project."
  }

  assert {
    condition     = one(google_certificate_manager_certificate.website.managed).domains[0] == "uat2026.bazoria.pl"
    error_message = "The managed certificate host differs."
  }

  assert {
    condition     = google_certificate_manager_certificate_map_entry.website.hostname == "uat2026.bazoria.pl"
    error_message = "The certificate map entry host differs."
  }

  assert {
    condition     = google_compute_global_forwarding_rule.https.port_range == "443" && google_compute_global_forwarding_rule.https.network_tier == "PREMIUM"
    error_message = "The HTTPS listener differs."
  }

  assert {
    condition     = google_compute_global_forwarding_rule.http.port_range == "80" && google_compute_global_forwarding_rule.http.network_tier == "PREMIUM"
    error_message = "The HTTP listener differs."
  }

  assert {
    condition     = output.edge_inventory.canonical_origin == "https://uat2026.bazoria.pl"
    error_message = "The UAT edge inventory origin differs."
  }
}

run "production_edge_plan_matches_reviewed_contract" {
  command = plan

  variables {
    canonical_origin          = "https://bazoria.pl"
    environment               = "production"
    expected_canonical_origin = "https://bazoria.pl"
    project_id                = "bazoria-prod-lnlabs"
    website_service_name      = "bazoria-prod-web"
  }

  assert {
    condition     = google_compute_global_address.website.name == "bazoria-prod-web-ip"
    error_message = "The production fixed address name differs."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.website.project == "bazoria-prod-lnlabs"
    error_message = "The production endpoint group must remain in the production project."
  }

  assert {
    condition     = one(google_compute_region_network_endpoint_group.website.cloud_run).service == "bazoria-prod-web"
    error_message = "The production edge backend must target the production website."
  }

  assert {
    condition     = google_certificate_manager_dns_authorization.website.domain == "bazoria.pl"
    error_message = "The production DNS authorization host differs."
  }

  assert {
    condition     = google_certificate_manager_certificate_map.website.name == "bazoria-prod-web-cert-map"
    error_message = "The production certificate map name differs."
  }

  assert {
    condition     = output.edge_inventory.hostname == "bazoria.pl"
    error_message = "The production edge inventory host differs."
  }
}

run "rejects_cross_environment_origin" {
  command = plan

  variables {
    canonical_origin = "https://bazoria.pl"
  }

  expect_failures = [check.canonical_origin]
}

run "rejects_noncanonical_origin_shape" {
  command = plan

  variables {
    canonical_origin          = "https://uat2026.bazoria.pl/path"
    expected_canonical_origin = "https://uat2026.bazoria.pl/path"
  }

  expect_failures = [check.canonical_origin]
}

run "rejects_wrong_environment_website" {
  command = plan

  variables {
    website_service_name = "bazoria-prod-web"
  }

  expect_failures = [check.website_service]
}

run "rejects_unreviewed_edge_catalog" {
  command = plan

  variables {
    edge_contract = merge(
      jsondecode(file("../../edge-catalog.json")),
      { networkTier = "STANDARD" },
    )
  }

  expect_failures = [check.edge_catalog]
}
