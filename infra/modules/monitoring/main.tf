resource "aws_sns_topic" "alerts" {
  name = "${var.project}-${var.stage}-alerts"

  tags = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Monthly cost budget: $25 limit with $1 / $5 / $10 / $25 thresholds
# (4%, 20%, 40%, 100% of the limit). See docs/PLAN.md section 7.6.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-${var.stage}-monthly"
  budget_type  = "COST"
  limit_amount = "25"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [
      { threshold = 4, type = "ACTUAL" },
      { threshold = 20, type = "ACTUAL" },
      { threshold = 40, type = "ACTUAL" },
      { threshold = 100, type = "ACTUAL" },
    ]

    content {
      comparison_operator       = "GREATER_THAN"
      threshold                 = notification.value.threshold
      threshold_type            = "PERCENTAGE"
      notification_type         = notification.value.type
      subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
    }
  }
}

# Daily AI guardrail alarms (PLAN 6.7/7.6, ADR-0008). The generateWorker
# emits CloudWatch EMF with namespace/dimension matching these alarms exactly
# (lib/metrics.ts: Namespace "TokenDesigner", Dimensions [[Stage]]).
resource "aws_cloudwatch_metric_alarm" "generation_count_daily" {
  alarm_name          = "${var.project}-${var.stage}-generation-count-daily"
  alarm_description   = "More than ${var.daily_generation_alarm_threshold} AI generations in a UTC day (dev threshold; review cap/abuse)."
  namespace           = var.generation_metric_namespace
  metric_name         = "GenerationCount"
  dimensions          = { Stage = var.stage }
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = var.daily_generation_alarm_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "estimated_ai_cost_daily" {
  alarm_name          = "${var.project}-${var.stage}-estimated-ai-cost-daily"
  alarm_description   = "Estimated Stability AI spend above $${var.daily_ai_cost_alarm_threshold_usd} in a UTC day."
  namespace           = var.generation_metric_namespace
  metric_name         = "EstimatedAICost"
  dimensions          = { Stage = var.stage }
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = var.daily_ai_cost_alarm_threshold_usd
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

# Cost Anomaly Detection is intentionally NOT managed here: this AWS
# account already runs a DIMENSIONAL services monitor
# ("Default-Services-Monitor"), and the account quota rejects a second one
# (verified 2026-11-11: ValidationException, limit exceeded). The monthly
# budget above remains the primary cost guardrail. Revisit if the account
# quota is raised or the default monitor is removed.

# ---------------------------------------------------------------------------
# Phase 6 platform alarms (PLAN 7.6, docs/RUNBOOK.md)
#
# Every alarm is a 5-minute Sum >= 1 with `notBreaching` missing data so low
# traffic in dev never pages, and every action goes to the existing SNS topic.
# The runbook maps each alarm name to a response.
# ---------------------------------------------------------------------------

locals {
  alarm_period_seconds     = 300
  alarm_evaluation_periods = 1
  alarm_threshold          = 1
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.project}-${var.stage}-api-5xx"
  alarm_description   = "API Gateway HTTP API returned at least one 5xx response in 5 minutes."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = var.api_id, Stage = var.stage }
  statistic           = "Sum"
  period              = local.alarm_period_seconds
  evaluation_periods  = local.alarm_evaluation_periods
  threshold           = local.alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "api_lambda_errors" {
  alarm_name          = "${var.project}-${var.stage}-api-lambda-errors"
  alarm_description   = "The api Lambda reported at least one error in 5 minutes."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = var.api_lambda_name }
  statistic           = "Sum"
  period              = local.alarm_period_seconds
  evaluation_periods  = local.alarm_evaluation_periods
  threshold           = local.alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "worker_lambda_errors" {
  alarm_name          = "${var.project}-${var.stage}-worker-lambda-errors"
  alarm_description   = "The generateWorker Lambda reported at least one error in 5 minutes."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = var.worker_lambda_name }
  statistic           = "Sum"
  period              = local.alarm_period_seconds
  evaluation_periods  = local.alarm_evaluation_periods
  threshold           = local.alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "api_lambda_throttles" {
  alarm_name          = "${var.project}-${var.stage}-api-lambda-throttles"
  alarm_description   = "The api Lambda was throttled at least once in 5 minutes."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = var.api_lambda_name }
  statistic           = "Sum"
  period              = local.alarm_period_seconds
  evaluation_periods  = local.alarm_evaluation_periods
  threshold           = local.alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "worker_lambda_throttles" {
  alarm_name          = "${var.project}-${var.stage}-worker-lambda-throttles"
  alarm_description   = "The generateWorker Lambda was throttled at least once in 5 minutes."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = var.worker_lambda_name }
  statistic           = "Sum"
  period              = local.alarm_period_seconds
  evaluation_periods  = local.alarm_evaluation_periods
  threshold           = local.alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_throttled_requests" {
  alarm_name          = "${var.project}-${var.stage}-dynamodb-throttled-requests"
  alarm_description   = "The DynamoDB single table rejected at least one request due to throttling in 5 minutes."
  namespace           = "AWS/DynamoDB"
  metric_name         = "ThrottledRequests"
  dimensions          = { TableName = var.table_name }
  statistic           = "Sum"
  period              = local.alarm_period_seconds
  evaluation_periods  = local.alarm_evaluation_periods
  threshold           = local.alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}
