variable "canonical_origin" {
  description = "Exact public HTTPS origin for the selected environment."
  type        = string
}

variable "edge_contract" {
  description = "Reviewed load-balancer, certificate, redirect, and resource naming contract."
  type = object({
    schemaVersion       = number
    loadBalancingScheme = string
    networkTier         = string
    ipVersion           = string
    ports = object({
      http  = number
      https = number
    })
    backend = object({
      protocol  = string
      enableCdn = bool
    })
    certificate = object({
      location          = string
      authorizationType = string
      scope             = string
    })
    tls = object({
      profile        = string
      minimumVersion = string
    })
    redirect = object({
      responseCode = string
      stripQuery   = bool
    })
    resourceSuffixes = object({
      address              = string
      networkEndpointGroup = string
      backend              = string
      httpsUrlMap          = string
      httpUrlMap           = string
      httpsProxy           = string
      httpProxy            = string
      tlsPolicy            = string
      dnsAuthorization     = string
      certificate          = string
      certificateMap       = string
      certificateMapEntry  = string
      httpsForwardingRule  = string
      httpForwardingRule   = string
    })
  })
}

variable "environment" {
  description = "Bazoria deployment environment."
  type        = string

  validation {
    condition     = contains(["uat", "production"], var.environment)
    error_message = "environment must be uat or production."
  }
}

variable "expected_canonical_origin" {
  description = "Reviewed environment origin from the runtime catalog."
  type        = string
}

variable "project_id" {
  description = "Explicit matching Google Cloud project identifier."
  type        = string
}

variable "region" {
  description = "Region shared by the website and serverless network endpoint group."
  type        = string

  validation {
    condition     = var.region == "europe-west3"
    error_message = "Edge serverless resources must remain in europe-west3."
  }
}

variable "website_service_name" {
  description = "Matching digest-bound Cloud Run website service name."
  type        = string
}
