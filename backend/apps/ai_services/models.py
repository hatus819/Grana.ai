from django.db import models
from django.utils import timezone

class AICache(models.Model):
    key = models.CharField(max_length=255, unique=True)
    value = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['key']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return self.key

    def is_expired(self):
        if not self.expires_at:
            return False
        return timezone.now() >= self.expires_at
