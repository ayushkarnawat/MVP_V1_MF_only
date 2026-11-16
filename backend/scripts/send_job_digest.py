"""Sends a plain status email (not a failure) for a LeapSwitch cron job, to the same recipients as
send_job_failure_alert.py (OPS_ALERT_EMAIL, comma-separated), through the same SES provider.

Used by deploy/leapswitch/scripts/nav-digest.sh for the daily NAV digest.

Run from backend/: python scripts/send_job_digest.py "<subject>" < body.txt
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.services.auth.email_provider import EmailSendError, SesEmailProvider

OPS_ALERT_EMAIL_ENV = "OPS_ALERT_EMAIL"


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: send_job_digest.py <subject>  (body on stdin)", file=sys.stderr)
        return 2
    subject = sys.argv[1]
    body = sys.stdin.read()[:8000]  # keep the head: it carries the OK / ATTENTION status

    to_email = os.environ.get(OPS_ALERT_EMAIL_ENV, "")
    if not to_email:
        print(f"{OPS_ALERT_EMAIL_ENV} is not set, cannot send digest", file=sys.stderr)
        return 1
    if settings.email_delivery_mode != "ses":
        print("EMAIL_DELIVERY_MODE is not 'ses', cannot send digest", file=sys.stderr)
        return 1

    try:
        SesEmailProvider().send_email(to=to_email, subject=subject, body=body)
    except EmailSendError as exc:
        print(f"failed to send digest: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
