from django.urls import path
from . import views

app_name = 'banking'

urlpatterns = [
    path('accounts/', views.list_bank_accounts, name='list_bank_accounts'),
    path('accounts/connect/', views.connect_bank_account, name='connect_bank_account'),
    path('accounts/<int:account_id>/disconnect/', views.disconnect_bank_account, name='disconnect_bank_account'),
    path('accounts/<int:account_id>/transactions/fetch/', views.fetch_transactions, name='fetch_transactions'),
]
