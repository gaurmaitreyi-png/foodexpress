from rest_framework import viewsets, generics, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Restaurant, MenuItem, Order
from .serializers import (
    RegisterSerializer, RestaurantSerializer, RestaurantListSerializer,
    MenuItemSerializer, OrderSerializer,
)

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class RestaurantViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/restaurants/  and  GET /api/restaurants/{id}/"""
    queryset = Restaurant.objects.prefetch_related("menu_items").all()
    permission_classes = [permissions.AllowAny]

    def get_serializer_class(self):
        if self.action == "list":
            return RestaurantListSerializer
        return RestaurantSerializer

    @action(detail=True, methods=["get"])
    def menu(self, request, pk=None):
        items = MenuItem.objects.filter(restaurant_id=pk, is_available=True)
        return Response(MenuItemSerializer(items, many=True).data)


class OrderViewSet(viewsets.ModelViewSet):
    """Authenticated CRUD for the current user's orders."""
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Order.objects.filter(customer=self.request.user)
            .select_related("restaurant", "customer")
            .prefetch_related("items__menu_item")
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status in [Order.Status.DELIVERED, Order.Status.CANCELLED]:
            return Response(
                {"detail": "Cannot cancel this order."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = Order.Status.CANCELLED
        order.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(order).data)
