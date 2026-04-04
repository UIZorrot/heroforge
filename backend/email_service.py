import logging

import resend

from config import get_settings


def _configure_resend() -> str:
    settings = get_settings()
    if not settings.resend_api_key:
        raise RuntimeError("RESEND_API_KEY is not configured")
    resend.api_key = settings.resend_api_key
    return settings.email_from


def send_login_code(email: str, code: str, app_url: str) -> None:
    from_address = _configure_resend()
    html = f"""
    <div style="font-family: Arial, sans-serif;">
      <h2>Your login code</h2>
      <p>Use this code to sign in:</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">{code}</div>
      <p>This code will expire soon.</p>
      <p>If you did not request this, you can ignore this email.</p>
      <p><a href="{app_url}">{app_url}</a></p>
    </div>
    """
    try:
        resend.Emails.send({
            "from": from_address,
            "to": email,
            "subject": "Your login code",
            "html": html,
        })
    except Exception:
        logging.exception("Failed to send login email")
        raise
