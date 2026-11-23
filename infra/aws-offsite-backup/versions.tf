terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # State lives in David's own account. use_lockfile = native S3 locking, no DynamoDB table.
  backend "s3" {
    bucket       = "tfstate-484907520476-apse1"
    key          = "imheretravels/offsite-backup.tfstate"
    region       = "ap-southeast-1"
    profile      = "default"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  # Hard stop: refuses to run against any other account (e.g. the sponsor account).
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project   = "imheretravels-offsite-backup"
      ManagedBy = "terraform"
      Owner     = "david"
    }
  }
}
