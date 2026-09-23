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


def test_otp_email_html_logo_visibility_comes_only_from_the_stylesheet():
    """Real-device regression (Gmail Android app, 2026-09-23): an inline
    style="display:..." directly on the <img> tag won over the stylesheet's
    dark-mode !important override in Gmail's simplified CSS engine, leaving
    the light-mode (dark-wordmark) logo stuck visible against a dark
    background -- effectively invisible. Display must come only from the
    .logo-light/.logo-dark classes, so there's nothing inline for the media
    query to lose to."""
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "display" not in html.split("<body>")[1]


def test_otp_email_html_builds_logo_urls_from_frontend_base_url(monkeypatch):
    import app.services.auth.email_templates as email_templates_module

    monkeypatch.setattr(email_templates_module.settings, "frontend_base_url", "https://staging.unifolio.in")
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "https://staging.unifolio.in/brand/unifolio-logo-light.png" in html
    assert "https://staging.unifolio.in/brand/unifolio-logo-dark.png" in html
