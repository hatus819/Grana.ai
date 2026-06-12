from datetime import date, datetime, timedelta, timezone as dt_timezone
from decimal import Decimal

from celery import shared_task
from django.db import IntegrityError
from django.utils import timezone
from requests import RequestException

from apps.ai_services.tasks import categorize_user_transactions
from apps.transactions.models import Transaction
from .models import BankAccount
from .services import PluggyService

DESCRIPTION_MAX_LENGTH = Transaction._meta.get_field("description").max_length


def _parse_pluggy_datetime(value):
    parsed = datetime.fromisoformat(value)
    if timezone.is_naive(parsed):
        parsed = parsed.replace(tzinfo=dt_timezone.utc)
    return parsed


# Transient Pluggy/network failures must not permanently lose the one-shot
# 90-day backfill (the daily sync only re-fetches a 3-day window).
@shared_task(
    autoretry_for=(RequestException,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def sync_account_transactions(account_id, start_date=None, end_date=None):
    """Import transactions for one account, defaulting to the last 90 days,
    then hand the new rows to AI categorization."""
    account = BankAccount.objects.filter(id=account_id, is_active=True).first()
    if account is None:
        return f"Account {account_id} not found or inactive"

    end_date = end_date or date.today().isoformat()
    start_date = (
        start_date or (date.fromisoformat(end_date) - timedelta(days=90)).isoformat()
    )

    created = 0
    for row in PluggyService.get_transactions(
        account.pluggy_account_id, start_date, end_date
    ):
        try:
            _, was_created = Transaction.objects.get_or_create(
                pluggy_transaction_id=row["id"],
                defaults={
                    "account": account,
                    "amount": Decimal(str(row["amount"])),
                    "description": (row.get("description") or "")[:DESCRIPTION_MAX_LENGTH],
                    "date": _parse_pluggy_datetime(row["date"]),
                },
            )
        except IntegrityError:
            # A concurrent sync inserted this row between our get and create.
            continue
        if was_created:
            created += 1

    if created:
        try:
            categorize_user_transactions.delay(account.user_id)
        except Exception:
            # Broker down — rows are imported; categorisation can run later.
            pass

    return f"{created} transactions imported for account {account_id}"


@shared_task
def sync_all_active_accounts():
    """Daily incremental sync: re-fetch a 3-day window per active account
    to pick up late-posting transactions."""
    start_date = (date.today() - timedelta(days=3)).isoformat()
    enqueued = 0
    for account in BankAccount.objects.filter(is_active=True).iterator():
        sync_account_transactions.delay(account.id, start_date=start_date)
        enqueued += 1
    return f"Sync enqueued for {enqueued} accounts"
