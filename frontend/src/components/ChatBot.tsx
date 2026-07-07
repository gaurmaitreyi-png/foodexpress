import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X, Send, Plus, ShoppingBag } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { payForOrder } from "../lib/payment";
import { MenuItem } from "../types";

interface ProposalItem {
  menu_item: number;
  name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}
interface Proposal {
  restaurant_id: number;
  restaurant_name: string;
  items: ProposalItem[];
  total: string;
  reasoning: string;
  delivery_address: string;
}
interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  dish?: MenuItem | null;
  proposal?: Proposal | null;
  placed?: boolean;
}

const GREETING: ChatMessage = {
  role: "assistant",
  text:
    "Hi! I'm your menu assistant. Ask me what to order — e.g. \"something spicy\" — " +
    "or say \"order me a cheap veg dish\" and I'll place & pay for it right here.",
};

// Command-style phrasing that means "actually place an order" (vs. just asking
// for a recommendation like "what should I order?").
const ORDER_INTENT =
  /\b(order me|place (an |my )?order|i want to order|i'?d like to order|buy me|get me|order this|order it|order us)\b/i;

// Floating AI menu assistant. Lives in App (outside <Routes>) so it stays
// mounted — and keeps its history — as the user navigates between pages.
export default function ChatBot() {
  const { isAuthed, username } = useAuth();
  const { add } = useCart();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [orderAddress, setOrderAddress] = useState("");
  const [confirming, setConfirming] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Reset the conversation when the user logs out (history is per-account).
  // We keep the assistant available to logged-out visitors too — it just loses
  // personalization and can't place orders until they sign in.
  useEffect(() => {
    if (!isAuthed) setMessages([GREETING]);
  }, [isAuthed]);

  // Keep the latest message in view.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open, confirming]);

  function say(msg: ChatMessage) {
    setMessages((m) => [...m, msg]);
  }

  async function send() {
    const question = input.trim();
    if (!question || sending) return;
    say({ role: "user", text: question });
    setInput("");
    setSending(true);

    try {
      if (ORDER_INTENT.test(question)) {
        if (!isAuthed) {
          say({
            role: "assistant",
            text: "Please sign in first and I'll place the order for you. I can still recommend dishes in the meantime!",
          });
          return;
        }
        // Ask the backend to assemble a concrete, priced order proposal.
        const { data } = await api.post("/assistant/order/", { request: question });
        if (data.success) {
          setOrderAddress(data.proposal.delivery_address || "");
          say({
            role: "assistant",
            text: data.proposal.reasoning || "Here's an order I put together:",
            proposal: data.proposal,
          });
        } else {
          say({ role: "assistant", text: data.message || "I couldn't build an order. Try rephrasing." });
        }
        return;
      }

      // Otherwise: normal recommendation.
      const { data } = await api.post("/chat/", { question });
      say({ role: "assistant", text: data.response, dish: data.suggested_dish ?? null });
    } catch {
      say({ role: "assistant", text: "Something went wrong. Please try again." });
    } finally {
      setSending(false);
    }
  }

  async function confirmOrder(proposal: Proposal, index: number) {
    if (!orderAddress.trim()) {
      toast.error("Add a delivery address first");
      return;
    }
    setConfirming(true);
    try {
      const { data: order } = await api.post("/orders/", {
        restaurant: proposal.restaurant_id,
        delivery_address: orderAddress,
        items: proposal.items.map((i) => ({ menu_item: i.menu_item, quantity: i.quantity })),
      });
      await payForOrder(order.id, { name: username ?? undefined });
      // Mark this proposal as placed so its buttons disappear.
      setMessages((m) => m.map((msg, idx) => (idx === index ? { ...msg, placed: true } : msg)));
      say({
        role: "assistant",
        text: `✅ Done! Order #${order.id} placed and paid — ₹${proposal.total}. It's on the way to ${orderAddress}.`,
      });
      toast.success(`Order #${order.id} placed & paid`);
    } catch (err: any) {
      if (err?.message === "Payment cancelled") {
        say({ role: "assistant", text: "No worries — I cancelled the payment. Your order wasn't charged." });
      } else {
        say({ role: "assistant", text: "Sorry, I couldn't complete that order. Please try again." });
      }
    } finally {
      setConfirming(false);
    }
  }

  function addDish(dish: MenuItem) {
    add(dish);
    toast.success(`${dish.name} added`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") send();
  }

  return (
    <>
      <button
        className="chat-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu assistant" : "Open menu assistant"}
        aria-expanded={open}
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="chat-panel"
            role="dialog"
            aria-label="Menu assistant"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="chat-head">
              <div>
                <strong>Menu Assistant</strong>
                <span className="chat-sub">Recommends · orders · pays</span>
              </div>
              <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="chat-log" ref={logRef}>
              {messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>
                  <div className="chat-bubble">{m.text}</div>

                  {m.dish && (
                    <button className="chat-add" onClick={() => addDish(m.dish!)}>
                      <Plus size={14} /> Add {m.dish.name} · ₹{m.dish.price}
                    </button>
                  )}

                  {m.proposal && (
                    <div className="chat-order">
                      <div className="chat-order-rest">{m.proposal.restaurant_name}</div>
                      <ul className="chat-order-items">
                        {m.proposal.items.map((it) => (
                          <li key={it.menu_item}>
                            <span>{it.quantity}× {it.name}</span>
                            <span>₹{it.line_total}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="chat-order-total">
                        <span>Total</span><span>₹{m.proposal.total}</span>
                      </div>

                      {m.placed ? (
                        <div className="chat-order-done">✅ Ordered & paid</div>
                      ) : i === messages.length - 1 ? (
                        <>
                          <input
                            className="chat-order-addr"
                            value={orderAddress}
                            onChange={(e) => setOrderAddress(e.target.value)}
                            placeholder="Delivery address"
                            aria-label="Delivery address"
                          />
                          <button
                            className="chat-order-pay"
                            onClick={() => confirmOrder(m.proposal!, i)}
                            disabled={confirming}
                          >
                            <ShoppingBag size={15} />
                            {confirming ? "Processing…" : `Confirm & Pay ₹${m.proposal.total}`}
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="chat-msg assistant">
                  <div className="chat-bubble chat-typing">
                    <span /><span /><span />
                  </div>
                </div>
              )}
            </div>

            <div className="chat-input-row">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask, or say 'order me…'"
                aria-label="Ask about menu items"
                disabled={sending}
              />
              <button
                className="chat-send"
                onClick={send}
                disabled={sending || !input.trim()}
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
