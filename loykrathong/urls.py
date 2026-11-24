from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from pond import views
from django.contrib import admin

urlpatterns = [
    path('', views.index, name='index'),
    path('lanterns/', views.index, {'kind': 'lantern'}, name='lanterns'),
    path('admin/', admin.site.urls),
    path('wish/<uuid:pk>/', views.shared_wish, name='shared-wish'),
    path('wish/<uuid:pk>/card.png', views.wish_card, name='wish-card'),
    path('couple/<str:token>/', views.couple, name='couple'),
    path('api/couples/<str:token>/', views.couple_detail, name='couple-detail'),
    path('api/couples/<str:token>/join/', views.couple_join, name='couple-join'),
    path('api/couples/<str:token>/ready/', views.couple_ready, name='couple-ready'),
    path('api/krathongs/', views.krathongs, name='krathongs'),
    path('api/krathongs/<uuid:pk>/', views.krathong_detail, name='krathong-detail'),
    path('api/lanterns/', views.krathongs, {'kind': 'lantern'}, name='lantern-feed'),
    path('api/lanterns/<uuid:pk>/', views.krathong_detail, {'kind': 'lantern'}, name='lantern-detail'),
]
if settings.MEDIA_IN_DATABASE:
    urlpatterns.append(path(f'{settings.MEDIA_URL.strip("/")}/<path:name>', views.stored_media, name='stored-media'))
elif settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
