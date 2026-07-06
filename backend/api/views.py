from rest_framework import viewsets, generics, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Restaurant, MenuItem, Order
from . import payments
from .serializers import (
    RegisterSerializer, RestaurantSerializer, RestaurantListSerializer,
    MenuItemSerializer, OrderSerializer,
)

User = get_user_model()


class IsRestaurantOwner(permissions.BasePermission):
    """Gate the restaurant-facing endpoints to accounts flagged as owners."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_restaurant_owner
        )


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
    """Authenticated CRUD for the current user's orders, plus payment actions."""
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

    # --- Payments (Razorpay) ---

    @action(detail=True, methods=["post"])
    def create_payment(self, request, pk=None):
        """Create a Razorpay order for this food order. The frontend feeds the
        returned data into the Razorpay checkout widget."""
        order = self.get_object()
        if order.payment_status == Order.PaymentStatus.PAID:
            return Response({"detail": "Order already paid."},
                            status=status.HTTP_400_BAD_REQUEST)
        rp = payments.create_order(order.total_price, receipt=f"order_{order.id}")
        order.razorpay_order_id = rp["id"]
        order.save(update_fields=["razorpay_order_id", "updated_at"])
        return Response({
            "order_id": order.id,
            "razorpay_order_id": rp["id"],
            "amount": rp["amount"],
            "currency": payments.CURRENCY,
            "key_id": payments.RAZORPAY_KEY_ID,
            "simulated": rp["simulated"],
        })

    @action(detail=True, methods=["post"])
    def verify_payment(self, request, pk=None):
        """Verify the checkout signature and mark the order paid + confirmed."""
        order = self.get_object()
        rp_order = request.data.get("razorpay_order_id") or order.razorpay_order_id
        rp_payment = request.data.get("razorpay_payment_id", "")
        signature = request.data.get("razorpay_signature", "")
        if payments.verify_signature(rp_order, rp_payment, signature):
            order.payment_status = Order.PaymentStatus.PAID
            order.razorpay_payment_id = rp_payment
            if order.status == Order.Status.PENDING:
                order.status = Order.Status.CONFIRMED
            order.save()
            return Response(self.get_serializer(order).data)
        order.payment_status = Order.PaymentStatus.FAILED
        order.save(update_fields=["payment_status", "updated_at"])
        return Response({"detail": "Payment verification failed."},
                        status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def simulate_payment(self, request, pk=None):
        """Test-mode only: mark an order paid without the interactive checkout.

        This is what the MCP server / any headless client calls to complete a
        payment end-to-end. Disabled when PAYMENTS_TEST_MODE=False."""
        if not payments.PAYMENTS_TEST_MODE:
            return Response({"detail": "Simulated payments are disabled."},
                            status=status.HTTP_403_FORBIDDEN)
        order = self.get_object()
        if not order.razorpay_order_id:
            rp = payments.create_order(order.total_price, receipt=f"order_{order.id}")
            order.razorpay_order_id = rp["id"]
        order.payment_status = Order.PaymentStatus.PAID
        order.razorpay_payment_id = f"pay_sim_{order.id}"
        if order.status == Order.Status.PENDING:
            order.status = Order.Status.CONFIRMED
        order.save()
        return Response(self.get_serializer(order).data)


class RestaurantOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """Restaurant-facing order queue. Scoped to orders for the owner's
    restaurants. Read + a status-advance action (accept / prepare / deliver)."""
    serializer_class = OrderSerializer
    permission_classes = [IsRestaurantOwner]

    def get_queryset(self):
        return (
            Order.objects.filter(restaurant__owner=self.request.user)
            .select_related("restaurant", "customer")
            .prefetch_related("items__menu_item")
        )

    @action(detail=True, methods=["post"])
    def set_status(self, request, pk=None):
        order = self.get_object()
        new_status = request.data.get("status")
        allowed = {
            Order.Status.CONFIRMED, Order.Status.PREPARING,
            Order.Status.OUT_FOR_DELIVERY, Order.Status.DELIVERED,
            Order.Status.CANCELLED,
        }
        if new_status not in allowed:
            return Response({"detail": "Invalid status."},
                            status=status.HTTP_400_BAD_REQUEST)
        order.status = new_status
        order.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(order).data)


class OwnerRestaurantViewSet(viewsets.ModelViewSet):
    """Owner's own restaurants — used by the restaurant app to show the storefront
    and toggle open/closed. CRUD is scoped to the authenticated owner."""
    serializer_class = RestaurantSerializer
    permission_classes = [IsRestaurantOwner]

    def get_queryset(self):
        return (
            Restaurant.objects.filter(owner=self.request.user)
            .prefetch_related("menu_items")
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
