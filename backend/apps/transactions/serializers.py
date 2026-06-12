from rest_framework import serializers
from .models import Transaction
from apps.categories.models import Category

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'icon', 'color']

class TransactionSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)

    class Meta:
        model = Transaction
        fields = ['id', 'pluggy_transaction_id', 'amount', 'description', 'date', 'category', 'is_processed', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
