# Dominio propio (opcional): zona de Route 53, certificado de ACM y registros hacia CloudFront.
# Con domain_name = "" no se crea nada y la app sigue solo en *.cloudfront.net.
# El dominio raíz sirve la app; www redirige a él (CloudFront Function spa_rewrite).

locals {
  has_domain = var.domain_name != ""
  domains    = local.has_domain ? [var.domain_name, "www.${var.domain_name}"] : []
}

# En el registrador (GoDaddy) hay que poner los nameservers de esta zona (output name_servers).
resource "aws_route53_zone" "main" {
  count = local.has_domain ? 1 : 0
  name  = var.domain_name
}

resource "aws_acm_certificate" "main" {
  count    = local.has_domain ? 1 : 0
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in flatten(aws_acm_certificate.main[*].domain_validation_options) : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = aws_route53_zone.main[0].zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 300
  records         = [each.value.record]
  allow_overwrite = true
}

# Espera a que ACM emita el certificado: solo ocurre cuando GoDaddy ya delega en la zona.
resource "aws_acm_certificate_validation" "main" {
  count    = local.has_domain ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# A (IPv4) y AAAA (IPv6) del dominio raíz y de www, como alias de la distribución.
resource "aws_route53_record" "app" {
  for_each = {
    for pair in setproduct(local.domains, ["A", "AAAA"]) : "${pair[0]}-${pair[1]}" => {
      name = pair[0]
      type = pair[1]
    }
  }

  zone_id = aws_route53_zone.main[0].zone_id
  name    = each.value.name
  type    = each.value.type

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
