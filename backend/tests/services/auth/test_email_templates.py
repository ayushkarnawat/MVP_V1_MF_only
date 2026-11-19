import hashlib
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from html import escape
from html.parser import HTMLParser
from inspect import signature
from pathlib import Path
from urllib.parse import urlsplit

import pytest

from app.config import settings
from app.core.time_format import format_ist_datetime
import app.services.auth.email_templates as email_templates
from app.services.auth.email_templates import otp_email_html


def test_existing_signin_email_html_is_unchanged_by_default():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    parameters = signature(otp_email_html).parameters

    assert parameters["headline"].default is None
    assert parameters["note"].default is None
    assert hashlib.sha256(html.encode()).hexdigest() == (
        "c53cd3749b22989cea4c959e298c8f78d97bfe5beec0c691d1fe1a72c4504c1d"
    )


def test_head_change_headline_does_not_say_to_sign_in():
    html = otp_email_html(
        otp="743820",
        ttl_minutes=10,
        headline="Your confirmation code to change the Head of Family on Unifolio is below.",
        note="This code expires in 10 minutes. If you did not ask for this, do not share it.",
    )

    assert "change the Head of Family" in html
    assert "sign in" not in html.lower()


_BASE = "https://assets.example.test"
_UNDO_URL = 'https://example.test/undo-head-change#token=a&b"<c>'
_VALID_UNTIL = datetime(2026, 11, 10, 11, 37, tzinfo=timezone.utc)
_SUPPORT = "mailto:support@unifolio.in"


class _Markup(HTMLParser):
    def __init__(self, html: str):
        super().__init__()
        self.tags: list[tuple[str, dict[str, str | None]]] = []
        self.data: list[str] = []
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def handle_data(self, data):
        self.data.append(data)

    def attributes(self, tag):
        return [attrs for name, attrs in self.tags if name == tag]

    @property
    def text(self):
        return " ".join("".join(self.data).split())


def _emails(new_name="Rohan", old_name="Aditi"):
    names = dict(new_head_name=new_name, old_head_name=old_name)
    return (
        email_templates.head_changed_for_new_head_email(**names),
        email_templates.head_change_undo_email(undo_url=_UNDO_URL, valid_until=_VALID_UNTIL),
        email_templates.head_changed_for_old_head_email(**names),
        email_templates.head_change_reversed_email(
            restored_head_name=old_name, other_head_name=new_name
        ),
    )


@pytest.fixture
def emails(monkeypatch):
    monkeypatch.setattr(settings, "frontend_base_url", f"{_BASE}/")
    return _emails()


def test_names_are_escaped_in_all_four():
    names = ('<script>alert(1)</script>', '"><img src=x onerror=1>')
    for index, (_, plain, html) in enumerate(_emails(*names)):
        page = _Markup(html)
        assert not page.attributes("script")
        assert all("onerror" not in img for img in page.attributes("img"))
        for name in names:
            assert name not in html
            if index in (2, 3):
                assert escape(name) in html
                assert name in plain
            else:
                assert escape(name) not in html
                assert name not in plain
        if index in (2, 3):
            bold_name = names[0] if index == 2 else names[1]
            assert f"<b>{escape(bold_name)}</b>" in html


def test_undo_link_box_text_equals_the_real_link_and_the_token_stays_after_the_hash(emails):
    _, plain, html = emails[1]
    # The undo consumers read the fragment through the end of the plain-text part.
    assert plain.endswith(_UNDO_URL)
    boxes = re.findall(r'<div[^>]*style="[^"]*word-break:\s*break-all[^"]*"[^>]*>(.*?)</div>', html, re.S)
    assert len(boxes) == 1
    assert _Markup(boxes[0]).data == [_UNDO_URL]
    links = [attrs["href"] for attrs in _Markup(html).attributes("a") if attrs["href"] != _SUPPORT]
    assert links == [_UNDO_URL]
    url = urlsplit(links[0])
    assert not url.query and url.fragment == 'token=a&b"<c>'


def test_undo_email_is_the_only_one_with_a_link_or_button(emails):
    for index, (_, plain, html) in enumerate(emails):
        page = _Markup(html)
        hrefs = [attrs.get("href") for attrs in page.attributes("a")]
        assert not page.attributes("button")
        assert [href for href in hrefs if href != _SUPPORT] == ([_UNDO_URL] if index == 1 else [])
        if index != 1:
            assert "https://" not in plain
            # Picture addresses and the font files (both on our own domain) are the only web addresses.
            assert "https://" not in re.sub(r"@font-face\s*\{[^}]*\}", "", re.sub(r'<img\b[^>]*>', "", html))
    assert _SUPPORT in [attrs.get("href") for attrs in _Markup(emails[0][2]).attributes("a")]


def test_changed_back_email_has_no_token_or_link(emails):
    _, plain, html = emails[3]
    assert "HEAD OF FAMILY AGAIN" in plain and "HEAD OF FAMILY AGAIN" in html
    assert _UNDO_URL not in html and "#token=" not in html
    assert "#token=" not in plain and "https://" not in plain
    assert not _Markup(html).attributes("a")


def test_image_urls_have_no_token_or_personal_data(emails):
    expected = (
        ("ill-forward", "ic-crown", "ic-layers"),
        ("ill-back", "ic-date", "ic-warn", "ic-link"),
        ("ill-forward", "ic-person", "ic-people", "ic-layers", "ic-shield"),
        ("ill-back", "ic-crown", "ic-people", "ic-layers", "ic-shield"),
    )
    for (_, _, html), assets in zip(emails, expected, strict=True):
        images = _Markup(html).attributes("img")
        assert [img["src"] for img in images] == [
            f"{_BASE}/email/{asset}-{scheme}.png"
            for asset in ("logo", *assets)
            for scheme in ("light", "dark")
        ]
        assert all("token" not in img["src"] and "#" not in img["src"] for img in images)


def test_every_image_has_alt_text_and_size(emails):
    alt_text = {
        "logo": "Unifolio",
        "ill-forward": "Illustration: change of Head of Family",
        "ill-back": "Illustration: change reversed",
        "ic-warn": "Warning",
    }
    for _, _, html in emails:
        images = _Markup(html).attributes("img")
        assert images
        for img in images:
            asset = img["src"].rsplit("/", 1)[1].rsplit("-", 1)[0]
            assert img["alt"] == alt_text.get(asset, asset.removeprefix("ic-").title())
            assert int(img["width"]) > 0 and int(img["height"]) > 0
            assert img["style"].startswith("display:block;border:0")


def test_dark_mode_block_has_no_script(emails):
    for _, _, html in emails:
        page = _Markup(html)
        assert not page.attributes("script")
        assert len(page.attributes("style")) == 1
        dark = html.split("@media (prefers-color-scheme: dark)", 1)[1]
        assert re.search(r"\.light-only\s*\{[^}]*display:\s*none\s*!important", dark)
        assert re.search(r"\.dark-only\s*\{[^}]*display:\s*block\s*!important", dark)


def test_color_scheme_meta_present(emails):
    for _, _, html in emails:
        head = html.split("</head>", 1)[0]
        for name in ("color-scheme", "supported-color-schemes"):
            assert {"name": name, "content": "light dark"} in _Markup(head).attributes("meta")


def test_copy_uses_their_not_a_guessed_pronoun(emails):
    for _, plain, html in emails:
        assert not re.search(r"\b(he|she|his|her)\b", plain + _Markup(html).text, re.I)
    assert "using their own email address and mobile number" in emails[2][1]
    assert "using their own email address and mobile number" in _Markup(emails[2][2]).text


_NOTIFICATION_FOOTER = (
    "We’re here if you need us.",
    "This is an automated notification. Please do not reply to this email.",
)


def test_each_email_has_the_exact_headline_subtitle_and_footer_of_the_workbook(emails):
    expected = (
        (
            "ACCOUNT UPDATE", "You’re now the Head of Family.", "Head of Family.",
            "The Head of Family role for your Unifolio account has been transferred to you.",
            ("This is an automated account notification. Please do not reply.",
             "Need help? We’re here at support@unifolio.in."),
        ),
        (
            "ACCOUNT SECURITY", "Want to reverse this change?", "reverse",
            "If you didn’t authorise the change to your family’s Head of Family, "
            "you can restore the previous sign-in using the button below.",
            ("This is an automated security email. Please do not reply.",
             "Need help? Contact us at support@unifolio.in."),
        ),
        (
            "", "Your family’s account has been updated.", "updated.",
            "The Head of Family for your Unifolio account has changed.",
            _NOTIFICATION_FOOTER,
        ),
        (
            "ACCOUNT UPDATE", "The change has been reversed.", "reversed.",
            "The Head of Family for your Unifolio account is back to the previous setup.",
            _NOTIFICATION_FOOTER,
        ),
    )
    for (_, plain, html), (tag, headline, accent, subtitle, footer) in zip(emails, expected, strict=True):
        heading = re.search(r"<h1\b[^>]*>(.*?)</h1>", html, re.S)
        assert heading is not None
        assert _Markup(heading[1]).text == headline
        assert re.search(rf'<span\b[^>]*>{re.escape(accent)}</span>', heading[1])
        if tag:
            assert tag in _Markup(html).text
        else:
            assert "ACCOUNT UPDATE" not in html and "ACCOUNT SECURITY" not in html
        for line in (headline, subtitle, *footer, "Team Unifolio"):
            assert line in plain and line in _Markup(html).text
        assert "<b>Team Unifolio</b>" in html


def test_layout_is_tables_without_flex_or_grid(emails):
    for _, _, html in emails:
        assert _Markup(html).attributes("table")
        assert not re.search(r"display:\s*(?:inline-)?(?:flex|grid)", html)


def test_phone_and_desktop_widths(emails):
    for _, _, html in emails:
        assert re.search(r"max-width:\s*600px", html)
        assert re.search(r"@media\s*\(max-width:\s*\d+px\)", html)
        assert re.search(r"width:\s*100%", html)


def test_shared_header_unchanged():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert html.startswith(email_templates._email_header())


def test_valid_until_line_uses_the_existing_ist_formatter(emails):
    _, plain, html = emails[1]
    ist = format_ist_datetime(_VALID_UNTIL, full_month=True)
    # The workbook's own sample (section 6): the month is spelled in full.
    assert ist == "10 November 2026, 5:07 PM IST"
    assert f"This link is valid until <b>{ist}.</b>" in html
    assert f"This link is valid until {ist}." in plain


def test_plain_text_part_carries_the_same_facts(emails):
    expected = (
        (
            "You can now sign in using your own email address or mobile number to access "
            "and manage your family’s combined financial view.",
            "Your family’s portfolio data remains unchanged.",
            "All existing investments and financial information remain intact.",
        ),
        (
            "Undo Head of Family Change",
            f"This link is valid until {format_ist_datetime(_VALID_UNTIL, full_month=True)}.",
            "Please note: The link will expire earlier if the previous phone number or "
            "email address is used for another account in the meantime.",
            "Having trouble with the button?",
            "You can copy and paste the link below into your browser:",
            _UNDO_URL,
        ),
        (
            "NEW HEAD OF FAMILY",
            "Rohan",
            "Will access Unifolio using their own email address and mobile number.",
            "You (Aditi) will remain a family member, but you will no longer be able to "
            "sign in using this email address.",
            "Your family’s portfolio data remains unchanged.",
            "Didn’t authorise this change?",
            "We’ve sent you a separate email with a link to reverse this change. "
            "If you don’t recognise this activity, please contact us at support@unifolio.in.",
        ),
        (
            "HEAD OF FAMILY AGAIN",
            "Aditi",
            "Signs in with the previous email address and mobile number.",
            "Rohan remains a family member and no longer signs in as Head of Family.",
            "Your family’s portfolio data remains unchanged.",
            "Didn’t expect this?",
            "If you don’t recognise this activity, please contact us at support@unifolio.in.",
        ),
    )
    for index, ((_, plain, html), lines) in enumerate(zip(emails, expected, strict=True)):
        body_text = _Markup(html).text
        positions = []
        for line in lines:
            assert line in plain.splitlines()
            assert line in body_text
            positions.append(plain.index(line))
        assert positions == sorted(positions)
        assert plain.count(_UNDO_URL) == (1 if index == 1 else 0)
        assert "https://" not in plain.replace(_UNDO_URL, "")
    assert [subject for subject, _, _ in emails] == [
        "The Head of Family on Unifolio has changed.",
        "Undo the Head of Family change.",
        "The Head of Family on Unifolio has changed.",
        "The Head of Family on Unifolio has been changed back.",
    ]


def test_preview_script_writes_sixteen_files_and_refuses_a_repo_folder():
    backend = Path(__file__).resolve().parents[3]
    command = [sys.executable, str(backend / "scripts" / "preview_emails.py")]
    scratch = Path(tempfile.gettempdir())
    rejected = subprocess.run(
        [*command, str(backend.parent)], cwd=scratch, capture_output=True, text=True
    )
    assert rejected.returncode != 0
    assert "inside the repository" in rejected.stderr

    output = Path(tempfile.mkdtemp(prefix="unifolio-b9-previews-"))
    result = subprocess.run([*command, str(output)], cwd=scratch, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    paths = sorted(output.glob("*.html"))
    assert len(paths) == 16
    for scheme, color in (("light", "#FFFFFF"), ("dark", "#1A1A1A")):
        for width in (600, 375):
            variants = list(output.glob(f"*-{scheme}-{width}.html"))
            assert len(variants) == 4
            for path in variants:
                preview = _Markup(path.read_text(encoding="utf-8"))
                frame, = preview.attributes("iframe")
                assert frame["width"] == str(width)
                assert f"background:{color}" in frame["srcdoc"]
                assert f"/email/logo-{scheme}.png" in frame["srcdoc"]
                assert f"/email/logo-{'dark' if scheme == 'light' else 'light'}.png" not in frame["srcdoc"]
                assert path.name in result.stdout


def test_the_old_combined_notice_builder_is_gone():
    assert not hasattr(email_templates, "head_changed_email")


def test_otp_email_html_contains_the_otp():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "743820" in html


def test_otp_email_html_contains_the_ttl_minutes():
    html = otp_email_html(otp="743820", ttl_minutes=7)
    assert "7 minutes" in html


def test_otp_email_html_escapes_html_special_characters_in_otp():
    # generate_otp() only ever produces digits, but the function shouldn't
    # trust that blindly -- an unescaped '<' would break the surrounding
    # markup structure, not just be a cosmetic issue.
    html = otp_email_html(otp="<b>123456</b>", ttl_minutes=5)
    assert "<b>123456</b>" not in html
    assert "&lt;b&gt;123456&lt;/b&gt;" in html


def test_otp_email_html_has_no_logo():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "<img" not in html
    assert "unifolio-logo" not in html
    assert "logo-light" not in html and "logo-dark" not in html


def test_otp_email_html_desktop_otp_positioning():
    """Desktop view positions the OTP number to the left under the headline
    via min-width media query, keeping mobile view centered and the overall
    layout naturally left-aligned without container auto-centering."""
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "@media (min-width: 600px)" in html
    assert "margin-left: 88px" in html
    assert "margin: 0 auto" not in html


def test_otp_email_html_declares_supported_color_schemes():
    """Some clients (Gmail's app confirmed, 2026-09-23, real device --
    inline-style fix alone did not resolve it) only trust an email's own
    dark-mode CSS when these meta tags are present in <head>; without them,
    a client can apply its own automatic color-inversion heuristic over the
    email instead of evaluating the @media (prefers-color-scheme) block at
    all, regardless of how correct that CSS is."""
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert '<meta name="color-scheme" content="light dark">' in html
    assert '<meta name="supported-color-schemes" content="light dark">' in html


def test_verification_code_is_green_text_without_a_highlight():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert '<span class="code-pill">verification code</span>' in html
    pill_rule = html.split(".code-pill {")[1].split("}")[0]
    assert "color: #22C55E" in pill_rule
    assert "background" not in pill_rule
    assert "padding" not in pill_rule
    # Brand green (#22C55E) in dark mode too.
    assert ".code-pill {{" not in html  # sanity: no unescaped template braces
    assert ".code-pill { color: #22C55E !important; }" in html


def test_body_has_no_inline_display_styles():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "display" not in html.split("<body>")[1]


def test_points_to_support_instead_of_ignore_this_email():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "safely ignore" not in html
    assert "support@unifolio.in" in html


# ---- Codex whole-batch review of B, finding 7: directional override characters in a name must not reorder the fixed sentences.
_BIDI_CONTROLS = "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u200e\u200f\u061c"


@pytest.mark.parametrize("builder,kwargs", [
    (email_templates.head_changed_for_old_head_email, dict(new_head_name="\u202eRohan\u2069 Shanbhag", old_head_name="Ad\u200fiti")),
    (email_templates.head_change_reversed_email, dict(restored_head_name="\u202eRohan\u2069 Shanbhag", other_head_name="Ad\u200fiti")),
])
def test_directional_controls_are_removed_from_names_but_the_text_stays(builder, kwargs):
    _, plain, html = builder(**kwargs)
    for part in (plain, html):
        assert not any(char in part for char in _BIDI_CONTROLS)
    assert "Rohan Shanbhag" in plain and "Rohan Shanbhag" in html
    assert "Aditi" in plain and "Aditi" in html


def test_a_name_with_right_to_left_letters_survives_untouched():
    arabic = "\u0645\u062d\u0645\u062f"
    _, plain, html = email_templates.head_change_reversed_email(restored_head_name=arabic, other_head_name="Aditi")
    assert arabic in plain and arabic in html


def test_the_changed_back_email_keeps_the_support_address_in_the_accent_colour_without_a_link():
    _, _, html = email_templates.head_change_reversed_email(restored_head_name="Rohan", other_head_name="Aditi")
    assert '<span class="email-accent" style="color:#15803D">support@unifolio.in</span>' in html
    assert "mailto:" not in html


# ---- Owner decision 19 Nov 2026 (Codex whole-batch review of B, finding 12): the brand fonts are declared, served from our own domain.
def test_the_brand_fonts_are_declared_from_our_own_domain_and_nowhere_else(emails):
    for _, _, html in emails:
        faces = re.findall(r"@font-face\s*\{([^}]*)\}", html)
        assert len(faces) == 2
        joined = " ".join(faces)
        assert "font-family: 'DM Sans'" in joined and "font-weight: 700" in joined
        assert "font-family: 'Manrope'" in joined and "font-weight: 400 700" in joined
        urls = re.findall(r"url\(([^)]*)\)", joined)
        assert sorted(urls) == sorted([f"{_BASE}/email/fonts/DMSans-700-latin.woff2", f"{_BASE}/email/fonts/Manrope-latin.woff2"])
        assert "googleapis" not in html and "gstatic" not in html
        assert "@import" not in html


def test_the_font_files_the_emails_name_exist_in_the_front_end_public_folder():
    folder = Path(__file__).resolve().parents[4] / "frontend" / "public" / "email" / "fonts"
    for name in ("DMSans-700-latin.woff2", "Manrope-latin.woff2"):
        assert (folder / name).read_bytes()[:4] == b"wOF2", name
    assert "Open Font License" in (folder / "README.txt").read_text(encoding="utf-8")

