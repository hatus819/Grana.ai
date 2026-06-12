import os
from decimal import Decimal
from unittest.mock import MagicMock, patch

import requests as requests_lib
from django.test import TestCase, override_settings
from django.urls import reverse
from freezegun import freeze_time
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.transactions.models import Transaction
from .models import BankAccount
from .services import PluggyError, PluggyService
from .tasks import sync_account_transactions, sync_all_active_accounts

User = get_user_model()


def _response(status_code=200, payload=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = payload or {}
    return resp


class PluggyServiceTests(TestCase):
    """The real Pluggy auth model: clientId/clientSecret are exchanged at
    POST /auth for a short-lived API key, cached and refreshed on expiry."""

    def setUp(self):
        self.env = patch.dict(os.environ, {
            'PLUGGY_CLIENT_ID': 'cid',
            'PLUGGY_CLIENT_SECRET': 'csec',
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    @patch('apps.banking.services.cache')
    @patch('apps.banking.services.requests')
    def test_get_api_key_exchanges_client_credentials(self, mock_requests, mock_cache):
        mock_cache.get.return_value = None
        mock_requests.post.return_value = _response(200, {'apiKey': 'fresh-key'})

        key = PluggyService.get_api_key()

        self.assertEqual(key, 'fresh-key')
        args, kwargs = mock_requests.post.call_args
        self.assertIn('/auth', args[0])
        self.assertEqual(kwargs['json'], {'clientId': 'cid', 'clientSecret': 'csec'})
        mock_cache.set.assert_called_once()

    @patch('apps.banking.services.cache')
    @patch('apps.banking.services.requests')
    def test_get_api_key_reuses_cached_key(self, mock_requests, mock_cache):
        mock_cache.get.return_value = 'cached-key'

        key = PluggyService.get_api_key()

        self.assertEqual(key, 'cached-key')
        mock_requests.post.assert_not_called()

    @patch('apps.banking.services.cache')
    @patch('apps.banking.services.requests')
    def test_get_api_key_survives_cache_backend_failure(self, mock_requests, mock_cache):
        """Redis being down must not break Pluggy calls."""
        mock_cache.get.side_effect = Exception('redis down')
        mock_cache.set.side_effect = Exception('redis down')
        mock_requests.post.return_value = _response(200, {'apiKey': 'fresh-key'})

        self.assertEqual(PluggyService.get_api_key(), 'fresh-key')

    def test_missing_credentials_raise_pluggy_error(self):
        with patch.dict(os.environ, {'PLUGGY_CLIENT_ID': '', 'PLUGGY_CLIENT_SECRET': ''}):
            with self.assertRaises(PluggyError):
                PluggyService.get_api_key()

    @patch('apps.banking.services.cache')
    @patch('apps.banking.services.requests')
    def test_expired_api_key_is_refreshed_transparently(self, mock_requests, mock_cache):
        """A 401/403 from Pluggy means the cached key expired: mint a new
        one and retry the request once."""
        mock_cache.get.return_value = 'stale-key'
        mock_requests.post.return_value = _response(200, {'apiKey': 'new-key'})
        mock_requests.request.side_effect = [
            _response(401, {'message': 'expired'}),
            _response(200, {'results': [{'id': 'acc-1'}]}),
        ]

        data = PluggyService.get_accounts('item-1')

        self.assertEqual(data['results'][0]['id'], 'acc-1')
        mock_requests.post.assert_called_once()
        second_headers = mock_requests.request.call_args_list[1].kwargs['headers']
        self.assertEqual(second_headers['X-API-KEY'], 'new-key')

    @patch('apps.banking.services.cache')
    @patch('apps.banking.services.requests')
    def test_get_transactions_follows_pagination(self, mock_requests, mock_cache):
        mock_cache.get.return_value = 'key'
        mock_requests.request.side_effect = [
            _response(200, {'results': [{'id': 'tx-1'}], 'page': 1, 'totalPages': 2}),
            _response(200, {'results': [{'id': 'tx-2'}], 'page': 2, 'totalPages': 2}),
        ]

        rows = PluggyService.get_transactions('acc-1', '2026-03-14', '2026-06-12')

        self.assertEqual([r['id'] for r in rows], ['tx-1', 'tx-2'])
        pages = [c.kwargs['params']['page'] for c in mock_requests.request.call_args_list]
        self.assertEqual(pages, [1, 2])

    @patch('apps.banking.services.cache')
    @patch('apps.banking.services.requests')
    def test_create_connect_token_scopes_to_user(self, mock_requests, mock_cache):
        mock_cache.get.return_value = 'key'
        mock_requests.request.return_value = _response(200, {'accessToken': 'widget-token'})

        token = PluggyService.create_connect_token(client_user_id=42)

        self.assertEqual(token, 'widget-token')
        call = mock_requests.request.call_args
        self.assertIn('/connect_token', call.args[1])
        # Pluggy requires clientUserId nested under 'options' — sent top-level
        # it is silently ignored and the item carries clientUserId=null,
        # which makes our ownership check reject the user's own item.
        self.assertEqual(call.kwargs['json'], {'options': {'clientUserId': '42'}})


class ConnectTokenViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com', password='Tr0car-Forte#2026')
        self.client.force_authenticate(user=self.user)
        self.url = reverse('banking:connect_token')

    @patch('apps.banking.views.PluggyService.create_connect_token')
    def test_returns_widget_token_scoped_to_requesting_user(self, mock_token):
        mock_token.return_value = 'widget-token'

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'accessToken': 'widget-token'})
        mock_token.assert_called_once_with(client_user_id=str(self.user.id))

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch('apps.banking.views.PluggyService.create_connect_token')
    def test_pluggy_failure_maps_to_502(self, mock_token):
        mock_token.side_effect = PluggyError('credentials rejected')
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)


class ConnectBankAccountTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com', password='Tr0car-Forte#2026')
        self.client.force_authenticate(user=self.user)
        self.url = reverse('banking:connect_bank_account')
        self.accounts_payload = {'results': [{
            'id': 'pacc-1',
            'name': 'Pluggy Bank',
            'type': 'BANK',
            'balance': 1234.56,
        }]}

    @patch('apps.banking.views.sync_account_transactions')
    @patch('apps.banking.views.PluggyService')
    def test_rejects_item_belonging_to_another_user(self, mock_service, mock_sync):
        mock_service.get_item.return_value = {'id': 'item-1', 'clientUserId': '999'}

        response = self.client.post(self.url, {'itemId': 'item-1'})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(BankAccount.objects.count(), 0)
        mock_service.get_accounts.assert_not_called()

    @patch('apps.banking.views.sync_account_transactions')
    @patch('apps.banking.views.PluggyService')
    def test_connects_owned_item_and_enqueues_initial_sync(self, mock_service, mock_sync):
        mock_service.get_item.return_value = {
            'id': 'item-1', 'clientUserId': str(self.user.id)}
        mock_service.get_accounts.return_value = self.accounts_payload

        response = self.client.post(self.url, {'itemId': 'item-1'})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        account = BankAccount.objects.get()
        self.assertEqual(account.bank_name, 'Pluggy Bank')
        self.assertEqual(account.user, self.user)
        self.assertEqual(response.data['accounts'][0]['pluggy_account_id'], 'pacc-1')
        self.assertTrue(response.data['sync_started'])
        mock_sync.delay.assert_called_once_with(account.id)

    @override_settings(DEBUG=True)
    @patch('apps.banking.views.sync_account_transactions')
    @patch('apps.banking.views.PluggyService')
    def test_sync_runs_inline_when_broker_is_down(self, mock_service, mock_sync):
        mock_service.get_item.return_value = {
            'id': 'item-1', 'clientUserId': str(self.user.id)}
        mock_service.get_accounts.return_value = self.accounts_payload
        mock_sync.delay.side_effect = Exception('no broker')

        response = self.client.post(self.url, {'itemId': 'item-1'})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['sync_started'])
        account = BankAccount.objects.get()
        mock_sync.assert_called_once_with(account.id)

    @override_settings(DEBUG=True)
    @patch('apps.banking.views.sync_account_transactions')
    @patch('apps.banking.views.PluggyService')
    def test_inline_sync_failure_still_returns_created_accounts(self, mock_service, mock_sync):
        """Accounts are persisted before syncing — a sync failure must not
        turn the response into a 500 for a half-successful operation."""
        mock_service.get_item.return_value = {
            'id': 'item-1', 'clientUserId': str(self.user.id)}
        mock_service.get_accounts.return_value = self.accounts_payload
        mock_sync.delay.side_effect = Exception('no broker')
        mock_sync.side_effect = requests_lib.HTTPError('pluggy 500')

        response = self.client.post(self.url, {'itemId': 'item-1'})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['sync_started'])
        self.assertEqual(BankAccount.objects.count(), 1)

    @override_settings(DEBUG=False)
    @patch('apps.banking.views.sync_account_transactions')
    @patch('apps.banking.views.PluggyService')
    def test_no_inline_sync_in_production(self, mock_service, mock_sync):
        """In production a 90-day import must never run inside the request
        cycle (gunicorn worker timeout) — degrade to sync_started=False."""
        mock_service.get_item.return_value = {
            'id': 'item-1', 'clientUserId': str(self.user.id)}
        mock_service.get_accounts.return_value = self.accounts_payload
        mock_sync.delay.side_effect = Exception('no broker')

        response = self.client.post(self.url, {'itemId': 'item-1'})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['sync_started'])
        mock_sync.assert_not_called()


class FetchTransactionsViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com', password='Tr0car-Forte#2026')
        self.client.force_authenticate(user=self.user)
        self.account = BankAccount.objects.create(
            user=self.user,
            pluggy_account_id='test_account_id',
            bank_name='Test Bank',
            account_type='CHECKING',
            balance=1000.00,
        )
        self.url = reverse('banking:fetch_transactions', args=[self.account.id])

    @patch('apps.banking.views.sync_account_transactions')
    def test_enqueues_sync_with_requested_range(self, mock_sync):
        mock_sync.delay.return_value = MagicMock(id='task-1')

        response = self.client.post(
            self.url, {'start_date': '2026-05-01', 'end_date': '2026-06-01'})

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        mock_sync.delay.assert_called_once_with(
            self.account.id, start_date='2026-05-01', end_date='2026-06-01')

    @patch('apps.banking.views.sync_account_transactions')
    def test_dates_are_optional(self, mock_sync):
        """Without an explicit range, the task defaults to the last 90 days."""
        mock_sync.delay.return_value = MagicMock(id='task-1')

        response = self.client.post(self.url, {})

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        mock_sync.delay.assert_called_once_with(
            self.account.id, start_date=None, end_date=None)

    @override_settings(DEBUG=True)
    @patch('apps.banking.views.sync_account_transactions')
    def test_runs_inline_when_broker_is_down(self, mock_sync):
        mock_sync.delay.side_effect = Exception('no broker')
        mock_sync.return_value = '3 transactions imported'

        response = self.client.post(self.url, {})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_sync.assert_called_once_with(
            self.account.id, start_date=None, end_date=None)

    def test_unknown_account_returns_404(self):
        url = reverse('banking:fetch_transactions', args=[999])
        response = self.client.post(url, {})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch('apps.banking.views.sync_account_transactions')
    def test_rejects_malformed_dates(self, mock_sync):
        """User dates must be validated in the view — not crash the task."""
        response = self.client.post(self.url, {'end_date': 'banana'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('end_date', str(response.data))
        mock_sync.delay.assert_not_called()
        mock_sync.assert_not_called()

    @override_settings(DEBUG=True)
    @patch('apps.banking.views.sync_account_transactions')
    def test_inline_failure_returns_502_not_500(self, mock_sync):
        mock_sync.delay.side_effect = Exception('no broker')
        mock_sync.side_effect = requests_lib.HTTPError('pluggy 500')
        self.client.raise_request_exception = False

        response = self.client.post(self.url, {})

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)

    @override_settings(DEBUG=False)
    @patch('apps.banking.views.sync_account_transactions')
    def test_no_inline_fallback_in_production(self, mock_sync):
        mock_sync.delay.side_effect = Exception('no broker')

        response = self.client.post(self.url, {})

        self.assertEqual(
            response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        mock_sync.assert_not_called()


class SyncAccountTransactionsTaskTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com', password='Tr0car-Forte#2026')
        self.account = BankAccount.objects.create(
            user=self.user,
            pluggy_account_id='test_account_id',
            bank_name='Test Bank',
            account_type='CHECKING',
            balance=1000.00,
        )

    @patch('apps.banking.tasks.categorize_user_transactions')
    @patch('apps.banking.tasks.PluggyService')
    def test_imports_last_90_days_with_decimal_amounts(self, mock_service, mock_categorize):
        mock_service.get_transactions.return_value = [
            {'id': 'tx-1', 'amount': -54.9, 'description': 'IFOOD *RESTAURANTE',
             'date': '2026-05-10T03:00:00.000Z'},
            {'id': 'tx-2', 'amount': 1200.5, 'description': 'PIX RECEBIDO',
             'date': '2026-05-11T03:00:00.000Z'},
        ]

        with freeze_time('2026-06-12'):
            sync_account_transactions(self.account.id)

        mock_service.get_transactions.assert_called_once_with(
            'test_account_id', '2026-03-14', '2026-06-12')
        self.assertEqual(Transaction.objects.count(), 2)
        tx = Transaction.objects.get(pluggy_transaction_id='tx-1')
        self.assertEqual(tx.amount, Decimal('-54.9'))
        mock_categorize.delay.assert_called_once_with(self.user.id)

    @patch('apps.banking.tasks.categorize_user_transactions')
    @patch('apps.banking.tasks.PluggyService')
    def test_skips_already_imported_transactions(self, mock_service, mock_categorize):
        Transaction.objects.create(
            account=self.account, pluggy_transaction_id='tx-1', amount=-1,
            description='old', date='2026-05-10T03:00:00+00:00')
        mock_service.get_transactions.return_value = [
            {'id': 'tx-1', 'amount': -54.9, 'description': 'IFOOD',
             'date': '2026-05-10T03:00:00.000Z'},
            {'id': 'tx-3', 'amount': -10.0, 'description': 'UBER',
             'date': '2026-05-12T03:00:00.000Z'},
        ]

        sync_account_transactions(self.account.id)

        self.assertEqual(Transaction.objects.count(), 2)
        self.assertTrue(
            Transaction.objects.filter(pluggy_transaction_id='tx-3').exists())

    @patch('apps.banking.tasks.categorize_user_transactions')
    @patch('apps.banking.tasks.PluggyService')
    def test_no_categorization_when_nothing_imported(self, mock_service, mock_categorize):
        mock_service.get_transactions.return_value = []

        sync_account_transactions(self.account.id)

        mock_categorize.delay.assert_not_called()

    @patch('apps.banking.tasks.categorize_user_transactions')
    @patch('apps.banking.tasks.PluggyService')
    def test_categorization_broker_failure_does_not_break_sync(self, mock_service, mock_categorize):
        mock_service.get_transactions.return_value = [
            {'id': 'tx-1', 'amount': -5.0, 'description': 'X',
             'date': '2026-05-10T03:00:00.000Z'},
        ]
        mock_categorize.delay.side_effect = Exception('no broker')

        sync_account_transactions(self.account.id)  # must not raise

        self.assertEqual(Transaction.objects.count(), 1)

    @patch('apps.banking.tasks.categorize_user_transactions')
    @patch('apps.banking.tasks.PluggyService')
    def test_duplicate_insert_race_does_not_abort_import(self, mock_service, mock_categorize):
        """A concurrent sync inserting the same pluggy_transaction_id must
        not kill this import mid-loop — remaining rows still land."""
        from django.db import IntegrityError
        mock_service.get_transactions.return_value = [
            {'id': 'tx-1', 'amount': -5.0, 'description': 'A',
             'date': '2026-05-10T03:00:00.000Z'},
            {'id': 'tx-2', 'amount': -6.0, 'description': 'B',
             'date': '2026-05-11T03:00:00.000Z'},
        ]
        real_tx = Transaction.objects.create(
            account=self.account, pluggy_transaction_id='other', amount=-1,
            description='x', date='2026-05-01T00:00:00+00:00')
        with patch('apps.banking.tasks.Transaction.objects.get_or_create',
                   side_effect=[IntegrityError('race'), (real_tx, True)]):
            sync_account_transactions(self.account.id)  # must not raise

    def test_sync_task_retries_on_transient_pluggy_errors(self):
        """Transient Pluggy/network failures must not permanently lose the
        one-shot 90-day backfill — the task retries with backoff."""
        self.assertIn(
            requests_lib.RequestException, sync_account_transactions.autoretry_for)
        self.assertTrue(sync_account_transactions.retry_backoff)
        self.assertGreaterEqual(sync_account_transactions.max_retries, 3)

    @patch('apps.banking.tasks.categorize_user_transactions')
    @patch('apps.banking.tasks.PluggyService')
    def test_truncates_descriptions_to_model_limit(self, mock_service, mock_categorize):
        mock_service.get_transactions.return_value = [
            {'id': 'tx-1', 'amount': -5.0, 'description': 'X' * 300,
             'date': '2026-05-10T03:00:00.000Z'},
        ]

        sync_account_transactions(self.account.id)

        tx = Transaction.objects.get()
        self.assertEqual(len(tx.description), 200)


class SyncAllActiveAccountsTaskTests(TestCase):
    @patch('apps.banking.tasks.sync_account_transactions')
    def test_enqueues_incremental_sync_only_for_active_accounts(self, mock_sync):
        user = User.objects.create_user(
            email='test@example.com', password='Tr0car-Forte#2026')
        active = BankAccount.objects.create(
            user=user, pluggy_account_id='acc-active', bank_name='B',
            account_type='CHECKING', balance=0)
        BankAccount.objects.create(
            user=user, pluggy_account_id='acc-inactive', bank_name='B',
            account_type='CHECKING', balance=0, is_active=False)

        with freeze_time('2026-06-12'):
            sync_all_active_accounts()

        mock_sync.delay.assert_called_once_with(
            active.id, start_date='2026-06-09')


class BankingTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='password123'
        )
        self.client.force_authenticate(user=self.user)

        self.account = BankAccount.objects.create(
            user=self.user,
            pluggy_account_id='test_account_id',
            bank_name='Test Bank',
            account_type='CHECKING',
            balance=1000.00
        )

        self.list_accounts_url = reverse('banking:list_bank_accounts')

    def test_list_bank_accounts_success(self):
        """
        Ensure a user can list their own bank accounts.
        """
        response = self.client.get(self.list_accounts_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['bank_name'], 'Test Bank')

    def test_list_bank_accounts_unauthenticated(self):
        """
        Ensure unauthenticated users cannot list bank accounts.
        """
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_accounts_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_bank_accounts_no_accounts(self):
        """
        Ensure an empty list is returned for a user with no bank accounts.
        """
        BankAccount.objects.all().delete()
        response = self.client.get(self.list_accounts_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)
