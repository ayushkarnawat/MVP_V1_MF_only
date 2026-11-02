import hashlib
from inspect import signature

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


def test_head_changed_email_uses_the_notice_wording():
    subject, body, html = email_templates.head_changed_email(
        new_head_name="Aditi",
        old_head_name="Siddharth",
        undo_url="https://example.test/undo",
    )

    assert subject == "The Head of Family on Unifolio has changed."
    assert body == (
        "Aditi is now Head of Family and signs in with this email. Siddharth remains a member "
        "and no longer signs in. All portfolio data is unchanged. If this was not you, use the "
        "undo link within 24 hours: https://example.test/undo"
    )
    assert "All portfolio data is unchanged." in html


def test_head_changed_email_without_an_undo_url_carries_no_link():
    subject, body, html = email_templates.head_changed_email(new_head_name="Aditi", old_head_name="Siddharth")

    assert subject == "The Head of Family on Unifolio has changed."
    assert "contact support@unifolio.in" in body
    for text in (body, html):
        assert "undo" not in text.lower()
    assert "<a " not in html  # the shared header's font address is a stylesheet link, not an anchor


def test_head_change_undo_email_has_one_24_hour_link():
    subject, body, html = email_templates.head_change_undo_email(
        undo_url="https://example.test/undo"
    )

    assert subject == "Undo the Head of Family change."
    assert body.count("https://example.test/undo") == 1
    assert "24 hours" in body
    assert html.count('href="https://example.test/undo"') == 1


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
