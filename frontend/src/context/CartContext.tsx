import { createContext, useContext, useState, ReactNode } from "react";
import { MenuItem, CartLine } from "../types";

interface CartState {
  lines: CartLine[];
  restaurantId: number | null;
  add: (item: MenuItem) => void;
  remove: (itemId: number) => void;
  clear: () => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartState | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [restaurantId, setRestaurantId] = useState<number | null>(null);

  function add(item: MenuItem) {
    // One restaurant per cart — switching clears the old cart.
    if (restaurantId && restaurantId !== item.restaurant) {
      setLines([{ item, quantity: 1 }]);
      setRestaurantId(item.restaurant);
      return;
    }
    setRestaurantId(item.restaurant);
    setLines((prev) => {
      const found = prev.find((l) => l.item.id === item.id);
      if (found)
        return prev.map((l) =>
          l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      return [...prev, { item, quantity: 1 }];
    });
  }

  function remove(itemId: number) {
    setLines((prev) => {
      const next = prev
        .map((l) =>
          l.item.id === itemId ? { ...l, quantity: l.quantity - 1 } : l
        )
        .filter((l) => l.quantity > 0);
      if (next.length === 0) setRestaurantId(null);
      return next;
    });
  }

  function clear() {
    setLines([]);
    setRestaurantId(null);
  }

  const total = lines.reduce(
    (sum, l) => sum + parseFloat(l.item.price) * l.quantity,
    0
  );
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <CartContext.Provider
      value={{ lines, restaurantId, add, remove, clear, total, count }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
