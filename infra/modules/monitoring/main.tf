data "aws_caller_identity" "current" {}

resource "aws_sns_topic" "alerts" {
  name = "${var.project}-${var.stage}-alerts"

  tags = var.tags
}

# A topic policy replaces SNS's default policy, so it must preserve the normal
# account/CloudWatch publish path while adding the services that need to send
# notifications:
#   - budgets.amazonaws.com: budget threshold notifications (the budget below
#     publishes to this topic; without this statement the budget notification
#     has no publish permission).
#   - cloudwatch.amazonaws.com: alarm actions.
# Conditions pin both services to this account, and Budgets additionally to
# this specific budget, to avoid confused-deputy access.
locals {
  alerts_topic_arn = aws_sns_topic.alerts.arn
  budget_name      = "${var.project}-${var.stage}-monthly"
  budget_arn       = "arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/${local.budget_name}"
}

data "aws_iam_policy_document" "alerts_topic" {
  statement {
    sid    = "AllowTopicOwner"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    actions = [
      "SNS:GetTopicAttributes",
      "SNS:SetTopicAttributes",
      "SNS:AddPermission",
      "SNS:RemovePermission",
      "SNS:DeleteTopic",
      "SNS:Subscribe",
      "SNS:ListSubscriptionsByTopic",
      "SNS:Publish",
      "SNS:Receive",
    ]

    resources = [local.alerts_topic_arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceOwner"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid    = "AllowCloudWatchPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    actions   = ["SNS:Publish"]
    resources = [local.alerts_topic_arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid    = "AllowBudgetsPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    actions   = ["SNS:Publish"]
    resources = [local.alerts_topic_arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = [local.budget_arn]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = local.alerts_topic_arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Monthly cost budget: $25 limit with $1 / $5 / $10 / $25 thresholds
# (4%, 20%, 40%, 100% of the limit). See docs/PLAN.md section 7.6.
resource "aws_budgets_budget" "monthly" {
  name         = local.budget_name
  budget_type  = "COST"
  limit_amount = "25"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Ensure Budgets can publish before the budget registers the SNS topic.
  depends_on = [aws_sns_topic_policy.alerts]

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
  dimensions          = { ApiId = var.api_id, Stage = var.api_stage_name }
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

resource "aws_cloudwatch_metric_alarm" "dynamodb_read_throttle_events" {
  alarm_name          = "${var.project}-${var.stage}-dynamodb-read-throttle-events"
  alarm_description   = "The DynamoDB single table exceeded read capacity at least once in 5 minutes."
  namespace           = "AWS/DynamoDB"
  metric_name         = "ReadThrottleEvents"
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

resource "aws_cloudwatch_metric_alarm" "dynamodb_write_throttle_events" {
  alarm_name          = "${var.project}-${var.stage}-dynamodb-write-throttle-events"
  alarm_description   = "The DynamoDB single table exceeded write capacity at least once in 5 minutes."
  namespace           = "AWS/DynamoDB"
  metric_name         = "WriteThrottleEvents"
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

# Handled generation failures (kill switch, missing key, Stability non-2xx,
# sharp/S3/DDB) mark the job failed and return success, so the Lambda `Errors`
# metric never increments. The worker emits this EMF metric on those paths.
resource "aws_cloudwatch_metric_alarm" "generation_failures" {
  alarm_name          = "${var.project}-${var.stage}-generation-failures"
  alarm_description   = "At least one handled AI generation failure in 5 minutes (job marked failed with a safe error code)."
  namespace           = var.generation_metric_namespace
  metric_name         = "GenerationFailures"
  dimensions          = { Stage = var.stage }
  statistic           = "Sum"
  period              = local.alarm_period_seconds
  evaluation_periods  = local.alarm_evaluation_periods
  threshold           = local.alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}
