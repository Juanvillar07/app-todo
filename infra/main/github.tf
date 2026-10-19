# Permisos del rol de GitHub Actions (creado en bootstrap), limitados a los recursos de este stack.

data "aws_iam_role" "github_deploy" {
  name = var.github_role_name
}

data "aws_iam_policy_document" "github_deploy" {
  # deploy-backend: login y push a ECR.
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  # deploy-backend: ejecutar deploy.sh en la EC2 y leer el resultado.
  statement {
    sid     = "SsmRunDeploy"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.app.arn,
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }
  statement {
    sid       = "SsmReadCommandResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"] # estas acciones no admiten restricción por recurso
  }

  # deploy-frontend: sincronizar el bucket e invalidar la caché.
  statement {
    sid       = "FrontendBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.frontend.arn]
  }
  statement {
    sid       = "FrontendBucketWrite"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
  }
  statement {
    sid       = "CloudFrontInvalidate"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.main.arn]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${local.name}-deploy"
  role   = data.aws_iam_role.github_deploy.name
  policy = data.aws_iam_policy_document.github_deploy.json
}
