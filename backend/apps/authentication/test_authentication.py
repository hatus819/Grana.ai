
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from freezegun import freeze_time
from datetime import timedelta

User = get_user_model()

class AuthenticationTests(APITestCase):
    def setUp(self):
        self.register_url = reverse('authentication:register')
        self.login_url = reverse('authentication:login')
        self.refresh_url = reverse('authentication:refresh')

        self.user_data = {
            'email': 'test@example.com',
            'password': 'password123',
            'password_confirm': 'password123',
            'phone': '123456789',
            'cpf': '123.456.789-00'
        }

    def _create_user(self, is_active=True):
        user = User.objects.create_user(
            email=self.user_data['email'],
            password=self.user_data['password'],
            phone=self.user_data['phone'],
            cpf=self.user_data['cpf']
        )
        if not is_active:
            user.is_active = False
            user.save()
        return user

    def test_user_registration_success(self):
        """
        Ensure a new user can be created successfully.
        """
        response = self.client.post(self.register_url, self.user_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        self.assertIn('tokens', response.data)
        self.assertNotIn('password', response.data['user'])
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(User.objects.get().email, 'test@example.com')

    def test_user_registration_password_mismatch(self):
        """
        Ensure user registration fails with mismatching passwords.
        """
        data = self.user_data.copy()
        data['password_confirm'] = 'wrongpassword'
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password_confirm', response.data)

    def test_user_registration_existing_email(self):
        """
        Ensure user registration fails if the email already exists.
        """
        self._create_user()
        response = self.client.post(self.register_url, self.user_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_user_registration_invalid_email(self):
        """
        Ensure user registration fails with an invalid email format.
        """
        data = self.user_data.copy()
        data['email'] = 'not-an-email'
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_user_registration_short_password(self):
        """
        Ensure user registration fails with a password that is too short.
        """
        data = self.user_data.copy()
        data['password'] = '123'
        data['password_confirm'] = '123'
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_user_registration_empty_email(self):
        """
        Ensure user registration fails with an empty email.
        """
        data = self.user_data.copy()
        data['email'] = ''
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_user_registration_empty_password(self):
        """
        Ensure user registration fails with an empty password.
        """
        data = self.user_data.copy()
        data['password'] = ''
        data['password_confirm'] = ''
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_user_login_success(self):
        """
        Ensure a registered user can log in successfully.
        """
        self._create_user()
        login_data = {'email': self.user_data['email'], 'password': self.user_data['password']}
        response = self.client.post(self.login_url, login_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('user', response.data)
        self.assertIn('tokens', response.data)
        self.assertIn('access', response.data['tokens'])
        self.assertIn('refresh', response.data['tokens'])

    def test_user_login_inactive_user(self):
        """
        Ensure an inactive user cannot log in.
        """
        self._create_user(is_active=False)
        login_data = {'email': self.user_data['email'], 'password': self.user_data['password']}
        response = self.client.post(self.login_url, login_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_login_case_insensitive_email(self):
        """
        Ensure user can log in with a case-insensitive email.
        """
        self._create_user()
        login_data = {'email': self.user_data['email'].upper(), 'password': self.user_data['password']}
        response = self.client.post(self.login_url, login_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_user_login_invalid_credentials(self):
        """
        Ensure login fails with invalid credentials.
        """
        self._create_user()
        login_data = {'email': self.user_data['email'], 'password': 'wrongpassword'}
        response = self.client.post(self.login_url, login_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_login_non_existent_user(self):
        """
        Ensure login fails for a non-existent user.
        """
        login_data = {'email': 'nouser@example.com', 'password': 'password123'}
        response = self.client.post(self.login_url, login_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_token_refresh_success(self):
        """
        Ensure access token can be refreshed using a valid refresh token.
        """
        self._create_user()
        login_data = {'email': self.user_data['email'], 'password': self.user_data['password']}
        login_response = self.client.post(self.login_url, login_data, format='json')
        refresh_token = login_response.data['tokens']['refresh']
        
        response = self.client.post(self.refresh_url, {'refresh': refresh_token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    def test_token_refresh_invalid_token(self):
        """
        Ensure token refresh fails with an invalid refresh token.
        """
        response = self.client.post(self.refresh_url, {'refresh': 'invalidtoken'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @freeze_time("2025-09-18 12:00:00")
    def test_expired_access_token(self):
        """
        Ensure an expired access token is not valid.
        """
        self._create_user()
        login_data = {'email': self.user_data['email'], 'password': self.user_data['password']}
        login_response = self.client.post(self.login_url, login_data, format='json')
        access_token = login_response.data['tokens']['access']

        # Mock a protected view
        protected_url = reverse('authentication:protected_view') # Assuming you have a protected view
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + access_token)

        with freeze_time("2025-09-18 12:16:00"): # 16 minutes later
            response = self.client.get(protected_url)
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @freeze_time("2025-09-18")
    def test_expired_refresh_token(self):
        """
        Ensure an expired refresh token cannot be used.
        """
        self._create_user()
        login_data = {'email': self.user_data['email'], 'password': self.user_data['password']}
        login_response = self.client.post(self.login_url, login_data, format='json')
        refresh_token = login_response.data['tokens']['refresh']

        with freeze_time("2025-09-26"): # 8 days later
            response = self.client.post(self.refresh_url, {'refresh': refresh_token}, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
