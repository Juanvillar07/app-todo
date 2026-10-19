terraform {
  required_version = ">= 1.11"

  # State local a propósito: este stack crea el bucket donde vivirá el state de infra/main.
  # Guarda bootstrap/terraform.tfstate en un lugar seguro (no se sube a git).

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      Stack     = "bootstrap"
      ManagedBy = "terraform"
    }
  }
}
