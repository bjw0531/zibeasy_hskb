"""SMTP 메일 유틸"""
from email.message import EmailMessage
from email.utils import formataddr
import smtplib


def send_plain_mail(app, subject: str, body: str, to_email: str):
    """설정된 SMTP로 텍스트 메일 발송"""
    cfg = app.config
    host = cfg.get('MAIL_HOST')
    port = int(cfg.get('MAIL_PORT', 587))
    use_tls = bool(cfg.get('MAIL_USE_TLS', True))
    username = cfg.get('MAIL_USERNAME', '')
    password = cfg.get('MAIL_PASSWORD', '')
    from_email = cfg.get('MAIL_FROM') or username
    from_name = cfg.get('MAIL_FROM_NAME', '천안하우스')

    if not host or not username or not password or not from_email or not to_email:
        return False, 'mail_config_missing'

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = formataddr((from_name, from_email))
    msg['To'] = to_email
    msg.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            if use_tls:
                server.starttls()
            server.login(username, password)
            server.send_message(msg)
        return True, None
    except Exception as e:
        return False, str(e)
