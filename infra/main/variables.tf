variable "region" {
  description = "Región de AWS (la misma que en bootstrap)."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Prefijo para nombrar recursos (el mismo que en bootstrap)."
  type        = string
  default     = "todo"
}

variable "environment" {
  description = "Nombre del entorno."
  type        = string
  default     = "prod"
}

variable "github_role_name" {
  description = "Rol de despliegue creado por bootstrap (output github_role_name)."
  type        = string
  default     = "todo-github-deploy"
}

# --- Dominio propio ---

variable "custom_domain" {
  description = "Subdominio propio para la app, p. ej. \"tareas.midominio.com\". Vacío = solo la URL *.cloudfront.net."
  type        = string
  default     = ""

  validation {
    condition     = var.custom_domain == "" || can(regex("^[a-z0-9-]+(\\.[a-z0-9-]+){2,}$", var.custom_domain))
    error_message = "Usa un subdominio en minúsculas, como \"tareas.midominio.com\" (sin https:// ni barra final)."
  }
}

# --- Red ---

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

# --- EC2 ---

variable "instance_type" {
  description = "t4g.* es ARM (Graviton, más barato); t3.* es x86. Debe cuadrar con architecture."
  type        = string
  default     = "t4g.small"
}

variable "architecture" {
  description = "arm64 para t4g/c7g/...; x86_64 para t3/m6i/... La imagen Docker debe ser de la misma arquitectura."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.architecture)
    error_message = "architecture debe ser arm64 o x86_64."
  }
}

# --- RDS ---

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "GB de almacenamiento gp3."
  type        = number
  default     = 20
}

variable "db_password_version" {
  description = "Súbelo (1 → 2) para rotar la contraseña de la BD: se regenera y se actualiza DATABASE_URL."
  type        = number
  default     = 1
}

variable "jwt_secret_version" {
  description = "Súbelo para regenerar JWT_SECRET (invalida todas las sesiones)."
  type        = number
  default     = 1
}

variable "db_deletion_protection" {
  description = "Impide borrar la BD. false facilita `terraform destroy` en un proyecto de prueba."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "true: al destruir no se guarda snapshot final (más barato, pero pierdes los datos)."
  type        = bool
  default     = true
}

# --- Monitoreo ---

variable "alert_email" {
  description = "Email para alarmas de CPU y de presupuesto. Vacío = sin notificaciones."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Presupuesto mensual; avisa al 80 % real y al 100 % previsto. Requiere alert_email."
  type        = number
  default     = 40
}

variable "log_retention_days" {
  type    = number
  default = 14
}
