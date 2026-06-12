# Ensure the Celery app is loaded when Django starts so that
# @shared_task tasks bind to it and .delay() uses the configured broker.
from .celery import app as celery_app

__all__ = ('celery_app',)
