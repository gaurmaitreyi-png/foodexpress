"""Seed script: populate demo restaurants and menu items. Run: python seed.py"""
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from api.models import Restaurant, MenuItem  # noqa: E402
User = get_user_model()

DATA = [
    {"name": "Spice Route", "cuisine": "Indian", "rating": "4.6", "delivery_time_mins": 25,
     "image_url": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800",
     "description": "Authentic North Indian curries and tandoor.",
     "menu": [("Butter Chicken", "Creamy tomato gravy", "320.00", "Main", False),
              ("Paneer Tikka", "Char-grilled cottage cheese", "260.00", "Starter", True),
              ("Garlic Naan", "Buttered flatbread", "60.00", "Bread", True)]},
    {"name": "Sushi Zen", "cuisine": "Japanese", "rating": "4.8", "delivery_time_mins": 35,
     "image_url": "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800",
     "description": "Fresh sushi and ramen crafted daily.",
     "menu": [("Salmon Nigiri", "Two pieces, fresh salmon", "240.00", "Sushi", False),
              ("Veg Maki Roll", "Cucumber and avocado", "200.00", "Sushi", True),
              ("Shoyu Ramen", "Soy-based broth", "330.00", "Main", False)]},
    {"name": "Bella Italia", "cuisine": "Italian", "rating": "4.5", "delivery_time_mins": 30,
     "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800",
     "description": "Wood-fired pizzas and handmade pasta.",
     "menu": [("Margherita Pizza", "San Marzano, basil, mozzarella", "380.00", "Pizza", True),
              ("Spaghetti Carbonara", "Egg, pancetta, pecorino", "420.00", "Pasta", False),
              ("Tiramisu", "Classic coffee dessert", "180.00", "Dessert", True)]},
]

Restaurant.objects.all().delete()
owner, _ = User.objects.get_or_create(
    username="demo_owner", defaults={"is_restaurant_owner": True, "email": "owner@foodexpress.dev"})
for r in DATA:
    menu = r.pop("menu")
    rest = Restaurant.objects.create(owner=owner, **r)
    for name, desc, price, cat, veg in menu:
        MenuItem.objects.create(restaurant=rest, name=name, description=desc,
                                price=price, category=cat, is_vegetarian=veg)
    print(f"Seeded {rest.name} with {len(menu)} items")
print("Done.")
