terraform {
  # 1.11+: argumentos write-only (los secretos no se guardan en el state).
  required_version = ">= 1.11"

  # Configuración parcial: el bucket se pasa con `terraform init -backend-config=backend.hcl`.
  # El bloqueo usa un .tflock en S3 (use_lockfile), sin DynamoDB.
  backend "s3" {
    key          = "main/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      Stack       = "main"
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront solo acepta certificados de ACM emitidos en us-east-1, sea cual sea var.region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      Stack       = "main"
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name       = "${var.project}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  # Prefijo de los parámetros de SSM que lee deploy.sh.
  ssm_prefix = "/${var.project}/${var.environment}"
}
