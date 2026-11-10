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

resource "aws_ce_anomaly_monitor" "service" {
  name              = "${var.project}-${var.stage}-service"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

# Low threshold so demo-scale surprises still page: $5 absolute impact.
resource "aws_ce_anomaly_subscription" "low" {
  name      = "${var.project}-${var.stage}-low-threshold"
  frequency = "IMMEDIATE"

  monitor_arn_list = [aws_ce_anomaly_monitor.service.arn]

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      values        = ["5"]
      match_options = ["GREATER_THAN_OR_EQUAL"]
    }
  }

  subscriber {
    type    = "EMAIL"
    address = var.alert_email
  }
}
