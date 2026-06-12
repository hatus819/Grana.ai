from datetime import date

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import BankAccount
from .serializers import BankAccountSerializer, ConnectBankAccountSerializer
from .services import PluggyService
from .tasks import sync_account_transactions

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_bank_accounts(request):
    accounts = BankAccount.objects.filter(user=request.user, is_active=True)
    serializer = BankAccountSerializer(accounts, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_connect_token(request):
    """Token for the Pluggy Connect widget, bound to the requesting user."""
    try:
        token = PluggyService.create_connect_token(client_user_id=str(request.user.id))
    except Exception:
        return Response(
            {'error': 'Could not create a bank connection token'},
            status=status.HTTP_502_BAD_GATEWAY)
    return Response({'accessToken': token})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def connect_bank_account(request):
    serializer = ConnectBankAccountSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    item_id = serializer.validated_data['itemId']
    try:
        item = PluggyService.get_item(item_id)
    except Exception:
        return Response({'error': 'Could not verify the bank connection'},
                        status=status.HTTP_502_BAD_GATEWAY)

    # Items are created through connect tokens carrying our user id —
    # never import data from an item that belongs to someone else.
    if item.get('clientUserId') != str(request.user.id):
        return Response({'error': 'This bank connection does not belong to you'},
                        status=status.HTTP_403_FORBIDDEN)

    try:
        accounts_data = PluggyService.get_accounts(item_id)
    except Exception:
        return Response({'error': 'Could not fetch accounts for this connection'},
                        status=status.HTTP_502_BAD_GATEWAY)

    created_accounts = []
    for account_data in accounts_data.get('results', []):
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

    # Accounts are persisted at this point: sync failures degrade to
    # sync_started=False (recoverable via the fetch endpoint), never a 500.
    sync_started = False
    for bank_account in created_accounts:
        try:
            sync_account_transactions.delay(bank_account.id)
            sync_started = True
        except Exception:
            # Broker down. Importing inline is only acceptable in dev —
            # in production the 90-day import would outlive the request.
            if settings.DEBUG:
                try:
                    sync_account_transactions(bank_account.id)
                    sync_started = True
                except Exception:
                    pass

    response_serializer = BankAccountSerializer(created_accounts, many=True)
    return Response({
        'accounts': response_serializer.data,
        'sync_started': sync_started,
    }, status=status.HTTP_201_CREATED)

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

    start_date = request.data.get('start_date') or None
    end_date = request.data.get('end_date') or None
    for field, value in (('start_date', start_date), ('end_date', end_date)):
        if value is not None:
            try:
                date.fromisoformat(str(value))
            except (TypeError, ValueError):
                return Response(
                    {'error': f'{field} must be an ISO date (YYYY-MM-DD)'},
                    status=status.HTTP_400_BAD_REQUEST)

    try:
        task = sync_account_transactions.delay(
            account.id, start_date=start_date, end_date=end_date)
        return Response({
            'message': 'Transaction sync started in background',
            'task_id': task.id,
        }, status=status.HTTP_202_ACCEPTED)
    except Exception:
        # Broker down. Inline import is dev-only (see connect_bank_account).
        if not settings.DEBUG:
            return Response(
                {'error': 'Sync queue unavailable, try again later'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            result = sync_account_transactions(
                account.id, start_date=start_date, end_date=end_date)
        except Exception:
            return Response({'error': 'Bank synchronization failed'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({'message': result}, status=status.HTTP_200_OK)
