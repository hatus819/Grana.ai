from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from .models import Transaction
from .serializers import TransactionSerializer
from apps.banking.models import BankAccount
from apps.ai_services.tasks import categorize_user_transactions

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_transactions(request):
    # Get user's bank accounts
    user_accounts = BankAccount.objects.filter(user=request.user, is_active=True)

    # Get transactions for user's accounts
    transactions = Transaction.objects.filter(account__in=user_accounts)

    # Apply filters
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    category_id = request.query_params.get('category_id')

    if start_date:
        transactions = transactions.filter(date__gte=start_date)
    if end_date:
        transactions = transactions.filter(date__lte=end_date)
    if category_id:
        transactions = transactions.filter(category_id=category_id)

    # Paginate (simplified)
    page = int(request.query_params.get('page', 1))
    limit = int(request.query_params.get('limit', 20))
    offset = (page - 1) * limit

    transactions = transactions[offset:offset + limit]

    serializer = TransactionSerializer(transactions, many=True)
    return Response({
        'count': Transaction.objects.filter(account__in=user_accounts).count(),
        'results': serializer.data
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_transaction(request, transaction_id):
    try:
        # Get user's bank accounts
        user_accounts = BankAccount.objects.filter(user=request.user, is_active=True)
        transaction = Transaction.objects.get(id=transaction_id, account__in=user_accounts)
        serializer = TransactionSerializer(transaction)
        return Response(serializer.data)
    except Transaction.DoesNotExist:
        return Response({'error': 'Transaction not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def categorize_transactions(request):
    # Trigger background task for categorization
    task = categorize_user_transactions.delay(request.user.id)

    return Response({
        'message': 'Transaction categorization started in background',
        'task_id': task.id
    }, status=status.HTTP_202_ACCEPTED)
