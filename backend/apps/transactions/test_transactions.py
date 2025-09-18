from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.banking.models import BankAccount
from .models import Transaction
from datetime import datetime

User = get_user_model()

class TransactionTests(APITestCase):
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

        self.transaction = Transaction.objects.create(
            account=self.account,
            pluggy_transaction_id='test_transaction_id',
            amount=100.00,
            description='Test Transaction',
            date=datetime.now()
        )

        self.list_transactions_url = reverse('transactions:list_transactions')
        self.get_transaction_url = reverse('transactions:get_transaction', args=[self.transaction.id])

    def test_list_transactions_success(self):
        """
        Ensure a user can list their own transactions.
        """
        response = self.client.get(self.list_transactions_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['description'], 'Test Transaction')

    def test_list_transactions_unauthenticated(self):
        """
        Ensure unauthenticated users cannot list transactions.
        """
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_transactions_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_transaction_success(self):
        """
        Ensure a user can retrieve a single transaction.
        """
        response = self.client.get(self.get_transaction_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['description'], 'Test Transaction')

    def test_get_transaction_not_found(self):
        """
        Ensure a 404 is returned for a non-existent transaction.
        """
        url = reverse('transactions:get_transaction', args=[999])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
