variable "region" {
  description = "Región de AWS."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Prefijo para nombrar recursos."
  type        = string
  default     = "todo"
}

variable "github_repository" {
  description = "Repositorio de GitHub que podrá desplegar, como \"owner/nombre\"."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Usa el formato \"owner/nombre\"."
  }
}

variable "github_owner_id" {
  description = "ID numérico del dueño del repo (GitHub API: owner.id). GitHub incluye estos IDs inmutables en el 'sub' del token OIDC."
  type        = string
  default     = ""
}

variable "github_repository_id" {
  description = "ID numérico del repo (GitHub API: id). Vacío junto con github_owner_id = solo se acepta el formato de 'sub' sin IDs."
  type        = string
  default     = ""

  validation {
    condition     = (var.github_repository_id == "") == (var.github_owner_id == "")
    error_message = "Define github_owner_id y github_repository_id juntos (o ninguno)."
  }
}

variable "github_branch" {
  description = "Única rama desde la que los workflows pueden asumir el rol."
  type        = string
  default     = "main"
}

variable "create_github_oidc_provider" {
  description = "false si la cuenta ya tiene el proveedor OIDC de GitHub (solo puede existir uno por cuenta)."
  type        = bool
  default     = true
}
