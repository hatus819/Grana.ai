from django.db import models
from apps.authentication.models import CustomUser

class BankAccount(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    pluggy_account_id = models.CharField(max_length=100, unique=True)
    bank_name = models.CharField(max_length=100)
    account_type = models.CharField(max_length=50)
    balance = models.DecimalField(max_digits=12, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'pluggy_account_id')

    def __str__(self):
        return f"{self.user.username} - {self.bank_name} - {self.account_type}"
