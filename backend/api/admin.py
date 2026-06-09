from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Restaurant, MenuItem, Order, OrderItem


class MenuItemInline(admin.TabularInline):
    model = MenuItem
    extra = 1


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = ["name", "cuisine", "rating", "is_open"]
    inlines = [MenuItemInline]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["id", "customer", "restaurant", "status", "total_price", "created_at"]
    list_filter = ["status"]
    inlines = [OrderItemInline]


admin.site.register(User, UserAdmin)
admin.site.register(MenuItem)
