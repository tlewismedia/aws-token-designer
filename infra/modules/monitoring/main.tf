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

# Cost Anomaly Detection is intentionally NOT managed here: this AWS
# account already runs a DIMENSIONAL services monitor
# ("Default-Services-Monitor"), and the account quota rejects a second one
# (verified 2026-11-11: ValidationException, limit exceeded). The monthly
# budget above remains the primary cost guardrail. Revisit if the account
# quota is raised or the default monitor is removed.
