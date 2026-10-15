"""Sends a failure email for a LeapSwitch cron job, reusing the existing SES
email provider (app/services/auth/email_provider.py) instead of a new
notification channel -- CloudPe has no SNS/CloudWatch alarm equivalent, but
email stays on real AWS regardless of host (Docs/orchestration/
leapswitch-staging-plan.html D4), so the SES-only IAM user already planned
for that purpose is enough.

Run from backend/: .venv/bin/python scripts/send_job_failure_alert.py <job_name> <exit_code> < job_output.txt
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.services.auth.email_provider import EmailSendError, SesEmailProvider

OPS_ALERT_EMAIL_ENV = "OPS_ALERT_EMAIL"


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: send_job_failure_alert.py <job_name> <exit_code>", file=sys.stderr)
        return 2
    job_name, exit_code = sys.argv[1], sys.argv[2]
    output = sys.stdin.read()[-8000:]

    to_email = os.environ.get(OPS_ALERT_EMAIL_ENV, "")
    if not to_email:
        print(f"{OPS_ALERT_EMAIL_ENV} is not set, cannot send failure alert", file=sys.stderr)
        return 1
    if settings.email_delivery_mode != "ses":
        print("EMAIL_DELIVERY_MODE is not 'ses', cannot send failure alert", file=sys.stderr)
        return 1

    try:
        SesEmailProvider().send_email(
            to=to_email,
            subject=f"[LeapSwitch staging] {job_name} failed (exit {exit_code})",
            body=f"{job_name} exited {exit_code} on LeapSwitch staging.\n\nLast output:\n{output}",
        )
    except EmailSendError as exc:
        print(f"failed to send failure alert: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
