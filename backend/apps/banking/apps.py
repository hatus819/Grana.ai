from django.apps import AppConfig

class BankingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.banking'

    def ready(self):
        import apps.banking.models  # noqa

    def ready(self):
        import apps.banking.models  # noqa

    def ready(self):
        import apps.banking.models  # noqa

    def ready(self):
        import apps.banking.models  # noqa

    def ready(self):
        import apps.banking.models  # noqa
