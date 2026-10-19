# Infraestructura (Terraform)

Dos stacks que se aplican **a mano** desde tu máquina; el pipeline solo despliega código.

| Stack | State | Qué crea |
| --- | --- | --- |
| `bootstrap/` | local (`bootstrap/terraform.tfstate`) | Bucket S3 del state de `main` y rol IAM que asume GitHub Actions por OIDC (solo desde `main` de tu repo) |
| `main/` | remoto, en el bucket anterior (`use_lockfile`) | VPC, EC2 + Elastic IP, RDS PostgreSQL 16, ECR, SSM Parameter Store, S3 + CloudFront, CloudWatch, presupuesto y los permisos del rol de GitHub |

```
Usuario ──HTTPS──▶ CloudFront ──/*──────▶ S3 (frontend, privado vía OAC)
                              └─/api/*──▶ EC2:80 (Docker, solo desde CloudFront) ──5432──▶ RDS (subred privada)
GitHub Actions ──OIDC──▶ rol IAM ──▶ ECR push · SSM send-command (deploy.sh) · S3 sync · invalidación
```

## Requisitos

- Terraform ≥ 1.11 y AWS CLI v2.
- Credenciales de AWS con permisos de administrador en tu terminal (por ejemplo `aws login` o `aws sso login`). Comprueba con `aws sts get-caller-identity`.
- El repo subido a GitHub (necesitas su `owner/nombre`).

## 1. Bootstrap (una sola vez)

```bash
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars   # pon github_repository = "owner/nombre"
terraform init
terraform plan
terraform apply
terraform output
```

Anota `state_bucket` y `github_role_name`. Guarda una copia de `bootstrap/terraform.tfstate` en un lugar seguro: no se sube a git y lo necesitas para modificar o destruir este stack.

> Si la cuenta ya tiene el proveedor OIDC de GitHub, pon `create_github_oidc_provider = false`.

## 2. Main

```bash
cd infra/main
cp backend.hcl.example backend.hcl             # bucket = <state_bucket>
cp terraform.tfvars.example terraform.tfvars   # revisa región, tipo de instancia y alert_email
terraform init -backend-config=backend.hcl
terraform plan -out tfplan
terraform apply tfplan                         # 10–15 min (RDS y CloudFront son lentos)
terraform output
```

Después del apply:

- Si pusiste `alert_email`, confirma la suscripción en el correo que envía AWS SNS.
- `terraform output github_variables` da los valores de las variables del repo en GitHub (Fase 6).
- Hasta el primer despliegue, `/api/*` responde 502 (no hay contenedor) y la raíz no tiene frontend: es normal.

## Operación

```bash
# Shell en la EC2 (sin SSH ni puertos abiertos)
aws ssm start-session --target "$(terraform output -raw instance_id)"

# Logs del backend
aws logs tail "$(terraform output -raw log_group)" --follow

# Despliegue manual de una imagen ya subida a ECR (lo mismo que hará GitHub Actions)
sudo /opt/todo/deploy.sh <sha-del-commit>
```

- **Secretos:** `DATABASE_URL` y `JWT_SECRET` se generan con contraseñas efímeras y se escriben como argumentos *write-only*: no quedan ni en el plan ni en el state. Para rotarlos sube `db_password_version` o `jwt_secret_version` y aplica; después vuelve a desplegar el backend para que lea los valores nuevos.
- **Arquitectura:** por defecto la EC2 es `t4g.small` (ARM). La imagen Docker debe construirse para `linux/arm64` (o cambia a `t3.small` + `architecture = "x86_64"`).
- **Cambios en `user_data` o `deploy.sh`** recrean la instancia (es desechable: los datos viven en RDS). Tras recrearla hay que volver a desplegar el backend.
- **Rutas del frontend:** una CloudFront Function reescribe las rutas sin extensión a `/index.html`. No se usan páginas de error personalizadas para no ocultar los 404 de la API.

## Costos y limpieza

Con tráfico bajo, el gasto viene casi todo de lo que corre 24/7: EC2 `t4g.small`, RDS `db.t4g.micro` (+20 GB gp3) y la IPv4 pública. Calcula unos 30–35 USD/mes en `us-east-1`; revísalo en la [calculadora de AWS](https://calculator.aws/). CloudFront, S3, ECR y SSM cuestan céntimos.

Cuando no la uses:

```bash
cd infra/main && terraform destroy     # borra la app (con db_skip_final_snapshot = true se pierden los datos)
```

`bootstrap` se puede dejar: el bucket del state y el rol cuestan prácticamente nada.
