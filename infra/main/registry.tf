resource "aws_ecr_repository" "backend" {
  name = "${var.project}-backend"
  # Las imágenes se etiquetan con el SHA del commit: una etiqueta nunca cambia de contenido.
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true # permite `terraform destroy` aunque haya imágenes

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Conservar las últimas 10 imágenes"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
