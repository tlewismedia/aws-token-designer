output "alerts_topic_arn" {
  description = "SNS topic ARN for alarm and budget notifications."
  value       = aws_sns_topic.alerts.arn
}

output "budget_name" {
  description = "Monthly cost budget name."
  value       = aws_budgets_budget.monthly.name
}

output "alarm_names" {
  description = "All CloudWatch alarm names managed by this module (runbook / verification)."
  value = [
    aws_cloudwatch_metric_alarm.api_5xx.alarm_name,
    aws_cloudwatch_metric_alarm.api_lambda_errors.alarm_name,
    aws_cloudwatch_metric_alarm.worker_lambda_errors.alarm_name,
    aws_cloudwatch_metric_alarm.api_lambda_throttles.alarm_name,
    aws_cloudwatch_metric_alarm.worker_lambda_throttles.alarm_name,
    aws_cloudwatch_metric_alarm.dynamodb_throttled_requests.alarm_name,
    aws_cloudwatch_metric_alarm.generation_count_daily.alarm_name,
    aws_cloudwatch_metric_alarm.estimated_ai_cost_daily.alarm_name,
  ]
}
