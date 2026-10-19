# EC2 que ejecuta el backend en Docker. Sin SSH: el acceso es por SSM Session Manager
# y los despliegues llegan como `aws ssm send-command` desde GitHub Actions.

data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${var.architecture}"
}

# Solo CloudFront puede llegar al puerto 80 de la instancia.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "Backend: HTTP solo desde CloudFront"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-app" }
}

resource "aws_vpc_security_group_ingress_rule" "app_http_from_cloudfront" {
  security_group_id = aws_security_group.app.id
  description       = "HTTP desde los origin-facing de CloudFront"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}

# Salida: ECR, SSM, CloudWatch, actualizaciones de paquetes y RDS.
resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "Toda la salida"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# --- Rol de la instancia ---

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${local.name}-app"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "app_ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "app_ecr_read" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

data "aws_iam_policy_document" "app" {
  statement {
    sid       = "ReadAppSecrets"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.ssm_prefix}/*"]
  }

  statement {
    sid       = "WriteContainerLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.backend.arn}:*"]
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "app"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.name}-app"
  role = aws_iam_role.app.name
}

# --- Instancia ---

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023_ami.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  # replace(): los scripts deben llegar con LF aunque se aplique desde Windows.
  user_data = replace(templatefile("${path.module}/templates/user_data.sh.tftpl", {
    region       = var.region
    ecr_registry = split("/", aws_ecr_repository.backend.repository_url)[0]
    ecr_repo_url = aws_ecr_repository.backend.repository_url
    ssm_prefix   = local.ssm_prefix
    log_group    = aws_cloudwatch_log_group.backend.name
    deploy_sh    = base64encode(replace(file("${path.module}/files/deploy.sh"), "\r\n", "\n"))
  }), "\r\n", "\n")
  # Un cambio en user_data o deploy.sh recrea la instancia (es desechable: el estado vive en RDS).
  user_data_replace_on_change = true

  # IMDSv2 obligatorio y hop limit 1: los contenedores no pueden leer las credenciales del host.
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  tags = { Name = "${local.name}-app" }

  lifecycle {
    # Una AMI nueva no debe recrear la instancia en cada plan; se actualiza cuando decidas.
    ignore_changes = [ami]
  }
}

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
  tags     = { Name = "${local.name}-app" }

  depends_on = [aws_internet_gateway.main]
}
