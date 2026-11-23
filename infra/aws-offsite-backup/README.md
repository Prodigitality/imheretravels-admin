# Off-site Firestore backup (AWS)

## Why

`exportProdFirestoreCollections` exports bookings, payments, users, and other collections twice a week (Mon/Thu 02:00 Manila).
It writes them to Firebase Storage **in the same project** (`imheretravels-a3f81`).
If that project is deleted, an owner account is compromised, or a bad script wipes the bucket, the backups go with the data.

This adds a second copy in a different cloud and a different account, where nobody can delete it early.

## Architecture

```
Firebase scheduled function (asia-southeast1)
  │ 1. asks the metadata server for a Google-signed ID token (aud = iht-offsite-backup-484907520476)
  ▼
AWS STS  AssumeRoleWithWebIdentity
  │    trust policy pins: azp + sub = service account uniqueId, aud = our audience
  │ 2. 1-hour credentials for iht-offsite-backup-writer (s3:PutObject only)
  ▼
S3  iht-offsite-backup-484907520476-apse1 (ap-southeast-1)
  • Object Lock COMPLIANCE, 30 days: no one (not even root) can delete or overwrite a version early
  • versioning, SSE-S3, public access blocked, TLS-only, retention changes denied
  • lifecycle: expire after 90 days
  ▲
  │ 3. daily 09:00 Manila
Lambda iht-offsite-backup-monitor ── SNS iht-offsite-backup-alerts (email)
  alerts if the latest summary is missing, older than 100 h, has failed collections,
  has failed off-site copies, or holds 0 documents. If the monitor itself errors,
  a CloudWatch alarm fires too.
```

**Security properties**

| Property | How |
|---|---|
| No stored keys | Google ID token → STS federation; nothing to rotate or leak |
| Writer is write-only | It can't list, read, or delete; a compromised function can't destroy backups |
| Tamper-proof retention | Object Lock compliance mode, plus a bucket policy denying retention/legal-hold changes |
| Blast radius | Separate cloud and separate account from the data source |
| Wrong-account guard | `allowed_account_ids` makes Terraform refuse any other account |

**Cost.** Roughly $0–0.10 a month:
- S3 storage at a few hundred MB × 90 days.
- About 30 Lambda runs a month.
- SNS and CloudWatch within the free tier.

The account-wide `account-monthly-30usd` budget covers this.

## Status

| Step | State |
|---|---|
| Bucket, lock, lifecycle, monitor, alerts (Terraform) | ✅ applied 2026-11-23 |
| Verified: compliance lock blocks version delete by an admin | ✅ (`selftest/lock-check.txt`, locked until 2026-12-23) |
| Verified: monitor alerts on an empty bucket | ✅ |
| Function code (`functions/src/offsite-backup.ts`) + tests | ✅ off by default (no env vars = no-op) |
| Writer role | ✅ applied 2026-11-23, trusts `283391684985-compute@developer.gserviceaccount.com` (uniqueId `108542932216992232055`) |
| Turn on in prod | ✅ approved and deployed 2026-11-23. First run: 12 collections, 6,440 docs, 33.9 MB, 0 off-site failures; monitor `healthy: true` |

Deploy note: the Firebase CLI's code-loading step can time out at 10 s on this codebase. Deploy with `FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only functions:exportProdFirestoreCollections --project prod`.

## Remaining steps

1. **Get the service account's uniqueId** (with your own Google login):

   ```sh
   gcloud auth login
   gcloud functions describe exportProdFirestoreCollections --region asia-southeast1 \
     --project imheretravels-a3f81 --format='value(serviceConfig.serviceAccountEmail)'
   gcloud iam service-accounts describe <that email> --format='value(uniqueId)'
   ```

2. **Create the writer role.** Put the ID (and `alert_email`) in `terraform.tfvars`, then run:

   ```sh
   terraform apply
   terraform output -raw function_env   # -> 4 OFFSITE_BACKUP_* lines
   ```

3. **Get approval.** These collections contain customer PII and payment records, so ImHereTravels has to approve storing them in this AWS account. Better still, set `aws_account_id` to an account they own and apply there.

4. **Turn it on.**
   - Add the four lines to `functions/.env.imheretravels-a3f81`.
   - Deploy only this function: `firebase deploy --only functions:exportProdFirestoreCollections --project prod`.
   - Trigger one run from Cloud Scheduler ("Force run"), then invoke the monitor Lambda and confirm `healthy: true`.

5. **Run a restore drill** (put it on the calendar quarterly):
   - Download one run's `collections/*.json`.
   - Import it into `imheretravels-dev`.
   - Compare document counts with the run's `_export-summary-*.json`.

## Later

- **Dedicated service account.** Give the export function its own service account. Gen 2 functions default to the shared compute service account, so today *any* function in the project could mint this token. Writes stay put-only and locked, so the risk is low, but a dedicated account is cleaner.
- **Collection list.** Back up any collections missing from `COLLECTIONS`, such as `transactions` or `installments`, if they exist.
