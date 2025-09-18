from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import BankAccount
from .serializers import BankAccountSerializer, ConnectBankAccountSerializer
from .services import PluggyService
from apps.transactions.models import Transaction
from apps.categories.models import Category
from datetime import datetime

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_bank_accounts(request):
    accounts = BankAccount.objects.filter(user=request.user, is_active=True)
    serializer = BankAccountSerializer(accounts, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def connect_bank_account(request):
    serializer = ConnectBankAccountSerializer(data=request.data)
    if serializer.is_valid():
        item_id = serializer.validated_data['itemId']
        try:
            accounts_data = PluggyService.get_accounts(item_id)
            created_accounts = []
            for account_data in accounts_data['results']:
                bank_account, created = BankAccount.objects.update_or_create(
                    user=request.user,
                    pluggy_account_id=account_data['id'],
                    defaults={
                        'bank_name': account_data.get('name', 'Unknown'),
                        'account_type': account_data.get('type', 'OTHER'),
                        'balance': account_data.get('balance', 0),
                        'is_active': True,
                    }
                )
                created_accounts.append(bank_account)

            response_serializer = BankAccountSerializer(created_accounts, many=True)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def disconnect_bank_account(request, account_id):
    try:
        account = BankAccount.objects.get(id=account_id, user=request.user)
        account.is_active = False
        account.save()
        return Response({'message': 'Bank account disconnected successfully'})
    except BankAccount.DoesNotExist:
        return Response({'error': 'Bank account not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def fetch_transactions(request, account_id):
    try:
        account = BankAccount.objects.get(id=account_id, user=request.user, is_active=True)
    except BankAccount.DoesNotExist:
        return Response({'error': 'Bank account not found'}, status=status.HTTP_404_NOT_FOUND)

    start_date = request.data.get('start_date')
    end_date = request.data.get('end_date')

    if not start_date or not end_date:
        return Response({'error': 'start_date and end_date are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        pluggy_transactions = PluggyService.get_transactions(account.pluggy_account_id, start_date, end_date)

        saved_transactions = []
        for tx_data in pluggy_transactions.get('transactions', []):
            # Check if transaction already exists
            if not Transaction.objects.filter(pluggy_transaction_id=tx_data['id']).exists():
                transaction = Transaction.objects.create(
                    account=account,
                    pluggy_transaction_id=tx_data['id'],
                    amount=tx_data['amount'],
                    description=tx_data['description'],
                    date=datetime.fromisoformat(tx_data['date']),
                    # Category will be set by AI later
                )
                saved_transactions.append(transaction)

        return Response({
            'message': f'Successfully fetched {len(saved_transactions)} new transactions',
            'transactions': len(saved_transactions)
        }, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
