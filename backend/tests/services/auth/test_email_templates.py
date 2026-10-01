from app.services.auth.email_templates import otp_email_html


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
    assert "color: #15803D" in pill_rule
    assert "background" not in pill_rule
    assert "padding" not in pill_rule
    # Dark mode keeps the lighter green text.
    assert ".code-pill {{" not in html  # sanity: no unescaped template braces
    assert "color: #4ADE80" in html


def test_body_has_no_inline_display_styles():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "display" not in html.split("<body>")[1]
