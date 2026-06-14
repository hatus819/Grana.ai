from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.banking.models import BankAccount
from apps.transactions.models import Transaction


def _parse_date(value, field_name):
    """
    Parse an ISO date string (YYYY-MM-DD). Returns (date_obj, None) on success,
    or (None, Response) on failure — mirroring the fetch_transactions style.
    """
    try:
        return date.fromisoformat(str(value)), None
    except (TypeError, ValueError):
        return None, Response(
            {'error': f'{field_name} must be an ISO date (YYYY-MM-DD)'},
            status=status.HTTP_400_BAD_REQUEST,
        )


def _fmt(value):
    """Format a Decimal (or None) as a 2-decimal-place string."""
    if value is None:
        return '0.00'
    return str(value.quantize(Decimal('0.01')))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def summary(request):
    """
    GET /api/v1/dashboard/summary/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

    Aggregates balance, income, expenses, and per-category breakdown for the
    authenticated user. Dates default to the last 90 days if omitted.
    """
    today = timezone.localdate()

    # --- Parse / default dates ---
    raw_start = request.query_params.get('start_date')
    raw_end = request.query_params.get('end_date')

    if raw_start:
        start_date, err = _parse_date(raw_start, 'start_date')
        if err:
            return err
    else:
        start_date = today - timedelta(days=90)

    if raw_end:
        end_date, err = _parse_date(raw_end, 'end_date')
        if err:
            return err
    else:
        end_date = today

    # --- Inverted-range guard ---
    if start_date > end_date:
        return Response(
            {'error': 'start_date must be on or before end_date'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # --- Balance: sum of active accounts ---
    balance_agg = BankAccount.objects.filter(
        user=request.user,
        is_active=True,
    ).aggregate(total=Sum('balance'))
    balance = _fmt(balance_agg['total'])

    # --- Transaction base queryset (scoped to user's active accounts, in range) ---
    # date is a DateTimeField; use date__date__ lookups so end_date is fully inclusive
    # (a naive date__lte=end_date excludes anything after midnight on that day).
    txs = Transaction.objects.filter(
        account__user=request.user,
        account__is_active=True,
        date__date__gte=start_date,
        date__date__lte=end_date,
    )

    # --- Income / expenses split by sign (never by category) ---
    agg = txs.aggregate(
        income=Sum('amount', filter=Q(amount__gt=0)),
        expenses=Sum('amount', filter=Q(amount__lt=0)),
    )
    income = _fmt(agg['income'])
    expenses = _fmt(agg['expenses'])

    # --- By-category: expenses only, aggregated in DB ---
    by_cat_qs = (
        txs
        .filter(amount__lt=0)
        .values('category__name', 'category__color')
        .annotate(total=Sum('amount'), count=Count('id'))
        .order_by('total', 'category__name')  # most negative first; name breaks ties
    )

    by_category = [
        {
            'category': row['category__name'],               # None for uncategorized
            'color': row['category__color'] or '#000000',    # coalesce null to model default
            'total': _fmt(row['total']),
            'count': row['count'],
        }
        for row in by_cat_qs
    ]

    return Response({
        'balance': balance,
        'income': income,
        'expenses': expenses,
        'by_category': by_category,
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
        },
    })
