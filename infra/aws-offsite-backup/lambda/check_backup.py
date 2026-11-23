"""Daily check that the off-site Firestore backup is fresh and complete.

Alerts (SNS) when the latest export summary is missing, older than
MAX_AGE_HOURS, or reports failed collections or failed off-site writes.
"""

import json
import os
from datetime import datetime, timezone

_clients = {}


def _client(name):
    # Imported lazily so evaluate() is unit-testable without boto3 installed.
    if name not in _clients:
        import boto3

        _clients[name] = boto3.client(name)
    return _clients[name]


def evaluate(summary, last_modified, now, max_age_hours):
    """Return a list of human-readable problems (empty = healthy)."""
    if summary is None:
        return ["No export summary found in the off-site bucket."]

    problems = []
    age_hours = (now - last_modified).total_seconds() / 3600
    if age_hours > max_age_hours:
        problems.append(
            f"Latest backup is {age_hours:.0f}h old (limit {max_age_hours}h)."
        )

    errors = summary.get("errors", 0)
    if errors:
        failed = [r["collection"] for r in summary.get("results", []) if r.get("status") == "error"]
        problems.append(f"{errors} collection(s) failed to export: {', '.join(failed) or 'unknown'}.")

    offsite_failed = (summary.get("offsite") or {}).get("failed", 0)
    if offsite_failed:
        problems.append(f"{offsite_failed} file(s) failed to copy off-site.")

    if summary.get("totalDocuments", 0) == 0:
        problems.append("Latest backup contains 0 documents.")

    return problems


def load_summary(bucket, key):
    from botocore.exceptions import ClientError

    try:
        obj = _client("s3").get_object(Bucket=bucket, Key=key)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return None, None
        raise
    return json.loads(obj["Body"].read()), obj["LastModified"]


def handler(event, context):
    bucket = os.environ["BUCKET"]
    key = os.environ["SUMMARY_KEY"]
    max_age = float(os.environ["MAX_AGE_HOURS"])

    summary, last_modified = load_summary(bucket, key)
    problems = evaluate(summary, last_modified, datetime.now(timezone.utc), max_age)

    if problems:
        body = "\n".join(f"- {p}" for p in problems)
        body += f"\n\nBucket: s3://{bucket}/{key}"
        _client("sns").publish(
            TopicArn=os.environ["TOPIC_ARN"],
            Subject="ImHereTravels off-site backup needs attention",
            Message=body,
        )
        print(f"ALERT sent: {problems}")
    else:
        print(
            f"OK: {summary.get('totalDocuments')} docs, "
            f"exported {summary.get('exportedAt')}"
        )

    return {"healthy": not problems, "problems": problems}
