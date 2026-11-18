"""HTML bodies for authentication and Head of Family emails."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from html import escape
from typing import Literal

from app.config import settings
from app.core.time_format import format_ist_datetime

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
    *,
    headline: str,
    body: str | list[str],
    link_text: str | None = None,
    link_url: str | None = None,
) -> str:
    """A notice email. `body` is one paragraph, or a list of paragraphs."""
    paragraphs = [body] if isinstance(body, str) else body
    link = ""
    if link_text is not None and link_url is not None:
        link = (
            f'  <p class="note"><a class="support" href="{escape(link_url, quote=True)}">'
            f"{escape(link_text)}</a></p>\n"
        )
    return (
        _email_header()
        + f'  <p class="headline">{escape(headline)}</p>\n'
        + "".join(f'  <p class="note">{escape(paragraph)}</p>\n' for paragraph in paragraphs)
        + link
        + _email_footer()
    )


HEAD_CHANGED_SUBJECT = "The Head of Family on Unifolio has changed."
UNDO_SUBJECT = "Undo the Head of Family change."
_REVERSED_SUBJECT = "The Head of Family on Unifolio has been changed back."

_Scheme = Literal["auto", "light", "dark"]
_Illustration = Literal["ill-forward", "ill-back"]
_Icon = Literal["crown", "layers", "person", "people", "shield", "date", "warn", "link"]

_TABLE = 'role="presentation" border="0" cellpadding="0" cellspacing="0"'
_SYSTEM_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
_BODY_FONT = f"'Manrope',{_SYSTEM_SANS}"
_HEAD_FONT = f"'DM Sans',{_SYSTEM_SANS}"
_TEAM = "Team Unifolio"
_DATA_UNCHANGED = "Your family’s portfolio data remains unchanged."
_NOTICE_FOOTER = (
    "We’re here if you need us.",
    "This is an automated notification. Please do not reply to this email.",
)

_PHONE_STYLES = """\
@media (max-width: 480px) {
  .email-backdrop { padding: 12px 8px !important; }
  .email-card { padding: 16px 14px 12px !important; }
  .email-headline { font-size: 25px !important; }
  .email-subtitle, .block-dark { font-size: 13.5px !important; }
  .illustration { width: 96px !important; }
  .illustration img { width: 96px !important; height: 78px !important; }
  .block-dark { padding: 12px !important; }
  .block-pale { padding: 10px 12px !important; }
  .block-pale, .block-line { font-size: 13px !important; }
  .block-icon { width: 34px !important; padding-right: 10px !important; }
  .block-icon img { width: 34px !important; height: 34px !important; }
  .email-button { font-size: 15px !important; padding: 13px !important; }
}
"""


@dataclass(frozen=True)
class _Palette:
    backdrop: str
    card: str
    ink: str
    muted: str
    footer: str
    accent: str
    rule: str
    link_border: str
    pale: str
    icon: str
    illustration: str


_LIGHT = _Palette(
    backdrop="#EEF6F0", card="#FFFFFF", ink="#111111", muted="#4B4B4B", footer="#717171",
    accent="#15803D", rule="#ECECEC", link_border="#DFDFDF", pale="#EAFBF0",
    icon="#EAFBF0", illustration="#EAFBF0",
)
_DARK = _Palette(
    backdrop="#111111", card="#1A1A1A", ink="#FCFCFC", muted="#A3A3A3", footer="#A3A3A3",
    accent="#34D399", rule="#2E2E2E", link_border="#2E2E2E", pale="#17261C",
    icon="#1F3B28", illustration="#F2FCF6",
)
_DARK_MODE = f"""\
@media (prefers-color-scheme: dark) {{
  body, .email-backdrop {{ background: {_DARK.backdrop} !important; }}
  .email-card {{ background: {_DARK.card} !important; color: {_DARK.ink} !important; }}
  .email-ink {{ color: {_DARK.ink} !important; }}
  .email-muted {{ color: {_DARK.muted} !important; }}
  .email-accent {{ color: {_DARK.accent} !important; }}
  .email-footer {{ color: {_DARK.footer} !important; border-color: {_DARK.rule} !important; }}
  .block-pale {{ background: {_DARK.pale} !important; }}
  .icon-disc {{ background: {_DARK.icon} !important; }}
  .illustration-disc {{ background: {_DARK.illustration} !important; }}
  .email-link-box {{ border-color: {_DARK.link_border} !important; }}
  .light-only {{ display: none !important; }}
  .dark-only {{ display: block !important; }}
}}
"""


@dataclass(frozen=True)
class _IconBlock:
    kind: Literal["dark", "pale", "line"]
    icon: _Icon
    body: str
    heading: str = ""
    label: str = ""
    bold_suffix: str = ""
    link_box: str = ""
    support: Literal["link", "text"] | None = None

    def plain(self) -> str:
        lines = (self.label, self.heading, self.body + self.bold_suffix, self.link_box)
        return "\n".join(filter(None, lines))


@dataclass(frozen=True)
class _Button:
    label: str
    url: str

    def plain(self) -> str:
        # The complete URL is printed separately in the link box.
        return self.label


@dataclass(frozen=True)
class _BrandedEmail:
    headline: tuple[str, str, str]
    subtitle: str
    illustration: _Illustration
    blocks: tuple[_IconBlock | _Button, ...]
    footer: tuple[str, str]
    tag: str = ""

    def plain(self) -> str:
        header = "\n".join(filter(None, (self.tag, "".join(self.headline), self.subtitle)))
        footer = "\n".join((*self.footer, _TEAM))
        blocks = [block.plain() for block in self.blocks]
        last = self.blocks[-1]
        if isinstance(last, _IconBlock) and last.link_box:
            # Keep the plain-text undo URL at the end so readers extracting its fragment
            # through end of text still get only the token.
            return "\n\n".join((header, *blocks[:-1], footer, blocks[-1]))
        return "\n\n".join((header, *blocks, footer))


def _image_pair(
    base: str,
    asset: str,
    alt: str,
    width: int,
    height: int,
    scheme: _Scheme,
) -> str:
    def image(version: str) -> str:
        return (
            f'<img src="{base}/email/{asset}-{version}.png" width="{width}" height="{height}" '
            f'alt="{alt}" style="display:block;border:0">'
        )

    if scheme != "auto":
        return image(scheme)
    # Keep the fallback hiding inline even when an inbox removes the style block.
    return (
        f'<div class="light-only">{image("light")}</div>'
        f'<div class="dark-only" style="display:none;mso-hide:all">{image("dark")}</div>'
    )


def _support_text(text: str, palette: _Palette, *, link: bool) -> str:
    style = f'class="email-accent" style="color:{palette.accent}"'
    address = (
        f'<a {style} href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>'
        if link
        else f'<span {style}>{SUPPORT_EMAIL}</span>'
    )
    return escape(text).replace(SUPPORT_EMAIL, address)


def _block_html(
    block: _IconBlock | _Button, base: str, palette: _Palette, scheme: _Scheme
) -> str:
    if isinstance(block, _Button):
        return (
            '<tr><td style="padding-bottom:16px">'
            f'<a class="email-button" href="{escape(block.url)}" '
            'style="display:block;background:#22C55E;color:#111111;text-align:center;'
            'text-decoration:none;border-radius:99px;font-size:17px;font-weight:700;padding:16px">'
            f'{escape(block.label)}</a></td></tr>\n'
        )

    if block.kind == "dark":
        style = "background:#14301F;color:#FFFFFF;border-radius:14px;padding:16px 18px;font-size:15px"
        heading_style = f"font-family:{_HEAD_FONT};font-size:19px;font-weight:700"
        heading_class = ""
        gap, bottom = 16, 14
    elif block.kind == "pale":
        style = (
            f"background:{palette.pale};border-radius:14px;padding:14px 18px;font-size:14.5px"
        )
        heading_style = f"color:{palette.accent};font-family:{_HEAD_FONT};font-size:17px;font-weight:700"
        heading_class = ' class="email-accent"'
        gap, bottom = 16, 14
    else:
        style = "font-size:14.5px"
        heading_style = heading_class = ""
        gap, bottom = 14, 12

    icon_alt = "Warning" if block.icon == "warn" else block.icon.title()
    icon = _image_pair(base, f"ic-{block.icon}", icon_alt, 44, 44, scheme)
    label = (
        '<div style="color:#4ADE80;font-size:11px;font-weight:700;letter-spacing:.07em;'
        f'margin-bottom:2px">{escape(block.label)}</div>\n' if block.label else ""
    )
    heading = (
        f'<div{heading_class} style="{heading_style};margin-bottom:2px"><b>{escape(block.heading)}</b></div>\n'
        if block.heading else ""
    )
    body = (
        _support_text(block.body, palette, link=block.support == "link")
        if block.support else escape(block.body)
    )
    if block.bold_suffix:
        body += f"<b>{escape(block.bold_suffix)}</b>"
    link_box = (
        f'<div class="email-link-box email-muted" style="border:1px solid {palette.link_border};'
        f'border-radius:12px;padding:9px 12px;font-size:12.5px;color:{palette.muted};'
        f'margin-top:8px;word-break:break-all;overflow-wrap:anywhere">{escape(block.link_box)}</div>\n'
        if block.link_box else ""
    )
    return f"""\
<tr><td style="padding-bottom:{bottom}px">
  <table {_TABLE} width="100%" style="table-layout:fixed"><tr>
    <td class="block-{block.kind}" style="{style}">
      <table {_TABLE} width="100%" style="table-layout:fixed"><tr>
        <td class="block-icon" width="44" valign="middle" style="width:44px;padding-right:{gap}px">
          <div class="icon-disc" style="background:{palette.icon};border-radius:50%">{icon}</div>
        </td>
        <td valign="middle" style="overflow-wrap:anywhere;word-wrap:break-word">
          {label}{heading}{body}
          {link_box}
        </td>
      </tr></table>
    </td>
  </tr></table>
</td></tr>
"""


def _branded_layout(email: _BrandedEmail, *, scheme: _Scheme = "auto") -> str:
    palette = _DARK if scheme == "dark" else _LIGHT
    dark_styles = _DARK_MODE if scheme == "auto" else ""
    base = escape(settings.frontend_base_url.rstrip("/"))
    logo = _image_pair(base, "logo", "Unifolio", 128, 28, scheme)
    illustration_alt = (
        "Illustration: change of Head of Family"
        if email.illustration == "ill-forward" else "Illustration: change reversed"
    )
    illustration = _image_pair(base, email.illustration, illustration_alt, 150, 118, scheme)
    before, accent, after = map(escape, email.headline)
    blocks = "".join(_block_html(block, base, palette, scheme) for block in email.blocks)
    footer = "<br>\n".join(_support_text(line, palette, link=True) for line in email.footer)
    tag = (
        f'<td align="right" class="email-accent" style="color:{palette.accent};'
        f'font-size:11px;font-weight:700;letter-spacing:.07em">{escape(email.tag)}</td>'
        if email.tag else ""
    )

    return f"""\
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
{_PHONE_STYLES}{dark_styles}</style>
</head>
<body style="margin:0;background:{palette.backdrop};font-family:{_BODY_FONT};line-height:1.5">
<table {_TABLE} width="100%">
<tr><td align="center" class="email-backdrop" style="background:{palette.backdrop};padding:20px 14px">
  <!--[if mso]><table {_TABLE} width="600" align="center"><tr><td><![endif]-->
  <table {_TABLE} width="100%" style="width:100%;max-width:600px;table-layout:fixed">
  <tr><td align="left" class="email-card"
          style="background:{palette.card};color:{palette.ink};border-radius:18px;padding:22px 22px 16px">
    <table {_TABLE} width="100%">
      <tr><td style="padding-bottom:18px">
        <table {_TABLE} width="100%"><tr><td>{logo}</td>{tag}</tr></table>
      </td></tr>
      <tr><td style="padding-bottom:16px">
        <table {_TABLE} width="100%" style="table-layout:fixed"><tr>
          <td valign="middle" style="padding-right:12px">
            <h1 class="email-headline" style="margin:0;font-family:{_HEAD_FONT};font-size:32px;font-weight:700;line-height:1.1">{before}<span class="email-accent" style="color:{palette.accent}">{accent}</span>{after}</h1>
            <p class="email-subtitle email-muted" style="margin:10px 0 0;color:{palette.muted};font-size:15px">{escape(email.subtitle)}</p>
          </td>
          <td class="illustration" width="150" valign="middle" style="width:150px">
            <div class="illustration-disc" style="background:{palette.illustration};border-radius:50%">{illustration}</div>
          </td>
        </tr></table>
      </td></tr>
      {blocks}
      <tr><td>
        <div class="email-footer" style="padding-top:12px;border-top:1px solid {palette.rule};color:{palette.footer};font-size:13px">
          {footer}
          <div class="email-ink" style="margin-top:10px;color:{palette.ink};font-family:{_HEAD_FONT};font-size:16px"><b>{_TEAM}</b></div>
        </div>
      </td></tr>
    </table>
  </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
"""


def _new_head_content() -> _BrandedEmail:
    return _BrandedEmail(
        tag="ACCOUNT UPDATE",
        headline=("You’re now the ", "Head of Family.", ""),
        subtitle="The Head of Family role for your Unifolio account has been transferred to you.",
        illustration="ill-forward",
        blocks=(
            _IconBlock(
                "dark", "crown",
                "You can now sign in using your own email address or mobile number to access "
                "and manage your family’s combined financial view.",
            ),
            _IconBlock(
                "pale", "layers", "All existing investments and financial information remain intact.",
                heading=_DATA_UNCHANGED,
            ),
        ),
        footer=(
            "This is an automated account notification. Please do not reply.",
            f"Need help? We’re here at {SUPPORT_EMAIL}.",
        ),
    )


def _undo_content(undo_url: str, valid_until: datetime) -> _BrandedEmail:
    return _BrandedEmail(
        tag="ACCOUNT SECURITY",
        headline=("Want to ", "reverse", " this change?"),
        subtitle=(
            "If you didn’t authorise the change to your family’s Head of Family, "
            "you can restore the previous sign-in using the button below."
        ),
        illustration="ill-back",
        blocks=(
            _Button("Undo Head of Family Change", undo_url),
            _IconBlock(
                "line", "date", "This link is valid until ",
                bold_suffix=f"{format_ist_datetime(valid_until, full_month=True)}.",
            ),
            _IconBlock(
                "line", "warn",
                "Please note: The link will expire earlier if the previous phone number or "
                "email address is used for another account in the meantime.",
            ),
            _IconBlock(
                "pale", "link", "You can copy and paste the link below into your browser:",
                heading="Having trouble with the button?", link_box=undo_url,
            ),
        ),
        footer=(
            "This is an automated security email. Please do not reply.",
            f"Need help? Contact us at {SUPPORT_EMAIL}.",
        ),
    )


# Directional embeddings, overrides, isolates and marks: no real name needs them, and an unclosed override reverses the fixed
# sentence around the name (Codex whole-batch review of B, finding 7). Right-to-left LETTERS are untouched.
_BIDI_CONTROLS = dict.fromkeys(map(ord, "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u200e\u200f\u061c"))


def _clean_name(name: str) -> str:
    return name.translate(_BIDI_CONTROLS)


def _old_head_content(new_head_name: str, old_head_name: str) -> _BrandedEmail:
    new_head_name, old_head_name = _clean_name(new_head_name), _clean_name(old_head_name)
    return _BrandedEmail(
        headline=("Your family’s account has been ", "updated.", ""),
        subtitle="The Head of Family for your Unifolio account has changed.",
        illustration="ill-forward",
        blocks=(
            _IconBlock(
                "dark", "person", "Will access Unifolio using their own email address and mobile number.",
                label="NEW HEAD OF FAMILY", heading=new_head_name,
            ),
            _IconBlock(
                "line", "people",
                f"You ({old_head_name}) will remain a family member, but you will no longer be "
                "able to sign in using this email address.",
            ),
            _IconBlock("line", "layers", _DATA_UNCHANGED),
            _IconBlock(
                "pale", "shield",
                "We’ve sent you a separate email with a link to reverse this change. "
                f"If you don’t recognise this activity, please contact us at {SUPPORT_EMAIL}.",
                heading="Didn’t authorise this change?", support="link",
            ),
        ),
        footer=_NOTICE_FOOTER,
    )


def _reversed_content(restored_head_name: str, other_head_name: str) -> _BrandedEmail:
    restored_head_name, other_head_name = _clean_name(restored_head_name), _clean_name(other_head_name)
    return _BrandedEmail(
        tag="ACCOUNT UPDATE",
        headline=("The change has been ", "reversed.", ""),
        subtitle="The Head of Family for your Unifolio account is back to the previous setup.",
        illustration="ill-back",
        blocks=(
            _IconBlock(
                "dark", "crown", "Signs in with the previous email address and mobile number.",
                label="HEAD OF FAMILY AGAIN", heading=restored_head_name,
            ),
            _IconBlock(
                "line", "people",
                f"{other_head_name} remains a family member and no longer signs in as Head of Family.",
            ),
            _IconBlock("line", "layers", _DATA_UNCHANGED),
            _IconBlock(
                "pale", "shield",
                f"If you don’t recognise this activity, please contact us at {SUPPORT_EMAIL}.",
                heading="Didn’t expect this?", support="text",
            ),
        ),
        footer=_NOTICE_FOOTER,
    )


def _render_email(subject: str, email: _BrandedEmail) -> tuple[str, str, str]:
    return subject, email.plain(), _branded_layout(email)


def head_changed_for_new_head_email(
    *, new_head_name: str, old_head_name: str
) -> tuple[str, str, str]:
    """Notify the new head. The names are accepted for the callers' shared signature."""
    return _render_email(HEAD_CHANGED_SUBJECT, _new_head_content())


def head_changed_for_old_head_email(
    *, new_head_name: str, old_head_name: str
) -> tuple[str, str, str]:
    """Notify the previous head about the separate undo email."""
    return _render_email(HEAD_CHANGED_SUBJECT, _old_head_content(new_head_name, old_head_name))


def head_change_undo_email(*, undo_url: str, valid_until: datetime) -> tuple[str, str, str]:
    """Send the undo link to the previous head."""
    return _render_email(UNDO_SUBJECT, _undo_content(undo_url, valid_until))


def head_change_reversed_email(
    *, restored_head_name: str, other_head_name: str
) -> tuple[str, str, str]:
    """Notify both heads that undo restored the previous Head of Family."""
    return _render_email(_REVERSED_SUBJECT, _reversed_content(restored_head_name, other_head_name))


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
