import requests
import os
from django.conf import settings

class PluggyService:
    BASE_URL = 'https://api.pluggy.ai'  # Assuming this is the base URL, adjust if needed
    API_KEY = os.environ.get('PLUGGY_API_KEY')

    @staticmethod
    def get_headers():
        return {
            'Authorization': f'Bearer {PluggyService.API_KEY}',
            'Content-Type': 'application/json',
        }

    @staticmethod
    def connect_account(user_id, bank_code, account_number):
        # This is a placeholder for Pluggy's account connection flow
        # In reality, Pluggy might require OAuth or specific flow
        url = f'{PluggyService.BASE_URL}/accounts/connect'
        data = {
            'user_id': user_id,
            'bank_code': bank_code,
            'account_number': account_number,
        }
        response = requests.post(url, json=data, headers=PluggyService.get_headers())
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f'Pluggy API error: {response.text}')

    @staticmethod
    def get_transactions(account_id, start_date, end_date):
        url = f'{PluggyService.BASE_URL}/accounts/{account_id}/transactions'
        params = {
            'start_date': start_date,
            'end_date': end_date,
        }
        response = requests.get(url, params=params, headers=PluggyService.get_headers())
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f'Pluggy API error: {response.text}')
