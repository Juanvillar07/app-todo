output "state_bucket" {
  description = "Bucket para el state de infra/main (va en infra/main/backend.hcl)."
  value       = aws_s3_bucket.tfstate.id
}

output "github_role_name" {
  description = "Nombre del rol de despliegue (variable github_role_name de infra/main)."
  value       = aws_iam_role.github_deploy.name
}

output "github_role_arn" {
  description = "ARN del rol (variable AWS_ROLE_ARN del repo en GitHub)."
  value       = aws_iam_role.github_deploy.arn
}

output "region" {
  value = var.region
}
