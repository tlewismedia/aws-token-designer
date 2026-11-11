output "alerts_topic_arn" {
  description = "SNS topic ARN for alarm and budget notifications."
  value       = aws_sns_topic.alerts.arn
}

output "budget_name" {
  description = "Monthly cost budget name."
  value       = aws_budgets_budget.monthly.name
}
