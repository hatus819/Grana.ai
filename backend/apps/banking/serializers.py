from rest_framework import serializers
from .models import BankAccount

class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ['id', 'pluggy_account_id', 'bank_name', 'account_type', 'balance', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class ConnectBankAccountSerializer(serializers.Serializer):
    itemId = serializers.CharField(max_length=100)
