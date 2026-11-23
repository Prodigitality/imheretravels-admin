output "bucket" {
  value = aws_s3_bucket.backup.id
}

output "region" {
  value = var.region
}

output "writer_role_arn" {
  value = local.writer_enabled ? aws_iam_role.writer[0].arn : "(not created: set gcp_service_account_unique_id)"
}

output "token_audience" {
  value = var.token_audience
}

output "function_env" {
  description = "Paste into functions/.env.imheretravels-a3f81 once the client approves."
  value = local.writer_enabled ? join("\n", [
    "OFFSITE_BACKUP_BUCKET=${aws_s3_bucket.backup.id}",
    "OFFSITE_BACKUP_REGION=${var.region}",
    "OFFSITE_BACKUP_ROLE_ARN=${aws_iam_role.writer[0].arn}",
    "OFFSITE_BACKUP_AUDIENCE=${var.token_audience}",
  ]) : "(writer role not created yet)"
}

output "monitor_function" {
  value = aws_lambda_function.monitor.function_name
}
