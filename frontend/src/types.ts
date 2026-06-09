export interface MenuItem {
  id: number;
  restaurant: number;
  name: string;
  description: string;
  price: string;
  image_url: string;
  is_vegetarian: boolean;
  is_available: boolean;
  category: string;
}

export interface Restaurant {
  id: number;
  name: string;
  description: string;
  cuisine: string;
  image_url: string;
  rating: string;
  delivery_time_mins: number;
  is_open: boolean;
  menu_items?: MenuItem[];
}

export interface OrderItem {
  id: number;
  menu_item: number;
  menu_item_name: string;
  quantity: number;
  unit_price: string;
  line_total: number;
}

export interface Order {
  id: number;
  customer_name: string;
  restaurant: number;
  restaurant_name: string;
  status: string;
  delivery_address: string;
  total_price: string;
  items: OrderItem[];
  created_at: string;
}

export interface CartLine {
  item: MenuItem;
  quantity: number;
}
