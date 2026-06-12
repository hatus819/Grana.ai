from django.db import models

class Category(models.Model):
    name = models.CharField(max_length=50, unique=True)
    icon = models.CharField(max_length=50, default='default')
    color = models.CharField(max_length=7, default='#000000')  # Hex color
    keywords = models.JSONField(default=list, help_text="List of keywords for auto-categorization")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
