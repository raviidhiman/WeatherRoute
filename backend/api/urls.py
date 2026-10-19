from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.HealthView.as_view()),
    path("geocode/", views.GeocodeView.as_view()),
    path("routes/analyze/", views.AnalyzeView.as_view()),
    path("routes/explain/", views.ExplainView.as_view()),
    path("weather/current/", views.CurrentWeatherView.as_view()),
]
