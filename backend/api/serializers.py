from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from .models import Restaurant, MenuItem, Order, OrderItem

User = get_user_model()


class LoginSerializer(TokenObtainPairSerializer):
    """Adds the account type + username to the token response so the customer
    and restaurant apps can route the user correctly after login."""
    def validate(self, attrs):
        data = super().validate(attrs)
        data["username"] = self.user.username
        data["is_restaurant_owner"] = self.user.is_restaurant_owner
        return data


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "phone", "address"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = [
            "id", "restaurant", "name", "description", "price",
            "image_url", "is_vegetarian", "is_available", "category",
        ]


class RestaurantSerializer(serializers.ModelSerializer):
    menu_items = MenuItemSerializer(many=True, read_only=True)

    class Meta:
        model = Restaurant
        fields = [
            "id", "name", "description", "cuisine", "image_url",
            "rating", "delivery_time_mins", "is_open", "menu_items",
        ]


class RestaurantListSerializer(serializers.ModelSerializer):
    """Lighter serializer for the list view — no nested menu."""
    class Meta:
        model = Restaurant
        fields = [
            "id", "name", "description", "cuisine", "image_url",
            "rating", "delivery_time_mins", "is_open",
        ]


class OrderItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(source="menu_item.name", read_only=True)
    line_total = serializers.ReadOnlyField()

    class Meta:
        model = OrderItem
        fields = ["id", "menu_item", "menu_item_name", "quantity", "unit_price", "line_total"]
        read_only_fields = ["unit_price"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    customer_name = serializers.CharField(source="customer.username", read_only=True)
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "customer", "customer_name", "restaurant", "restaurant_name",
            "status", "delivery_address", "total_price", "items", "created_at",
            "payment_status", "razorpay_order_id",
        ]
        read_only_fields = [
            "customer", "total_price", "status",
            "payment_status", "razorpay_order_id",
        ]

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        order = Order.objects.create(
            customer=self.context["request"].user, **validated_data
        )
        for item_data in items_data:
            OrderItem.objects.create(order=order, **item_data)
        order.recalculate_total()
        return order
