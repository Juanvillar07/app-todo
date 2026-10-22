# Crear y destruir la infraestructura en AWS

Guía paso a paso para levantar y bajar la infraestructura de **Tareas** (`flowtareas.online`). Todos los comandos se ejecutan **a mano** desde PowerShell: Terraform nunca corre desde CI.

| Dato | Valor |
| --- | --- |
| Cuenta de AWS | `832684144212` |
| Región | `us-east-1` |
| Bucket del state de Terraform | `todo-tfstate-832684144212` |
| Zona de Route 53 (`flowtareas.online`) | `Z06029453G3IT2KVSEW15` |
| Repositorio | `Juanvillar07/app-todo` |

## Qué hay en cada stack

| Stack | Qué contiene | ¿Se destruye? |
| --- | --- | --- |
| `infra/bootstrap` | Bucket del state y rol OIDC de GitHub Actions | **No.** Cuesta céntimos y se necesita para todo lo demás. |
| `infra/main` | VPC, EC2 + Elastic IP, RDS, ECR, SSM, S3 + CloudFront, ACM, CloudWatch y presupuesto | **Sí.** Es lo que consume créditos (~30–35 USD/mes). |
| Zona de Route 53 (gestionada por `infra/main`) | DNS de `flowtareas.online` y los registros de Resend | **No.** Se conserva (~0,50 USD/mes) para no rehacer los nameservers de GoDaddy ni la verificación de Resend. |

---

## 0. Antes de cualquier operación

1. Terraform 1.11 o superior y AWS CLI v2:
   ```powershell
   terraform version
   aws --version
   ```
   Si `terraform` no existe en la terminal: `winget install --id Hashicorp.Terraform -e` y abre una terminal nueva.

2. Inicia sesión en AWS y comprueba la cuenta (debe salir `832684144212`):
   ```powershell
   aws login
   aws sts get-caller-identity
   ```

3. Entra en el stack y comprueba los archivos locales. No están en git: si faltan, créalos desde los `.example`.
   ```powershell
   cd infra/main
   ```
   - `backend.hcl`:
     ```hcl
     bucket = "todo-tfstate-832684144212"
     region = "us-east-1"
     ```
   - `terraform.tfvars`: copia de `terraform.tfvars.example` con `domain_name = "flowtareas.online"`.

4. Inicializa (solo la primera vez en el PC, o si cambian los proveedores):
   ```powershell
   terraform init '-backend-config=backend.hcl'
   ```

> En PowerShell, los argumentos con `=` o `[ ]` van entre comillas simples: `'-backend-config=backend.hcl'`, `'aws_route53_zone.main[0]'`.

---

## 1. Destruir la infraestructura (conservando el dominio)

### 1.1 Sacar la zona de Route 53 del control de Terraform
Así `destroy` no la borra. La zona y sus registros (incluidos los de Resend) siguen existiendo en AWS.
```powershell
terraform state rm 'aws_route53_zone.main[0]'
```

### 1.2 Revisar qué se va a borrar
```powershell
terraform plan -destroy -out destroy.tfplan
```
Comprueba que aparecen EC2, Elastic IP, RDS, CloudFront, S3, ECR, ACM, SSM, CloudWatch, la VPC y los registros A/AAAA y de validación del certificado, y que **no** aparece `aws_route53_zone.main`.

### 1.3 Destruir
```powershell
terraform apply destroy.tfplan
```
Tarda unos 15–20 minutos, sobre todo por CloudFront y RDS.

> **Los datos de RDS se pierden**: con `db_skip_final_snapshot = true` (valor por defecto) no se guarda snapshot. Para conservarlos, pon `db_skip_final_snapshot = false` en `terraform.tfvars` antes del paso 1.2. RDS guardará el snapshot `todo-prod-final`, que cuesta unos céntimos al mes.

### 1.4 Evitar deploys fallidos
Sin infraestructura, cualquier merge a `main` que toque `backend/` o `frontend/` lanza un deploy que fallará. Desactívalos mientras esté apagada:
GitHub → **Actions** → "Deploy backend" → **⋯ → Disable workflow**, y lo mismo con "Deploy frontend".

### 1.5 Qué queda encendido
| Recurso | Coste aproximado |
| --- | --- |
| Zona de Route 53 `flowtareas.online` | ~0,50 USD/mes |
| Bucket del state + rol OIDC (`infra/bootstrap`) | céntimos |

`flowtareas.online` deja de cargar la app, pero **Resend sigue verificado**: el envío de correos desde el entorno local funciona igual.

---

## 2. Volver a crear la infraestructura

### 2.1 Recuperar la zona existente en el state
**Antes** de cualquier `apply`. Si no lo haces, Terraform crearía una zona nueva con otros nameservers.
```powershell
terraform import 'aws_route53_zone.main[0]' Z06029453G3IT2KVSEW15
```

### 2.2 Crear todo
```powershell
terraform plan -out tfplan
terraform apply tfplan
```
Tarda unos 15–20 minutos, entre la validación del certificado y el despliegue de CloudFront. Revisa el plan antes de aplicar: solo debe **crear** recursos, no destruir ni sustituir la zona.

### 2.3 Actualizar las variables del repositorio en GitHub
Cambian el ID de la EC2 y el de la distribución de CloudFront:
```powershell
terraform output github_variables
```
Cópialas en GitHub → **Settings → Secrets and variables → Actions → Variables**: `AWS_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`, `EC2_INSTANCE_ID`, `FRONTEND_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.

### 2.4 Desplegar la app
1. Vuelve a activar los workflows si los desactivaste (Actions → el workflow → **Enable workflow**).
2. Lanza a mano, desde `main`: **Actions → Deploy backend → Run workflow** y después **Deploy frontend → Run workflow**.

### 2.5 Comprobar
- `https://flowtareas.online` carga el login con el candado válido.
- `https://flowtareas.online/api/health` → `{"status":"ok"}`.
- `https://www.flowtareas.online` redirige a `https://flowtareas.online`.

> **Pendiente antes de desplegar ramas nuevas** (login con Google, recuperación de contraseña, verificación de email): `deploy.sh` todavía no pasa a la EC2 las variables `APP_ORIGINS`, `COOKIE_SECURE`, `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `EMAIL_FROM` ni `APP_URL`. Hay que añadirlas a SSM y a `deploy.sh` antes de mezclar esas ramas en `main`.

---

## 3. Crear desde cero (sin zona de Route 53)

Para la primera vez, o si algún día borras también la zona. El certificado solo se emite cuando GoDaddy delega en Route 53, así que se hace en dos fases.

1. Crea solo la zona y saca los nameservers:
   ```powershell
   terraform apply '-target=aws_route53_zone.main'
   terraform output name_servers
   ```
2. En GoDaddy: **Mis productos → flowtareas.online → DNS → Servidores de nombres → Cambiar → Usaré mis propios servidores de nombres** y pega los 4 (sin el punto final).
3. Espera a que el registro `.online` lo refleje (de minutos a unas horas):
   ```powershell
   nslookup -type=NS flowtareas.online ns10.trs-dns.org
   ```
4. Crea el resto y después sigue con los pasos 2.3 a 2.5:
   ```powershell
   terraform plan -out tfplan
   terraform apply tfplan
   ```
5. Vuelve a crear en Route 53 los registros de Resend, copiándolos de Resend → **Domains → flowtareas.online**:

   | Nombre | Tipo | Valor |
   | --- | --- | --- |
   | `resend._domainkey` | TXT | `"p=MIGf…QIDAQAB"` (entre comillas, en una sola línea) |
   | `rsend` | CNAME | el valor de Resend (`rsend-sae1…mta.net`) |
   | `send` | CNAME | el valor de Resend (`send.forge…mta.net`) |
   | `_dmarc` | TXT | `"v=DMARC1; p=none;"` |

   En el nombre va solo la parte corta (`send`, no `send.flowtareas.online`). Después pulsa **"I've already added the records"** en Resend y espera a *Verified*.

### Borrar también la zona
Si quieres coste cero absoluto:
1. Borra a mano en Route 53 los registros de Resend (`resend._domainkey`, `rsend`, `send`, `_dmarc`). AWS no deja borrar una zona con registros que Terraform no conoce (`HostedZoneNotEmpty`).
2. **No** hagas el paso 1.1 (`state rm`) y ejecuta los pasos 1.2 y 1.3.
3. Para volver, sigue esta sección 3 completa: habrá nameservers nuevos.

---

## 4. Problemas habituales

| Síntoma | Causa y solución |
| --- | --- |
| `Your session has expired` / `Unable to locate credentials` | Sesión de AWS caducada: `aws login`. |
| `terraform` no se reconoce | Terraform no está en el PATH de esa terminal: abre una nueva o reinstala con winget. |
| El apply se queda esperando en `aws_acm_certificate_validation` | El DNS aún no propaga (sobre todo tras cambiar nameservers). Espera y vuelve a aplicar. |
| `HostedZoneNotEmpty` al destruir | Quedan registros manuales en la zona (Resend). Usa el paso 1.1 o bórralos antes. |
| El plan quiere crear una zona nueva al volver a levantar | Falta el `terraform import` del paso 2.1. No apliques: haz el import y vuelve a generar el plan. |
| El deploy del backend falla tras recrear | Variables de GitHub desactualizadas (paso 2.3) o la imagen aún no está en ECR: relanza "Deploy backend". |
