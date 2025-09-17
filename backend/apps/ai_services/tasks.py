from celery import shared_task
from .services import AIService
from apps.transactions.models import Transaction
from apps.categories.models import Category
from apps.banking.models import BankAccount

@shared_task
def categorize_user_transactions(user_id):
    """
    Background task to categorize all uncategorized transactions for a user
    """
    user_accounts = BankAccount.objects.filter(user_id=user_id, is_active=True)
    uncategorized_transactions = Transaction.objects.filter(
        account__in=user_accounts,
        category__isnull=True
    )

    categorized_count = 0
    for transaction in uncategorized_transactions:
        category_name = AIService.categorize_transaction(
            transaction.description,
            transaction.amount
        )

        # Get or create category
        category, created = Category.objects.get_or_create(
            name=category_name,
            defaults={'icon': 'default', 'color': '#000000', 'keywords': ''}
        )

        transaction.category = category
        transaction.is_processed = True
        transaction.save()
        categorized_count += 1

    return f'Categorized {categorized_count} transactions for user {user_id}'
