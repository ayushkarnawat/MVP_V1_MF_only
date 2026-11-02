"""HTML bodies for authentication and Head of Family emails."""

from __future__ import annotations

from html import escape

SUPPORT_EMAIL = "support@unifolio.in"


def _email_header() -> str:
    return """\
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Without these, some clients (Gmail's app confirmed on a real device)
     apply their own automatic color-inversion over the email instead of
     evaluating the @media (prefers-color-scheme) block below at all --
     this opts into "trust the email's own dark-mode CSS" explicitly. -->
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=DM+Sans:wght@500;700&display=swap">
<style>
  /* Most inboxes (Gmail web/app, Outlook desktop) ignore this @font-face
     import and fall back to the system stack below -- Apple Mail and a
     few others are the exception. Harmless to include either way. */
  body { margin: 0; background: #FFFFFF; color: #111111; }
  .wrap { font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 32px 24px; }
  .headline { font-size: 16px; line-height: 1.55; margin: 4px 0 26px; }
  .code-pill { color: #22C55E; font-weight: 700; }
  .support { color: #22C55E; font-weight: 700; text-decoration: none; }
  .otp-number { font-family: 'DM Sans', ui-monospace, "SF Mono", "Roboto Mono", Consolas, monospace; font-variant-numeric: tabular-nums; font-size: 40px; font-weight: 700; letter-spacing: 0.06em; text-align: center; margin: 8px 0 26px; }
  .rule { height: 1px; border: none; background: #E5E5E5; margin: 0 0 22px; }
  .note { font-size: 13.5px; line-height: 1.65; color: #374151; margin: 0; }
  .disclaimer { font-size: 11.5px; line-height: 1.6; color: #6B7280; margin: 24px 0 0; }
  @media (min-width: 600px) {
    .otp-number { text-align: left; margin-left: 88px; }
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0F0F0F !important; color: #F5F5F5 !important; }
    .code-pill { color: #22C55E !important; }
    .support { color: #22C55E !important; }
    .rule { background: #2A2A2A !important; }
    .note { color: #D4D4D4 !important; }
    .disclaimer { color: #9CA3AF !important; }
  }
</style>
</head>
<body>
<div class="wrap">
"""


def _email_footer() -> str:
    return f"""\
  <p class="disclaimer">This is an automated message from Unifolio. Please don't reply to this email. For help, write to {SUPPORT_EMAIL}.</p>
</div>
</body>
</html>
"""


def otp_email_html(
    otp: str,
    ttl_minutes: int,
    *,
    headline: str | None = None,
    note: str | None = None,
) -> str:
    """Render an OTP email; omitted variants reproduce the sign-in HTML exactly."""
    safe_otp = escape(otp)
    headline_html = (
        escape(headline)
        if headline is not None
        else 'Your <span class="code-pill">verification code</span> to sign in to Unifolio is below.'
    )
    note_html = (
        escape(note)
        if note is not None
        else (
            f'This code expires in <b>{ttl_minutes} minutes</b>. If you didn\'t request it, '
            f'contact us at <a class="support" href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a> '
            "and we'll look into it."
        )
    )

    return f"""\
{_email_header()}  <p class="headline">{headline_html}</p>
  <div class="otp-number">{safe_otp}</div>
  <hr class="rule">
  <p class="note">{note_html}</p>
{_email_footer()}"""


def _notice_email_html(
    *, headline: str, body: str, link_text: str | None = None, link_url: str | None = None
) -> str:
    link = ""
    if link_text is not None and link_url is not None:
        link = (
            f'  <p class="note"><a class="support" href="{escape(link_url, quote=True)}">'
            f"{escape(link_text)}</a></p>\n"
        )
    return (
        _email_header()
        + f'  <p class="headline">{escape(headline)}</p>\n'
        + f'  <p class="note">{escape(body)}</p>\n'
        + link
        + _email_footer()
    )


def head_changed_email(
    *, new_head_name: str, old_head_name: str, undo_url: str | None = None
) -> tuple[str, str, str]:
    """The notice goes to both people. The undo link is a working credential, so
    pass `undo_url` only for the previous head's own addresses; every other
    recipient gets the same notice with a support contact instead of a link."""
    subject = "The Head of Family on Unifolio has changed."
    facts = (
        f"{new_head_name} is now Head of Family and signs in with this email. "
        f"{old_head_name} remains a member and no longer signs in. All portfolio data is unchanged. "
    )
    if undo_url is None:
        text = f"{facts}If this was not you, contact {SUPPORT_EMAIL}."
        return subject, text, _notice_email_html(headline=subject, body=text)
    body_without_link = f"{facts}If this was not you, use the undo link within 24 hours"
    html = _notice_email_html(
        headline=subject,
        body=body_without_link + ".",
        link_text="Undo the Head of Family change",
        link_url=undo_url,
    )
    return subject, f"{body_without_link}: {undo_url}", html


def head_change_undo_email(*, undo_url: str) -> tuple[str, str, str]:
    subject = "Undo the Head of Family change."
    body_without_link = (
        "Use this link within 24 hours to restore the previous sign-in. It will fail with a clear "
        "message if the old phone or email has been taken in the meantime"
    )
    body = f"{body_without_link}: {undo_url}"
    html = _notice_email_html(
        headline=subject,
        body=body_without_link + ".",
        link_text="Undo the Head of Family change",
        link_url=undo_url,
    )
    return subject, body, html


def head_change_reversed_email(
    *, restored_head_name: str, other_head_name: str
) -> tuple[str, str, str]:
    """Plain notice that an undo restored the previous Head of Family. No link: nothing here
    can be used to change anything."""
    subject = "The Head of Family on Unifolio has been changed back."
    text = (
        f"{restored_head_name} is the Head of Family again and signs in with the previous email "
        f"and phone number. {other_head_name} remains a member and no longer signs in. "
        f"All portfolio data is unchanged. If this was not you, contact {SUPPORT_EMAIL}."
    )
    return subject, text, _notice_email_html(headline=subject, body=text)


def contact_changed_email(
    *, channel: str, new_value_masked: str, reverse_url: str
) -> tuple[str, str, str]:
    """Sent to the address the account used BEFORE a sign-in email or phone change (for a phone
    change, to the account's email). The link is a working credential: it puts the old value back
    and signs everyone out, so it goes only to that address."""
    what = "email address" if channel == "email" else "phone number"
    subject = f"The sign-in {what} on your Unifolio account was changed."
    body_without_link = (
        f"The {what} you sign in with was changed to {new_value_masked}. "
        "If this was you, you do not need to do anything. "
        "If it was not you, use the link within 7 days to put the old one back and sign out "
        "everyone. For 7 days after a change like this the Head of Family cannot be changed"
    )
    html = _notice_email_html(
        headline=subject,
        body=body_without_link + ".",
        link_text="This was not me, undo the change",
        link_url=reverse_url,
    )
    return subject, f"{body_without_link}: {reverse_url}", html