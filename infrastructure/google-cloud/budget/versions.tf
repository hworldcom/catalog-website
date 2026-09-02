terraform {
  required_version = "= 1.15.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.46.0"
    }
  }
}

provider "google" {
  project               = var.project_id
  billing_project       = var.project_id
  user_project_override = true
}
