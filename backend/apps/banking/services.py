import requests
import os
from django.conf import settings

class PluggyService:
    BASE_URL = 'https://api.pluggy.ai'
    API_KEY = os.environ.get('PLUGGY_API_KEY')

    @staticmethod
    def get_headers():
        return {
            'X-API-KEY': PluggyService.API_KEY,
            'Content-Type': 'application/json',
        }

    @staticmethod
    def get_accounts(item_id):
        url = f'{PluggyService.BASE_URL}/accounts'
        params = {'itemId': item_id}
        response = requests.get(url, params=params, headers=PluggyService.get_headers())
        response.raise_for_status()
        return response.json()

    @staticmethod
    def get_transactions(account_id, from_date, to_date):
        url = f'{PluggyService.BASE_URL}/transactions'
        params = {
            'accountId': account_id,
            'from': from_date,
            'to': to_date,
        }
        response = requests.get(url, params=params, headers=PluggyService.get_headers())
        response.raise_for_status()
        return response.json()
