"""
Tests for GET /api/v1/dashboard/summary/

TDD: tests written FIRST — must fail before implementation exists.
"""
from datetime import date, datetime, timezone
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from freezegun import freeze_time
from rest_framework import status
from rest_framework.test import APITestCase

from apps.banking.models import BankAccount
from apps.categories.models import Category
from apps.transactions.models import Transaction

User = get_user_model()

SUMMARY_URL = '/api/v1/dashboard/summary/'


def _make_user(email, password='Tr0car-Forte#2026'):
    return User.objects.create_user(email=email, password=password)


def _make_account(user, balance, is_active=True):
    return BankAccount.objects.create(
        user=user,
        pluggy_account_id=f'acc-{user.email}-{balance}',
        bank_name='Test Bank',
        account_type='CHECKING',
        balance=balance,
        is_active=is_active,
    )


def _make_tx(account, amount, date_str, category=None):
    """Create a transaction. date_str can be 'YYYY-MM-DD' or full ISO datetime."""
    if 'T' not in date_str:
        dt = datetime.fromisoformat(f'{date_str}T12:00:00').replace(tzinfo=timezone.utc)
    else:
        dt = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
    return Transaction.objects.create(
        account=account,
        pluggy_transaction_id=f'tx-{account.id}-{amount}-{date_str}',
        amount=Decimal(str(amount)),
        description='test transaction',
        date=dt,
        category=category,
    )


class DashboardSummaryUnauthenticatedTest(APITestCase):
    """Unauthenticated request must be rejected."""

    def test_unauthenticated_returns_401(self):
        response = self.client.get(SUMMARY_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class DashboardSummaryMalformedDateTest(APITestCase):
    """Malformed date params must return 400 mirroring the fetch endpoint."""

    def setUp(self):
        self.user = _make_user('datetest@example.com')
        self.client.force_authenticate(user=self.user)

    def test_malformed_start_date_returns_400(self):
        response = self.client.get(SUMMARY_URL, {'start_date': '2026-13-99'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('start_date', str(response.data))

    def test_malformed_end_date_returns_400(self):
        response = self.client.get(SUMMARY_URL, {'end_date': 'notadate'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('end_date', str(response.data))

    def test_malformed_start_date_error_message_matches_contract(self):
        response = self.client.get(SUMMARY_URL, {'start_date': 'notadate'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('error'),
                         'start_date must be an ISO date (YYYY-MM-DD)')

    def test_malformed_end_date_error_message_matches_contract(self):
        response = self.client.get(SUMMARY_URL, {'end_date': 'baddatestring'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('error'),
                         'end_date must be an ISO date (YYYY-MM-DD)')


class DashboardSummaryAggregationTest(APITestCase):
    """
    Core test: authenticated user with 2 active accounts and mixed-sign
    transactions across categories gets correct sums.
    """

    def setUp(self):
        self.user = _make_user('user@example.com')
        self.other_user = _make_user('other@example.com')
        self.client.force_authenticate(user=self.user)

        # 2 active accounts with known balances (balance = total across both)
        self.acc1 = _make_account(self.user, Decimal('10000.00'))
        self.acc2 = _make_account(self.user, Decimal('4286.90'))
        # balance = 10000.00 + 4286.90 = 14286.90

        # Inactive account — must NOT be counted in balance
        self.acc_inactive = _make_account(self.user, Decimal('9999.00'), is_active=False)

        # Categories
        self.cat_services = Category.objects.create(
            name='Serviços', color='#000000', icon='service')
        self.cat_food = Category.objects.create(
            name='Alimentação', color='#FF0000', icon='food')

        # Transactions within a known window: 2026-03-15 to 2026-06-12
        # Income (positive)
        _make_tx(self.acc1, '17000.00', '2026-05-01', category=None)

        # Expenses (negative) — categorized
        _make_tx(self.acc1, '-1000.00', '2026-04-01', category=self.cat_services)
        _make_tx(self.acc1, '-372.70', '2026-04-15', category=self.cat_services)
        _make_tx(self.acc2, '-500.00', '2026-05-10', category=self.cat_food)
        _make_tx(self.acc2, '-200.00', '2026-05-20', category=self.cat_food)

        # Uncategorized expense — should appear as category: null
        _make_tx(self.acc1, '-640.40', '2026-05-25', category=None)

        # Transaction OUT of range — must be excluded
        _make_tx(self.acc1, '-5000.00', '2025-01-01', category=self.cat_food)

        # OTHER USER'S data — must never appear in our user's summary
        other_acc = _make_account(self.other_user, Decimal('99999.99'))
        _make_tx(other_acc, '50000.00', '2026-05-01')
        _make_tx(other_acc, '-25000.00', '2026-05-01', category=self.cat_food)

        self.start_date = '2026-03-15'
        self.end_date = '2026-06-12'

    def _get(self, start=None, end=None):
        params = {}
        if start:
            params['start_date'] = start
        if end:
            params['end_date'] = end
        return self.client.get(SUMMARY_URL, params)

    def test_balance_is_sum_of_active_accounts_only(self):
        r = self._get(self.start_date, self.end_date)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['balance'], '14286.90')

    def test_income_is_sum_of_positive_amounts_only(self):
        r = self._get(self.start_date, self.end_date)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['income'], '17000.00')

    def test_expenses_is_sum_of_negative_amounts_only(self):
        # -1000.00 + -372.70 + -500.00 + -200.00 + -640.40 = -2713.10
        r = self._get(self.start_date, self.end_date)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '-2713.10')

    def test_by_category_covers_expenses_only(self):
        r = self._get(self.start_date, self.end_date)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        cats = {item['category']: item for item in r.data['by_category']}

        # Serviços: -1000.00 + -372.70 = -1372.70, count=2
        self.assertIn('Serviços', cats)
        self.assertEqual(cats['Serviços']['total'], '-1372.70')
        self.assertEqual(cats['Serviços']['count'], 2)
        self.assertEqual(cats['Serviços']['color'], '#000000')

        # Alimentação: -500.00 + -200.00 = -700.00, count=2
        self.assertIn('Alimentação', cats)
        self.assertEqual(cats['Alimentação']['total'], '-700.00')
        self.assertEqual(cats['Alimentação']['count'], 2)
        self.assertEqual(cats['Alimentação']['color'], '#FF0000')

        # Null category (uncategorized): -640.40, count=1
        self.assertIn(None, cats)
        self.assertEqual(cats[None]['total'], '-640.40')
        self.assertEqual(cats[None]['count'], 1)

    def test_income_transactions_excluded_from_by_category(self):
        """The 17000.00 income transaction must not appear in by_category."""
        r = self._get(self.start_date, self.end_date)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        all_totals = [Decimal(item['total']) for item in r.data['by_category']]
        for total in all_totals:
            self.assertLess(total, 0, 'by_category must only contain negative totals')

    def test_period_reflects_requested_dates(self):
        r = self._get(self.start_date, self.end_date)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['period']['start_date'], self.start_date)
        self.assertEqual(r.data['period']['end_date'], self.end_date)

    def test_other_users_data_excluded(self):
        """Other user's accounts and transactions must never bleed into this user's summary."""
        r = self._get(self.start_date, self.end_date)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        # balance excludes other user's 99999.99
        self.assertEqual(r.data['balance'], '14286.90')
        # income excludes other user's 50000.00
        self.assertEqual(r.data['income'], '17000.00')
        # expenses excludes other user's -25000.00
        self.assertEqual(r.data['expenses'], '-2713.10')


class DashboardEndDateInclusivityTest(APITestCase):
    """
    end_date is inclusive for transactions timestamped mid-day.
    A transaction at 14:30 on end_date must be counted.
    """

    def setUp(self):
        self.user = _make_user('inclusive@example.com')
        self.client.force_authenticate(user=self.user)
        self.acc = _make_account(self.user, Decimal('1000.00'))

    def test_transaction_at_1430_on_end_date_is_included(self):
        # Create a transaction timestamped at 14:30 on the end_date
        end_date = '2026-06-12'
        dt = datetime(2026, 6, 12, 14, 30, 0, tzinfo=timezone.utc)
        Transaction.objects.create(
            account=self.acc,
            pluggy_transaction_id='tx-midday',
            amount=Decimal('-500.00'),
            description='midday transaction',
            date=dt,
        )

        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': end_date,
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '-500.00')

    def test_transaction_at_2359_on_end_date_is_included(self):
        end_date = '2026-06-12'
        dt = datetime(2026, 6, 12, 23, 59, 59, tzinfo=timezone.utc)
        Transaction.objects.create(
            account=self.acc,
            pluggy_transaction_id='tx-endofday',
            amount=Decimal('-300.00'),
            description='end of day transaction',
            date=dt,
        )

        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': end_date,
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '-300.00')

    def test_transaction_on_day_after_end_date_is_excluded(self):
        end_date = '2026-06-12'
        # Use noon UTC on 2026-06-13 — unambiguously June 13 in any timezone
        # (Sao Paulo is UTC-3, so 12:00 UTC = 09:00 local, still June 13)
        dt = datetime(2026, 6, 13, 12, 0, 0, tzinfo=timezone.utc)
        Transaction.objects.create(
            account=self.acc,
            pluggy_transaction_id='tx-nextday',
            amount=Decimal('-999.00'),
            description='next day - should not appear',
            date=dt,
        )

        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': end_date,
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '0.00')


class DashboardSummaryDefaultWindowTest(APITestCase):
    """When no dates given, defaults to last 90 days; out-of-range tx excluded."""

    def setUp(self):
        self.user = _make_user('window@example.com')
        self.client.force_authenticate(user=self.user)
        self.acc = _make_account(self.user, Decimal('500.00'))

    def test_out_of_range_transaction_excluded_by_default_window(self):
        # freeze_time('2026-06-14') freezes UTC midnight → SP local = 2026-06-13.
        # Regardless of exact window boundary, 2025-01-01 is always excluded.
        Transaction.objects.create(
            account=self.acc,
            pluggy_transaction_id='tx-old',
            amount=Decimal('-9999.00'),
            description='very old tx',
            date=datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        )
        with freeze_time('2026-06-14'):
            r = self.client.get(SUMMARY_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '0.00')

    def test_period_key_present_in_response(self):
        r = self.client.get(SUMMARY_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIn('period', r.data)
        self.assertIn('start_date', r.data['period'])
        self.assertIn('end_date', r.data['period'])


class DashboardSummaryEmptyDataTest(APITestCase):
    """User with no accounts/transactions gets zero-value summary, not 500."""

    def setUp(self):
        self.user = _make_user('empty@example.com')
        self.client.force_authenticate(user=self.user)

    def test_empty_user_returns_zeros(self):
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-01-01',
            'end_date': '2026-06-12',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['balance'], '0.00')
        self.assertEqual(r.data['income'], '0.00')
        self.assertEqual(r.data['expenses'], '0.00')
        self.assertEqual(r.data['by_category'], [])


# ---------------------------------------------------------------------------
# Fix #6 — São Paulo midnight boundary tests (UTC timestamp ≠ SP local date)
# ---------------------------------------------------------------------------

class DashboardSPMidnightBoundaryTest(APITestCase):
    """
    Prove that date filtering is done in SP local time (UTC-3), not UTC.

    A transaction at UTC 2026-06-13T02:00:00Z lands on SP local date
    2026-06-12 (because UTC-3 → 2026-06-12T23:00:00 SP).  With
    end_date='2026-06-12' it MUST be INCLUDED.

    Symmetrically, a transaction at UTC 2026-06-15T02:30:00Z lands on
    SP local date 2026-06-14 (UTC-3 → 2026-06-14T23:30:00 SP).  With
    start_date='2026-06-14' it MUST be INCLUDED even though its UTC date
    is 2026-06-15.
    """

    def setUp(self):
        self.user = _make_user('sp-midnight@example.com')
        self.client.force_authenticate(user=self.user)
        self.acc = _make_account(self.user, Decimal('0.00'))

    def test_end_date_boundary_utc_past_midnight_included_by_sp_local_date(self):
        """
        UTC 2026-06-13 02:00:00 → SP local 2026-06-12 23:00:00.
        Querying end_date=2026-06-12 must INCLUDE this transaction.
        """
        dt = datetime(2026, 6, 13, 2, 0, 0, tzinfo=timezone.utc)
        Transaction.objects.create(
            account=self.acc,
            pluggy_transaction_id='tx-sp-end-boundary',
            amount=Decimal('-111.00'),
            description='crosses UTC midnight but still SP June 12',
            date=dt,
        )
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-12',
            'end_date': '2026-06-12',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(
            r.data['expenses'], '-111.00',
            'Transaction at UTC 02:00 on June 13 is SP local June 12 and must be included '
            'when end_date=2026-06-12',
        )

    def test_start_date_boundary_utc_past_midnight_included_by_sp_local_date(self):
        """
        UTC 2026-06-15 02:30:00 → SP local 2026-06-14 23:30:00.
        Querying start_date=2026-06-14 must INCLUDE this transaction.
        """
        dt = datetime(2026, 6, 15, 2, 30, 0, tzinfo=timezone.utc)
        Transaction.objects.create(
            account=self.acc,
            pluggy_transaction_id='tx-sp-start-boundary',
            amount=Decimal('-222.00'),
            description='crosses UTC midnight but still SP June 14',
            date=dt,
        )
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-14',
            'end_date': '2026-06-15',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(
            r.data['expenses'], '-222.00',
            'Transaction at UTC 02:30 on June 15 is SP local June 14 and must be included '
            'when start_date=2026-06-14',
        )

    def test_utc_still_next_day_in_sp_excluded_correctly(self):
        """
        UTC 2026-06-13 12:00:00 → SP local 2026-06-13 09:00:00.
        Querying end_date=2026-06-12 must EXCLUDE this transaction.
        """
        dt = datetime(2026, 6, 13, 12, 0, 0, tzinfo=timezone.utc)
        Transaction.objects.create(
            account=self.acc,
            pluggy_transaction_id='tx-sp-next-day',
            amount=Decimal('-333.00'),
            description='UTC and SP local both June 13 — must be excluded',
            date=dt,
        )
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-12',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '0.00')


# ---------------------------------------------------------------------------
# Fix #7 — Inactive-account exclusion test
# ---------------------------------------------------------------------------

class DashboardInactiveAccountExclusionTest(APITestCase):
    """Transactions on inactive accounts must not appear in any summary field."""

    def setUp(self):
        self.user = _make_user('inactive-acc@example.com')
        self.client.force_authenticate(user=self.user)
        self.acc_active = _make_account(self.user, Decimal('1000.00'))
        self.acc_inactive = _make_account(self.user, Decimal('5000.00'), is_active=False)
        self.cat = Category.objects.create(
            name='TestCat', color='#AABBCC', icon='test',
        )

    def test_expense_on_inactive_account_excluded_from_expenses(self):
        _make_tx(self.acc_inactive, '-12345.00', '2026-06-01', category=self.cat)
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '0.00',
                         'Expense on inactive account must not appear in expenses')

    def test_income_on_inactive_account_excluded_from_income(self):
        _make_tx(self.acc_inactive, '9999.00', '2026-06-01')
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['income'], '0.00',
                         'Income on inactive account must not appear in income')

    def test_categorized_tx_on_inactive_account_excluded_from_by_category(self):
        _make_tx(self.acc_inactive, '-12345.00', '2026-06-01', category=self.cat)
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['by_category'], [],
                         'by_category must be empty when all txs are on inactive accounts')

    def test_inactive_account_excluded_from_balance(self):
        # Active account balance = 1000.00; inactive = 5000.00; only 1000.00 expected
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['balance'], '1000.00',
                         'Inactive account balance must not contribute to balance')


# ---------------------------------------------------------------------------
# Fix #8 — Zero-amount boundary test
# ---------------------------------------------------------------------------

class DashboardZeroAmountBoundaryTest(APITestCase):
    """A transaction with amount=0.00 must not appear in income, expenses, or by_category."""

    def setUp(self):
        self.user = _make_user('zero-amount@example.com')
        self.client.force_authenticate(user=self.user)
        self.acc = _make_account(self.user, Decimal('0.00'))
        self.cat = Category.objects.create(
            name='ZeroCat', color='#112233', icon='zero',
        )

    def test_zero_amount_excluded_from_income(self):
        _make_tx(self.acc, '0.00', '2026-06-01', category=self.cat)
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['income'], '0.00')

    def test_zero_amount_excluded_from_expenses(self):
        _make_tx(self.acc, '0.00', '2026-06-01', category=self.cat)
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '0.00')

    def test_zero_amount_excluded_from_by_category(self):
        _make_tx(self.acc, '0.00', '2026-06-01', category=self.cat)
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['by_category'], [])

    def test_zero_amount_does_not_disturb_existing_totals(self):
        """Adding a zero-amount tx must not change the sums of existing non-zero txs."""
        _make_tx(self.acc, '-50.00', '2026-06-02', category=self.cat)
        _make_tx(self.acc, '100.00', '2026-06-03')
        _make_tx(self.acc, '0.00', '2026-06-04', category=self.cat)
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['income'], '100.00')
        self.assertEqual(r.data['expenses'], '-50.00')
        cats = {item['category']: item for item in r.data['by_category']}
        self.assertIn('ZeroCat', cats)
        self.assertEqual(cats['ZeroCat']['total'], '-50.00')
        self.assertEqual(cats['ZeroCat']['count'], 1)


# ---------------------------------------------------------------------------
# Fix #9 — Real 90-day default-window boundary test
# ---------------------------------------------------------------------------

class DashboardDefaultWindow90DayBoundaryTest(APITestCase):
    """
    Freeze to '2026-06-14T15:00:00+00:00' (= 2026-06-14T12:00:00 SP, UTC-3) so
    that timezone.localdate() returns 2026-06-14 in São Paulo.

    NOTE: freeze_time('2026-06-14') freezes UTC midnight, which is still
    2026-06-13 in SP (UTC-3).  We must freeze to a UTC time that maps to
    2026-06-14 locally.

      - today (SP local) = 2026-06-14
      - start of window  = today - 90 days = 2026-03-16
      - A tx on exactly 2026-03-16 must be INCLUDED.
      - A tx on 2026-03-15 (91 days back) must be EXCLUDED.
    """

    # Freeze to noon SP = 15:00 UTC, ensuring SP local date = 2026-06-14.
    FROZEN_UTC = '2026-06-14T15:00:00+00:00'

    def setUp(self):
        self.user = _make_user('window-boundary@example.com')
        self.client.force_authenticate(user=self.user)
        self.acc = _make_account(self.user, Decimal('0.00'))

    @freeze_time(FROZEN_UTC)
    def test_tx_exactly_90_days_ago_is_included(self):
        # 2026-06-14 - 90 days = 2026-03-16
        # UTC noon on 2026-03-16 is safely within that SP local date too.
        Transaction.objects.create(
            account=self.acc,
            pluggy_transaction_id='tx-90-days-ago',
            amount=Decimal('-777.00'),
            description='exactly 90 days ago',
            date=datetime(2026, 3, 16, 12, 0, 0, tzinfo=timezone.utc),
        )
        r = self.client.get(SUMMARY_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '-777.00',
                         'Transaction exactly 90 days ago must be included in default window')

    @freeze_time(FROZEN_UTC)
    def test_tx_91_days_ago_is_excluded(self):
        # 2026-06-14 - 91 days = 2026-03-15
        Transaction.objects.create(
            account=self.acc,
            pluggy_transaction_id='tx-91-days-ago',
            amount=Decimal('-888.00'),
            description='91 days ago — outside default window',
            date=datetime(2026, 3, 15, 12, 0, 0, tzinfo=timezone.utc),
        )
        r = self.client.get(SUMMARY_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['expenses'], '0.00',
                         'Transaction 91 days ago must be excluded from default window')

    @freeze_time(FROZEN_UTC)
    def test_default_window_period_echoes_correct_dates(self):
        r = self.client.get(SUMMARY_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['period']['start_date'], '2026-03-16')
        self.assertEqual(r.data['period']['end_date'], '2026-06-14')


# ---------------------------------------------------------------------------
# Fix #10 — Null-category color must be '#000000'
# ---------------------------------------------------------------------------

class DashboardNullCategoryColorTest(APITestCase):
    """The uncategorized row in by_category must emit color='#000000', not null."""

    def setUp(self):
        self.user = _make_user('null-color@example.com')
        self.client.force_authenticate(user=self.user)
        self.acc = _make_account(self.user, Decimal('0.00'))

    def test_uncategorized_row_has_default_color(self):
        _make_tx(self.acc, '-55.55', '2026-06-01', category=None)
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-01',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        cats = {item['category']: item for item in r.data['by_category']}
        self.assertIn(None, cats)
        self.assertEqual(cats[None]['color'], '#000000',
                         "Uncategorized row must emit color='#000000', not null")


# ---------------------------------------------------------------------------
# Fix #11 — Inverted-range guard
# ---------------------------------------------------------------------------

class DashboardInvertedRangeTest(APITestCase):
    """start_date after end_date must return HTTP 400 with a descriptive error."""

    def setUp(self):
        self.user = _make_user('inverted-range@example.com')
        self.client.force_authenticate(user=self.user)

    def test_start_after_end_returns_400(self):
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-14',
            'end_date': '2026-06-01',
        })
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(r.data.get('error'),
                         'start_date must be on or before end_date')

    def test_same_start_and_end_is_allowed(self):
        """Equal start and end is a valid single-day range — must not 400."""
        r = self.client.get(SUMMARY_URL, {
            'start_date': '2026-06-14',
            'end_date': '2026-06-14',
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)
