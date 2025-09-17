from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.authentication.urls')),
    path('api/v1/banking/', include('apps.banking.urls')),
    path('api/v1/transactions/', include('apps.transactions.urls')),
]
