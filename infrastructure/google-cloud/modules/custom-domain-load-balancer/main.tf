locals {
  environment_abbreviation = var.environment == "production" ? "prod" : "uat"
  resource_prefix          = "bazoria-${local.environment_abbreviation}"
  canonical_hostname       = trimprefix(var.canonical_origin, "https://")
  expected_website_name    = "${local.resource_prefix}-web"

  address_name           = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.address}"
  network_endpoint_group = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.networkEndpointGroup}"
  backend_name           = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.backend}"
  https_url_map_name     = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.httpsUrlMap}"
  http_url_map_name      = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.httpUrlMap}"
  https_proxy_name       = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.httpsProxy}"
  http_proxy_name        = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.httpProxy}"
  tls_policy_name        = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.tlsPolicy}"
  dns_authorization_name = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.dnsAuthorization}"
  certificate_name       = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.certificate}"
  certificate_map_name   = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.certificateMap}"
  certificate_map_entry  = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.certificateMapEntry}"
  https_forwarding_rule  = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.httpsForwardingRule}"
  http_forwarding_rule   = "${local.resource_prefix}-${var.edge_contract.resourceSuffixes.httpForwardingRule}"

  labels = {
    environment   = var.environment
    service_role  = "edge"
    managed_by    = "terraform"
    release_owner = "bazoria_web"
    purpose       = "website-edge"
  }
}

check "edge_catalog" {
  assert {
    condition = (
      var.edge_contract.schemaVersion == 1 &&
      var.edge_contract.loadBalancingScheme == "EXTERNAL_MANAGED" &&
      var.edge_contract.networkTier == "PREMIUM" &&
      var.edge_contract.ipVersion == "IPV4" &&
      var.edge_contract.ports.http == 80 &&
      var.edge_contract.ports.https == 443 &&
      var.edge_contract.backend.protocol == "HTTP" &&
      var.edge_contract.backend.enableCdn == false &&
      var.edge_contract.backend.timeoutSeconds == 120 &&
      var.edge_contract.certificate.location == "global" &&
      var.edge_contract.certificate.authorizationType == "PER_PROJECT_RECORD" &&
      var.edge_contract.certificate.scope == "DEFAULT" &&
      var.edge_contract.tls.profile == "MODERN" &&
      var.edge_contract.tls.minimumVersion == "TLS_1_2" &&
      var.edge_contract.redirect.responseCode == "MOVED_PERMANENTLY_DEFAULT" &&
      var.edge_contract.redirect.stripQuery == false
    )
    error_message = "The edge catalog differs from the reviewed contract."
  }
}

check "canonical_origin" {
  assert {
    condition = (
      var.canonical_origin == var.expected_canonical_origin &&
      can(regex(
        "^https://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$",
        var.canonical_origin,
      ))
    )
    error_message = "The canonical origin must be the exact reviewed HTTPS hostname without a port, path, query, wildcard, or IP address."
  }
}

check "website_service" {
  assert {
    condition     = var.website_service_name == local.expected_website_name
    error_message = "The edge backend must use the matching digest-bound website service."
  }
}

resource "google_compute_global_address" "website" {
  project      = var.project_id
  name         = local.address_name
  address_type = "EXTERNAL"
  ip_version   = var.edge_contract.ipVersion
  description  = "Fixed ${var.environment} Bazoria website address."
  labels       = local.labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_region_network_endpoint_group" "website" {
  project               = var.project_id
  region                = var.region
  name                  = local.network_endpoint_group
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.website_service_name
  }
}

resource "google_compute_backend_service" "website" {
  project               = var.project_id
  name                  = local.backend_name
  description           = "Bazoria ${var.environment} Cloud Run website backend."
  protocol              = var.edge_contract.backend.protocol
  load_balancing_scheme = var.edge_contract.loadBalancingScheme
  enable_cdn            = var.edge_contract.backend.enableCdn
  timeout_sec           = var.edge_contract.backend.timeoutSeconds

  backend {
    group = google_compute_region_network_endpoint_group.website.id
  }
}

resource "google_compute_url_map" "https" {
  project     = var.project_id
  name        = local.https_url_map_name
  description = "Exact-host Bazoria ${var.environment} HTTPS routing."

  default_url_redirect {
    host_redirect          = local.canonical_hostname
    redirect_response_code = var.edge_contract.redirect.responseCode
    strip_query            = var.edge_contract.redirect.stripQuery
  }

  host_rule {
    hosts        = [local.canonical_hostname]
    path_matcher = "website"
  }

  path_matcher {
    name            = "website"
    default_service = google_compute_backend_service.website.id
  }

  test {
    host    = local.canonical_hostname
    path    = "/healthz"
    service = google_compute_backend_service.website.id
  }
}

resource "google_compute_url_map" "http_redirect" {
  project     = var.project_id
  name        = local.http_url_map_name
  description = "Permanent Bazoria ${var.environment} HTTP-to-HTTPS redirect."

  default_url_redirect {
    host_redirect          = local.canonical_hostname
    https_redirect         = true
    redirect_response_code = var.edge_contract.redirect.responseCode
    strip_query            = var.edge_contract.redirect.stripQuery
  }
}

resource "google_compute_ssl_policy" "website" {
  project         = var.project_id
  name            = local.tls_policy_name
  description     = "Bazoria ${var.environment} website TLS policy."
  profile         = var.edge_contract.tls.profile
  min_tls_version = var.edge_contract.tls.minimumVersion
}

resource "google_certificate_manager_dns_authorization" "website" {
  project     = var.project_id
  location    = var.edge_contract.certificate.location
  name        = local.dns_authorization_name
  description = "Bazoria ${var.environment} website DNS authorization."
  domain      = local.canonical_hostname
  type        = var.edge_contract.certificate.authorizationType
  labels      = local.labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_certificate_manager_certificate" "website" {
  project     = var.project_id
  location    = var.edge_contract.certificate.location
  name        = local.certificate_name
  description = "Bazoria ${var.environment} Google-managed website certificate."
  scope       = var.edge_contract.certificate.scope
  labels      = local.labels

  managed {
    domains            = [local.canonical_hostname]
    dns_authorizations = [google_certificate_manager_dns_authorization.website.id]
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_certificate_manager_certificate_map" "website" {
  project     = var.project_id
  name        = local.certificate_map_name
  description = "Bazoria ${var.environment} website certificate map."
  labels      = local.labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_certificate_manager_certificate_map_entry" "website" {
  project      = var.project_id
  name         = local.certificate_map_entry
  description  = "Bazoria ${var.environment} exact-host certificate map entry."
  map          = google_certificate_manager_certificate_map.website.name
  certificates = [google_certificate_manager_certificate.website.id]
  hostname     = local.canonical_hostname
  labels       = local.labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_target_https_proxy" "website" {
  project         = var.project_id
  name            = local.https_proxy_name
  description     = "Bazoria ${var.environment} HTTPS target proxy."
  url_map         = google_compute_url_map.https.id
  ssl_policy      = google_compute_ssl_policy.website.id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.website.id}"
}

resource "google_compute_target_http_proxy" "redirect" {
  project     = var.project_id
  name        = local.http_proxy_name
  description = "Bazoria ${var.environment} HTTP redirect target proxy."
  url_map     = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = local.https_forwarding_rule
  description           = "Bazoria ${var.environment} public HTTPS listener."
  load_balancing_scheme = var.edge_contract.loadBalancingScheme
  network_tier          = var.edge_contract.networkTier
  ip_address            = google_compute_global_address.website.id
  ip_protocol           = "TCP"
  port_range            = tostring(var.edge_contract.ports.https)
  target                = google_compute_target_https_proxy.website.id
  labels                = local.labels
}

resource "google_compute_global_forwarding_rule" "http" {
  project               = var.project_id
  name                  = local.http_forwarding_rule
  description           = "Bazoria ${var.environment} public HTTP redirect listener."
  load_balancing_scheme = var.edge_contract.loadBalancingScheme
  network_tier          = var.edge_contract.networkTier
  ip_address            = google_compute_global_address.website.id
  ip_protocol           = "TCP"
  port_range            = tostring(var.edge_contract.ports.http)
  target                = google_compute_target_http_proxy.redirect.id
  labels                = local.labels
}
