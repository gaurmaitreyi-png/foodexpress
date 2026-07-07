import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X, Send, Plus } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { MenuItem } from "../types";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  dish?: MenuItem | null;
}

const GREETING: ChatMessage = {
  role: "assistant",
  text: "Hi! I'm your menu assistant. Ask me what to order — e.g. \"something spicy\" or \"cheapest veg dish\".",
};

// Floating AI menu assistant. Lives in App (outside <Routes>) so it stays
// mounted — and keeps its history — as the user navigates between pages.
export default function ChatBot() {
  const { isAuthed } = useAuth();
  const { add } = useCart();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Reset the conversation when the user logs out (history is per-account).
  // We keep the assistant available to logged-out visitors too — it just loses
  // the personalized "you previously ordered…" context until they sign in.
  useEffect(() => {
    if (!isAuthed) {
      setMessages([GREETING]);
    }
  }, [isAuthed]);

  // Keep the latest message in view.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  async function send() {
    const question = input.trim();
    if (!question || sending) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setSending(true);
    try {
      const { data } = await api.post("/chat/", { question });
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.response, dish: data.suggested_dish ?? null },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Something went wrong. Please try again." },
      ]);
    } finally {
      setSending(false);
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
                <span className="chat-sub">Powered by AI</span>
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
                placeholder="Ask about menu items..."
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
