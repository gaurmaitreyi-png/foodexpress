from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RegisterView, RestaurantViewSet, OrderViewSet,
    RestaurantOrderViewSet, OwnerRestaurantViewSet,
)
from .serializers import LoginSerializer
from .chat import ChatView, AssistantOrderView
from .auth_google import GoogleLoginView


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer

router = DefaultRouter()
router.register(r"restaurants", RestaurantViewSet, basename="restaurant")
router.register(r"orders", OrderViewSet, basename="order")
# Restaurant-facing (owner) endpoints:
router.register(r"restaurant-orders", RestaurantOrderViewSet, basename="restaurant-order")
router.register(r"my-restaurants", OwnerRestaurantViewSet, basename="my-restaurant")

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/google/", GoogleLoginView.as_view(), name="google-login"),
    path("chat/", ChatView.as_view(), name="chat"),
    path("assistant/order/", AssistantOrderView.as_view(), name="assistant-order"),
    path("", include(router.urls)),
]
