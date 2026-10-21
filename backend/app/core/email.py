"""Envío de correo con Resend (https://resend.com).

Se llama desde BackgroundTasks, así que nunca lanza: un fallo de Resend se registra en el log y
la petición original ya respondió. Sin RESEND_API_KEY (desarrollo local) no envía nada y escribe
el correo en el log para poder seguir el enlace a mano.
"""

import logging

import resend

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html: str, text: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning(
            "RESEND_API_KEY vacía: correo no enviado.\nPara: %s\nAsunto: %s\n\n%s",
            to,
            subject,
            text,
        )
        return

    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send(
            {
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text,
            }
        )
    except Exception:
        logger.exception("No se pudo enviar el correo %r a %s", subject, to)
