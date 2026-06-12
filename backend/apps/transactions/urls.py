from django.urls import path
from . import views

app_name = 'transactions'

urlpatterns = [
    path('', views.list_transactions, name='list_transactions'),
    path('<int:transaction_id>/', views.get_transaction, name='get_transaction'),
    path('categorize/', views.categorize_transactions, name='categorize_transactions'),
]
