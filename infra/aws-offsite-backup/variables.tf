variable "aws_account_id" {
  description = "David's own AWS account. Terraform refuses any other."
  type        = string
  default     = "484907520476"
}

variable "aws_profile" {
  type    = string
  default = "default"
}

variable "region" {
  description = "Same geography as Firebase (asia-southeast1 = Singapore)."
  type        = string
  default     = "ap-southeast-1"
}

variable "key_prefix" {
  description = "Mirrors the Firebase Storage export root, so paths match on both sides."
  type        = string
  default     = "firestore-exports/prod"
}

variable "lock_days" {
  description = "Object Lock COMPLIANCE retention. Nobody, including the root user, can delete or overwrite a version before this."
  type        = number
  default     = 30
}

variable "keep_days" {
  description = "How long a backup stays available before lifecycle expires it."
  type        = number
  default     = 90
}

variable "gcp_service_account_unique_id" {
  description = "Numeric uniqueId (21 digits) of the Google service account that runs exportProdFirestoreCollections. Empty = writer role not created, so nothing outside AWS can write."
  type        = string
  default     = ""

  validation {
    condition     = var.gcp_service_account_unique_id == "" || can(regex("^[0-9]{21}$", var.gcp_service_account_unique_id))
    error_message = "Use the numeric uniqueId (21 digits), not the service account email."
  }
}

variable "token_audience" {
  description = "Audience the function puts in its Google ID token. The trust policy pins it."
  type        = string
  default     = "iht-offsite-backup-484907520476"
}

variable "max_backup_age_hours" {
  description = "Exports run Mon and Thu 02:00 Manila (max gap 96h). Alert past this."
  type        = number
  default     = 100
}

variable "alert_email" {
  description = "Optional. Email for backup alerts (confirm the SNS subscription once)."
  type        = string
  default     = ""
}
