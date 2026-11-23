"""Run: python -m unittest discover -s infra/aws-offsite-backup/lambda"""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

os.environ.setdefault("AWS_DEFAULT_REGION", "ap-southeast-1")
sys.path.insert(0, os.path.dirname(__file__))

from check_backup import evaluate  # noqa: E402

NOW = datetime(2026, 11, 23, 1, 0, tzinfo=timezone.utc)
GOOD = {"errors": 0, "totalDocuments": 1200, "results": [], "offsite": {"enabled": True, "failed": 0}}


class Evaluate(unittest.TestCase):
    def test_healthy(self):
        self.assertEqual(evaluate(GOOD, NOW - timedelta(hours=30), NOW, 100), [])

    def test_missing(self):
        self.assertEqual(len(evaluate(None, None, NOW, 100)), 1)

    def test_stale(self):
        problems = evaluate(GOOD, NOW - timedelta(hours=101), NOW, 100)
        self.assertIn("101h old", problems[0])

    def test_collection_errors_named(self):
        s = dict(GOOD, errors=1, results=[{"collection": "bookings", "status": "error"}])
        self.assertIn("bookings", evaluate(s, NOW, NOW, 100)[0])

    def test_offsite_failures(self):
        s = dict(GOOD, offsite={"enabled": True, "failed": 2})
        self.assertIn("2 file(s)", evaluate(s, NOW, NOW, 100)[0])

    def test_empty_backup(self):
        s = dict(GOOD, totalDocuments=0)
        self.assertIn("0 documents", evaluate(s, NOW, NOW, 100)[0])


if __name__ == "__main__":
    unittest.main()
