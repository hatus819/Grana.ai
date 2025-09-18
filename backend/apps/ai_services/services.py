import openai
import os
from django.core.cache import cache
from .models import AICache

class AIService:
    @staticmethod
    def get_client():
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            return None
        return openai.OpenAI(api_key=api_key)

    @staticmethod
    def categorize_transaction(description, amount):
        cache_key = f"categorize_{description}_{amount}"
        try:
            cached_result = cache.get(cache_key)
            if cached_result:
                return cached_result
        except Exception:
            # Cache might not be available (e.g., Redis down)
            pass

        # Check database cache
        try:
            db_cache = AICache.objects.filter(key=cache_key).first()
            if db_cache and not db_cache.is_expired():
                return db_cache.value
        except Exception:
            # Database might not be available
            pass

        client = AIService.get_client()
        if not client:
            return AIService.fallback_categorization(description)

        prompt = f"""
        Categorize the following financial transaction:
        Description: {description}
        Amount: {amount}

        Return only the category name in Portuguese, from these options:
        - Alimentação (food)
        - Transporte (transport)
        - Lazer (leisure)
        - Saúde (health)
        - Educação (education)
        - Compras (shopping)
        - Serviços (utilities)
        - Outros (other)

        Be precise and consider common Brazilian spending patterns.
        """

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=50,
                temperature=0.1
            )
            category = response.choices[0].message.content.strip()

            # Cache in Redis and DB
            try:
                cache.set(cache_key, category, timeout=3600)  # 1 hour
            except Exception:
                pass
            try:
                AICache.objects.update_or_create(
                    key=cache_key,
                    defaults={'value': category}
                )
            except Exception:
                pass

            return category
        except Exception as e:
            # Fallback to basic categorization
            return AIService.fallback_categorization(description)

    @staticmethod
    def fallback_categorization(description):
        desc_lower = description.lower()
        if any(word in desc_lower for word in ['restaurante', 'mercado', 'supermercado', 'padaria', 'ifood']):
            return 'Alimentação'
        elif any(word in desc_lower for word in ['uber', 'taxi', 'onibus', 'metro', 'combustivel', 'posto']):
            return 'Transporte'
        elif any(word in desc_lower for word in ['cinema', 'teatro', 'show', 'bar', 'netflix', 'spotify']):
            return 'Lazer'
        elif any(word in desc_lower for word in ['farmacia', 'medico', 'hospital', 'clinica']):
            return 'Saúde'
        elif any(word in desc_lower for word in ['escola', 'universidade', 'curso', 'livro']):
            return 'Educação'
        elif any(word in desc_lower for word in ['shopping', 'loja', 'compras']):
            return 'Compras'
        elif any(word in desc_lower for word in ['luz', 'agua', 'gas', 'telefone', 'internet']):
            return 'Serviços'
        else:
            return 'Outros'
