output "app_url" {
  description = "URL pública de la app (el dominio propio si está configurado)."
  value       = "https://${local.use_custom_domain ? var.custom_domain : aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_url" {
  description = "URL de CloudFront; sigue funcionando aunque haya dominio propio."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "dns_records" {
  description = "Registros CNAME que hay que crear en el proveedor DNS (GoDaddy) para el dominio propio."
  value       = local.dns_records
}

output "certificate_status" {
  description = "Estado del certificado en ACM: PENDING_VALIDATION hasta que exista el CNAME de validación, luego ISSUED."
  value       = local.use_custom_domain ? aws_acm_certificate.app[0].status : null
}

# --- Variables del repo en GitHub (Settings → Secrets and variables → Actions → Variables) ---

output "github_variables" {
  description = "Valores para las variables del repo que usan los workflows."
  value = {
    AWS_ROLE_ARN               = data.aws_iam_role.github_deploy.arn
    AWS_REGION                 = var.region
    ECR_REPOSITORY             = aws_ecr_repository.backend.name
    EC2_INSTANCE_ID            = aws_instance.app.id
    FRONTEND_BUCKET            = aws_s3_bucket.frontend.id
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.main.id
  }
}

# --- Útiles para operar ---

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "instance_id" {
  description = "Conéctate con: aws ssm start-session --target <id>"
  value       = aws_instance.app.id
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "log_group" {
  value = aws_cloudwatch_log_group.backend.name
}
