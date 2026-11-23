# The role the Firebase export function assumes with its Google-signed ID token.
# No AWS keys exist anywhere: STS verifies Google's signature and the three pinned claims.
#
# Google service-account ID token claims -> IAM condition keys:
#   azp (SA uniqueId)  -> accounts.google.com:aud   (the aud key maps to azp when azp is present)
#   aud (our audience) -> accounts.google.com:oaud
#   sub (SA uniqueId)  -> accounts.google.com:sub

locals {
  writer_enabled = var.gcp_service_account_unique_id != ""
}

data "aws_iam_policy_document" "writer_trust" {
  count = local.writer_enabled ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = ["accounts.google.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "accounts.google.com:aud"
      values   = [var.gcp_service_account_unique_id]
    }
    condition {
      test     = "StringEquals"
      variable = "accounts.google.com:sub"
      values   = [var.gcp_service_account_unique_id]
    }
    condition {
      test     = "StringEquals"
      variable = "accounts.google.com:oaud"
      values   = [var.token_audience]
    }
  }
}

resource "aws_iam_role" "writer" {
  count                = local.writer_enabled ? 1 : 0
  name                 = "iht-offsite-backup-writer"
  assume_role_policy   = data.aws_iam_policy_document.writer_trust[0].json
  max_session_duration = 3600
}

# Write-only: the writer cannot list, read, or delete what it wrote.
data "aws_iam_policy_document" "writer" {
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.backup.arn}/${var.key_prefix}/*"]
  }
}

resource "aws_iam_role_policy" "writer" {
  count  = local.writer_enabled ? 1 : 0
  name   = "put-backups-only"
  role   = aws_iam_role.writer[0].id
  policy = data.aws_iam_policy_document.writer.json
}
