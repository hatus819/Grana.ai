import os

import requests
from django.core.cache import cache


class PluggyError(Exception):
    """Raised when Pluggy is misconfigured or rejects a request."""


class PluggyService:
    BASE_URL = 'https://api.pluggy.ai'
    API_KEY_CACHE_KEY = 'pluggy_api_key'
    # Pluggy API keys live for 2 hours; refresh a little early.
    API_KEY_CACHE_TTL = 100 * 60
    REQUEST_TIMEOUT = 30

    @staticmethod
    def _credentials():
        client_id = os.environ.get('PLUGGY_CLIENT_ID')
        client_secret = os.environ.get('PLUGGY_CLIENT_SECRET')
        if not client_id or not client_secret:
            raise PluggyError(
                'PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET must be configured')
        return client_id, client_secret

    @staticmethod
    def get_api_key(force_refresh=False):
        if not force_refresh:
            try:
                cached = cache.get(PluggyService.API_KEY_CACHE_KEY)
            except Exception:
                cached = None
            if cached:
                return cached

        client_id, client_secret = PluggyService._credentials()
        response = requests.post(
            f'{PluggyService.BASE_URL}/auth',
            json={'clientId': client_id, 'clientSecret': client_secret},
            timeout=PluggyService.REQUEST_TIMEOUT,
        )
        if response.status_code != 200:
            raise PluggyError(f'Pluggy auth failed: HTTP {response.status_code}')
        api_key = response.json()['apiKey']
        try:
            cache.set(PluggyService.API_KEY_CACHE_KEY, api_key,
                      timeout=PluggyService.API_KEY_CACHE_TTL)
        except Exception:
            pass
        return api_key

    @staticmethod
    def _request(method, path, params=None, json=None):
        api_key = PluggyService.get_api_key()
        response = requests.request(
            method, f'{PluggyService.BASE_URL}{path}',
            params=params, json=json,
            headers={'X-API-KEY': api_key},
            timeout=PluggyService.REQUEST_TIMEOUT,
        )
        if response.status_code in (401, 403):
            api_key = PluggyService.get_api_key(force_refresh=True)
            response = requests.request(
                method, f'{PluggyService.BASE_URL}{path}',
                params=params, json=json,
                headers={'X-API-KEY': api_key},
                timeout=PluggyService.REQUEST_TIMEOUT,
            )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def create_connect_token(client_user_id):
        """Mint a 30-minute token for the Pluggy Connect widget, bound to
        our user id so resulting items can be ownership-checked."""
        data = PluggyService._request(
            'POST', '/connect_token',
            json={'options': {'clientUserId': str(client_user_id)}})
        return data['accessToken']

    @staticmethod
    def get_item(item_id):
        return PluggyService._request('GET', f'/items/{item_id}')

    @staticmethod
    def get_accounts(item_id):
        return PluggyService._request('GET', '/accounts', params={'itemId': item_id})

    @staticmethod
    def get_transactions(account_id, from_date, to_date):
        """Return every transaction in the range, following pagination."""
        rows = []
        page = 1
        while True:
            data = PluggyService._request('GET', '/transactions', params={
                'accountId': account_id,
                'from': from_date,
                'to': to_date,
                'pageSize': 500,
                'page': page,
            })
            rows.extend(data.get('results', []))
            if page >= data.get('totalPages', 1):
                return rows
            page += 1
