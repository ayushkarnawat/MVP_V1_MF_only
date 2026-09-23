"""HTML body for the email-OTP message. Kept separate from email_provider.py
so the markup can be tested in isolation and reworked without touching the
provider/transport code -- see the OTP-email-template design discussion for
the visual direction (Manrope/DM Sans, #22C55E accent, light+dark variants).

Deliberately OTP-specific rather than a shared base template (YAGNI) --
this is still the only email the app sends; extract a shared header/footer
if and when a second email type shows up.
"""

from __future__ import annotations

from html import escape

from app.config import settings


def otp_email_html(otp: str, ttl_minutes: int) -> str:
    """Renders the OTP verification email's HTML body. `otp` is escaped even
    though generate_otp() (otp.py) only ever produces digits -- this function
    doesn't get to assume that stays true, and an unescaped value could break
    the surrounding markup, not just look wrong."""
    safe_otp = escape(otp)
    logo_light = f"{settings.frontend_base_url}/brand/unifolio-logo-light.png"
    logo_dark = f"{settings.frontend_base_url}/brand/unifolio-logo-dark.png"

    return f"""\
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=DM+Sans:wght@500;700&display=swap">
<style>
  /* Most inboxes (Gmail web/app, Outlook desktop) ignore this @font-face
     import and fall back to the system stack below -- Apple Mail and a
     few others are the exception. Harmless to include either way. */
  body {{ margin: 0; background: #FFFFFF; color: #111111; }}
  .wrap {{ font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 32px 24px; }}
  .headline {{ font-size: 16px; line-height: 1.55; margin: 4px 0 26px; }}
  .code-pill {{ background: rgba(34,197,94,0.16); color: #15803D; font-weight: 700; padding: 1px 6px; border-radius: 4px; }}
  .otp-number {{ font-family: 'DM Sans', ui-monospace, "SF Mono", "Roboto Mono", Consolas, monospace; font-variant-numeric: tabular-nums; font-size: 40px; font-weight: 700; letter-spacing: 0.06em; text-align: center; margin: 8px 0 26px; }}
  .rule {{ height: 1px; border: none; background: #E5E5E5; margin: 0 0 22px; }}
  .note {{ font-size: 13.5px; line-height: 1.65; color: #374151; margin: 0; }}
  .disclaimer {{ font-size: 11.5px; line-height: 1.6; color: #6B7280; margin: 24px 0 0; }}
  .logo-light {{ display: block; margin-bottom: 22px; }}
  .logo-dark {{ display: none; margin-bottom: 22px; }}
  @media (prefers-color-scheme: dark) {{
    body {{ background: #0F0F0F !important; color: #F5F5F5 !important; }}
    .code-pill {{ color: #4ADE80 !important; }}
    .rule {{ background: #2A2A2A !important; }}
    .note {{ color: #D4D4D4 !important; }}
    .disclaimer {{ color: #9CA3AF !important; }}
    .logo-light {{ display: none !important; }}
    .logo-dark {{ display: block !important; }}
  }}
</style>
</head>
<body>
<div class="wrap">
  <img class="logo-light" src="{logo_light}" alt="Unifolio" height="22">
  <img class="logo-dark" src="{logo_dark}" alt="Unifolio" height="22">
  <p class="headline">Your <span class="code-pill">verification code</span> to sign in to Unifolio is below.</p>
  <div class="otp-number">{safe_otp}</div>
  <hr class="rule">
  <p class="note">This code expires in <b>{ttl_minutes} minutes</b>. If you didn't request it, you can safely ignore this email — no changes have been made to your account.</p>
  <p class="disclaimer">This is an automated message from Unifolio. Please don't reply to this email.</p>
</div>
</body>
</html>
"""
