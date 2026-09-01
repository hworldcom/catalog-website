variable "project_id" {
  description = "Explicit project receiving the APIs."
  type        = string
}

variable "services" {
  description = "Exact API service names to enable and retain."
  type        = set(string)

  validation {
    condition     = length(var.services) > 0 && alltrue([for service in var.services : can(regex("^[a-z0-9.-]+\\.googleapis\\.com$", service))])
    error_message = "services must contain one or more valid Google API service names."
  }
}
