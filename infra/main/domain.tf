# Dominio propio con el DNS fuera de AWS (p. ej. GoDaddy), en un subdominio como tareas.midominio.com.
# Terraform pide el certificado a ACM; los registros DNS los creas tú a mano en tu proveedor
# (ver el output dns_records y los pasos en infra/README.md). Con custom_domain vacío no se crea nada.

locals {
  use_custom_domain = var.custom_domain != ""
  # Zona del proveedor DNS: todo lo que va tras la primera etiqueta (tareas.midominio.com -> midominio.com).
  dns_zone      = local.use_custom_domain ? join(".", slice(split(".", var.custom_domain), 1, length(split(".", var.custom_domain)))) : ""
  dns_subdomain = local.use_custom_domain ? split(".", var.custom_domain)[0] : ""
}

# CloudFront solo acepta certificados de ACM en us-east-1, sea cual sea la región del resto.
resource "aws_acm_certificate" "app" {
  count    = local.use_custom_domain ? 1 : 0
  provider = aws.us_east_1

  domain_name       = var.custom_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Espera a que ACM vea el CNAME de validación en tu DNS y emita el certificado.
# Si el registro aún no existe, el apply se queda aquí esperando (hasta 2 h).
resource "aws_acm_certificate_validation" "app" {
  count    = local.use_custom_domain ? 1 : 0
  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.app[0].arn

  timeouts {
    create = "2h"
  }
}

locals {
  acm_validation = local.use_custom_domain ? one(aws_acm_certificate.app[0].domain_validation_options) : null

  # Registros a crear en el proveedor DNS. "host" es el nombre relativo a la zona, como lo pide GoDaddy.
  dns_records = local.use_custom_domain ? [
    {
      purpose = "Validar el certificado HTTPS (ACM). Déjalo creado: ACM lo usa para renovarlo."
      type    = local.acm_validation.resource_record_type
      host    = trimsuffix(trimsuffix(local.acm_validation.resource_record_name, "."), ".${local.dns_zone}")
      value   = trimsuffix(local.acm_validation.resource_record_value, ".")
    },
    {
      purpose = "Apuntar ${var.custom_domain} a CloudFront."
      type    = "CNAME"
      host    = local.dns_subdomain
      value   = aws_cloudfront_distribution.main.domain_name
    },
  ] : []
}
