from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.transactions.models import Transaction
from .models import BankAccount

User = get_user_model()

class FetchTransactionsTests(APITestCase):
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
        self.fetch_url = reverse('banking:fetch_transactions', args=[self.account.id])

    @patch('apps.banking.views.PluggyService.get_transactions')
    def test_fetch_saves_transactions_from_pluggy_results_key(self, mock_get_transactions):
        """
        Pluggy's GET /transactions returns rows under the 'results' key —
        they must be parsed and saved.
        """
        mock_get_transactions.return_value = {
            'results': [{
                'id': 'pluggy-tx-1',
                'amount': -54.90,
                'description': 'IFOOD *RESTAURANTE',
                'date': '2026-05-10T03:00:00.000Z',
            }],
            'total': 1,
            'page': 1,
            'totalPages': 1,
        }
        response = self.client.post(
            self.fetch_url,
            {'start_date': '2026-05-01', 'end_date': '2026-06-01'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Transaction.objects.count(), 1)
        tx = Transaction.objects.get()
        self.assertEqual(tx.pluggy_transaction_id, 'pluggy-tx-1')
        self.assertEqual(tx.description, 'IFOOD *RESTAURANTE')

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
