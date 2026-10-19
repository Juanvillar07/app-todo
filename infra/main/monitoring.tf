# Logs del contenedor (driver awslogs de Docker), alarma de CPU y presupuesto mensual.

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/${var.project}/${var.environment}/backend"
  retention_in_days = var.log_retention_days
}

locals {
  alerts_enabled = var.alert_email != ""
}

resource "aws_sns_topic" "alerts" {
  count = local.alerts_enabled ? 1 : 0
  name  = "${local.name}-alerts"
}

# AWS envía un correo de confirmación: hay que aceptarlo para recibir las alarmas.
resource "aws_sns_topic_subscription" "alerts_email" {
  count     = local.alerts_enabled ? 1 : 0
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "app_cpu" {
  alarm_name          = "${local.name}-app-cpu-high"
  alarm_description   = "CPU de la EC2 del backend por encima del 80 % durante 10 minutos"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = aws_sns_topic.alerts[*].arn
  ok_actions          = aws_sns_topic.alerts[*].arn
}

resource "aws_budgets_budget" "monthly" {
  count = local.alerts_enabled ? 1 : 0

  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
