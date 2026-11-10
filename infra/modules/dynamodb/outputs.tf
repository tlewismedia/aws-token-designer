output "table_name" {
  description = "DynamoDB single-table name."
  value       = aws_dynamodb_table.main.name
}

output "table_arn" {
  description = "DynamoDB single-table ARN (IAM policies in Phase 2)."
  value       = aws_dynamodb_table.main.arn
}
