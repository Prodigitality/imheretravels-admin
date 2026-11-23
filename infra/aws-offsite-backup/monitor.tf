# A backup nobody checks is not a backup.
# A daily Lambda reads the latest export summary and alerts if it is missing, stale, or reports errors.

resource "aws_sns_topic" "alerts" {
  name = "iht-offsite-backup-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

data "archive_file" "monitor" {
  type        = "zip"
  source_file = "${path.module}/lambda/check_backup.py"
  output_path = "${path.module}/.build/check_backup.zip"
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "monitor" {
  name               = "iht-offsite-backup-monitor"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

data "aws_iam_policy_document" "monitor" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.backup.arn}/${var.key_prefix}/latest/_export-summary.json"]
  }
  # Without ListBucket a missing object returns 403 instead of 404; we want the honest 404.
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.backup.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${var.key_prefix}/latest/*"]
    }
  }
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.monitor.arn}:*"]
  }
}

resource "aws_iam_role_policy" "monitor" {
  name   = "check-latest-backup"
  role   = aws_iam_role.monitor.id
  policy = data.aws_iam_policy_document.monitor.json
}

resource "aws_cloudwatch_log_group" "monitor" {
  name              = "/aws/lambda/iht-offsite-backup-monitor"
  retention_in_days = 30
}

resource "aws_lambda_function" "monitor" {
  function_name    = "iht-offsite-backup-monitor"
  role             = aws_iam_role.monitor.arn
  runtime          = "python3.13"
  architectures    = ["arm64"]
  handler          = "check_backup.handler"
  filename         = data.archive_file.monitor.output_path
  source_code_hash = data.archive_file.monitor.output_base64sha256
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      BUCKET        = aws_s3_bucket.backup.id
      SUMMARY_KEY   = "${var.key_prefix}/latest/_export-summary.json"
      MAX_AGE_HOURS = tostring(var.max_backup_age_hours)
      TOPIC_ARN     = aws_sns_topic.alerts.arn
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.monitor.name
  }
}

# 09:00 Manila (01:00 UTC) every day.
resource "aws_cloudwatch_event_rule" "daily" {
  name                = "iht-offsite-backup-daily-check"
  schedule_expression = "cron(0 1 * * ? *)"
}

resource "aws_cloudwatch_event_target" "daily" {
  rule = aws_cloudwatch_event_rule.daily.name
  arn  = aws_lambda_function.monitor.arn
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowDailyCheck"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.monitor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily.arn
}

# If the checker itself breaks, that is also an alert.
resource "aws_cloudwatch_metric_alarm" "monitor_errors" {
  alarm_name          = "iht-offsite-backup-monitor-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.monitor.function_name }
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
