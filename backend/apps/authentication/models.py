from django.contrib.auth.models import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    phone = models.CharField(max_length=15, blank=True)
    cpf = models.CharField(max_length=14, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
