from django.test import TestCase
from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model
from apps.ai_services.services import AIService
from apps.ai_services.tasks import categorize_user_transactions
from apps.banking.models import BankAccount
from apps.transactions.models import Transaction
from django.utils import timezone
import os

User = get_user_model()


def _mock_openai_returning(mock_openai, content):
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices[0].message.content = content
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai.return_value = mock_client
    return mock_client


class AIServiceOutputValidationTests(TestCase):
    """The raw LLM string must be validated against the 8 allowed categories."""

    def _categorize(self, mock_openai, mock_cache, mock_ai_cache, llm_reply, description):
        mock_cache.get.return_value = None
        mock_queryset = MagicMock()
        mock_queryset.first.return_value = None
        mock_ai_cache.objects.filter.return_value = mock_queryset
        client = _mock_openai_returning(mock_openai, llm_reply)
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}):
            return AIService.categorize_transaction(description, -50.00), client

    @patch('apps.ai_services.services.AICache')
    @patch('apps.ai_services.services.cache')
    @patch('apps.ai_services.services.openai.OpenAI')
    def test_decorated_llm_reply_normalized_to_allowed_category(self, mock_openai, mock_cache, mock_ai_cache):
        category, _ = self._categorize(
            mock_openai, mock_cache, mock_ai_cache,
            ' Alimentação (food) ', 'iFood')
        self.assertEqual(category, 'Alimentação')

    @patch('apps.ai_services.services.AICache')
    @patch('apps.ai_services.services.cache')
    @patch('apps.ai_services.services.openai.OpenAI')
    def test_gibberish_llm_reply_falls_back_to_keyword_rules(self, mock_openai, mock_cache, mock_ai_cache):
        category, _ = self._categorize(
            mock_openai, mock_cache, mock_ai_cache,
            'I cannot categorize this transaction', 'corrida uber centro')
        self.assertEqual(category, 'Transporte')

    @patch('apps.ai_services.services.AICache')
    @patch('apps.ai_services.services.cache')
    @patch('apps.ai_services.services.openai.OpenAI')
    def test_uses_current_default_model(self, mock_openai, mock_cache, mock_ai_cache):
        """gpt-4o-mini is retired; default must be gpt-4.1-mini, overridable via OPENAI_MODEL."""
        _, client = self._categorize(
            mock_openai, mock_cache, mock_ai_cache,
            'Alimentação', 'iFood')
        self.assertEqual(
            client.chat.completions.create.call_args.kwargs['model'],
            'gpt-4.1-mini')


class CacheKeyTests(TestCase):
    @patch('apps.ai_services.services.AICache')
    @patch('apps.ai_services.services.cache')
    @patch('apps.ai_services.services.openai.OpenAI')
    def test_cache_key_is_cache_backend_safe(self, mock_openai, mock_cache, mock_ai_cache):
        """Descriptions contain spaces/punctuation — the cache key must not
        (memcached-incompatible and triggers CacheKeyWarning)."""
        mock_cache.get.return_value = None
        mock_queryset = MagicMock()
        mock_queryset.first.return_value = None
        mock_ai_cache.objects.filter.return_value = mock_queryset
        _mock_openai_returning(mock_openai, 'Serviços')

        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}):
            AIService.categorize_transaction('Pagamento de boleto', -100.00)

        key = mock_cache.set.call_args.args[0]
        self.assertNotIn(' ', key)
        self.assertLess(len(key), 250)

    @patch('apps.ai_services.services.AICache')
    @patch('apps.ai_services.services.cache')
    @patch('apps.ai_services.services.openai.OpenAI')
    def test_cache_key_distinguishes_income_from_expense(self, mock_openai, mock_cache, mock_ai_cache):
        """Same description with opposite signs (PIX in vs out) must not
        share a cached category; magnitude alone must (cache hit rate)."""
        mock_cache.get.return_value = None
        mock_queryset = MagicMock()
        mock_queryset.first.return_value = None
        mock_ai_cache.objects.filter.return_value = mock_queryset
        _mock_openai_returning(mock_openai, 'Outros')

        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}):
            AIService.categorize_transaction('PIX TRANSFERENCIA', 5000.00)
            AIService.categorize_transaction('PIX TRANSFERENCIA', -50.00)
            AIService.categorize_transaction('PIX TRANSFERENCIA', -900.00)

        keys = [c.args[0] for c in mock_cache.set.call_args_list]
        self.assertNotEqual(keys[0], keys[1])
        self.assertEqual(keys[1], keys[2])


class CategorizeTaskTests(TestCase):
    @patch('apps.ai_services.tasks.AIService.categorize_transaction')
    def test_task_creates_category_with_list_keywords(self, mock_categorize):
        """
        Category.keywords is a JSONField(default=list) — the task must not
        create categories with a string default.
        """
        mock_categorize.return_value = 'Alimentação'
        user = User.objects.create_user(email='task@example.com', password='password123')
        account = BankAccount.objects.create(
            user=user, pluggy_account_id='acc-1', bank_name='Test Bank',
            account_type='CHECKING', balance=100.00)
        tx = Transaction.objects.create(
            account=account, pluggy_transaction_id='tx-1', amount=-10.00,
            description='iFood', date=timezone.now())

        categorize_user_transactions(user.id)

        tx.refresh_from_db()
        self.assertEqual(tx.category.name, 'Alimentação')
        self.assertEqual(tx.category.keywords, [])
        self.assertTrue(tx.is_processed)

class AIServiceTests(TestCase):

    @patch('os.environ.get')
    @patch('apps.ai_services.services.AICache')
    @patch('apps.ai_services.services.cache')
    @patch('apps.ai_services.services.openai.OpenAI')
    def test_categorize_transaction_success(self, mock_openai, mock_cache, mock_ai_cache, mock_environ_get):
        """
        Ensure the AIService can categorize a transaction using the OpenAI API.
        """
        # Mock environment
        mock_environ_get.return_value = 'fake_api_key'

        # Mock cache to return None
        mock_cache.get.return_value = None
        mock_queryset = MagicMock()
        mock_queryset.first.return_value = None
        mock_ai_cache.objects.filter.return_value = mock_queryset

        # Mock the OpenAI client and its response
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices[0].message.content = 'Alimentação'
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai.return_value = mock_client

        # Call the service
        category = AIService.categorize_transaction('iFood', -50.00)

        # Assertions
        self.assertEqual(category, 'Alimentação')
        mock_client.chat.completions.create.assert_called_once()

    @patch('apps.ai_services.services.AICache')
    @patch('apps.ai_services.services.cache')
    @patch('apps.ai_services.services.openai.OpenAI')
    def test_categorize_transaction_api_error(self, mock_openai, mock_cache, mock_ai_cache):
        """
        Ensure the AIService falls back to the fallback categorization on API error.
        """
        # Mock cache to return None
        mock_cache.get.return_value = None
        mock_queryset = MagicMock()
        mock_queryset.first.return_value = None
        mock_ai_cache.objects.filter.return_value = mock_queryset

        # Mock the OpenAI client to raise an exception
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = Exception('API Error')
        mock_openai.return_value = mock_client

        # Call the service
        category = AIService.categorize_transaction('Restaurante', -75.00)

        # Assertions
        self.assertEqual(category, 'Alimentação')

    def test_fallback_categorization(self):
        """
        Test the fallback categorization logic.
        """
        self.assertEqual(AIService.fallback_categorization('uber'), 'Transporte')
        self.assertEqual(AIService.fallback_categorization('cinema'), 'Lazer')
        self.assertEqual(AIService.fallback_categorization('farmacia'), 'Saúde')
        self.assertEqual(AIService.fallback_categorization('livro'), 'Educação')
        self.assertEqual(AIService.fallback_categorization('loja de roupas'), 'Compras')
        self.assertEqual(AIService.fallback_categorization('conta de luz'), 'Serviços')
        self.assertEqual(AIService.fallback_categorization('alguma outra coisa'), 'Outros')
