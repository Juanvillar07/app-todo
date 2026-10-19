# Configuración del backend en SSM Parameter Store (SecureString con la clave aws/ssm).
# deploy.sh la lee en cada despliegue. Los valores son write-only: no quedan en el state.

ephemeral "random_password" "jwt" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "database_url" {
  name             = "${local.ssm_prefix}/DATABASE_URL"
  description      = "URL de conexión del backend a RDS"
  type             = "SecureString"
  value_wo         = "postgresql+psycopg://${aws_db_instance.main.username}:${ephemeral.random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?sslmode=require"
  value_wo_version = var.db_password_version
}

resource "aws_ssm_parameter" "jwt_secret" {
  name             = "${local.ssm_prefix}/JWT_SECRET"
  description      = "Clave para firmar los JWT"
  type             = "SecureString"
  value_wo         = ephemeral.random_password.jwt.result
  value_wo_version = var.jwt_secret_version
}

resource "aws_ssm_parameter" "jwt_expire_minutes" {
  name  = "${local.ssm_prefix}/JWT_EXPIRE_MINUTES"
  type  = "String"
  value = "60"
}
