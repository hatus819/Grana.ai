from django.test import TestCase
from unittest.mock import patch, MagicMock
from apps.ai_services.services import AIService
import os

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
