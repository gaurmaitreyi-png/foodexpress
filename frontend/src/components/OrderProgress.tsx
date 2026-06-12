import { Check } from "lucide-react";

interface Props {
  status: string;
}

const STAGES = [
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PREPARING", label: "Preparing" },
  { key: "OUT_FOR_DELIVERY", label: "On the way" },
  { key: "DELIVERED", label: "Delivered" },
];

// Status -> index of last completed stage
const STATUS_INDEX: Record<string, number> = {
  PENDING: -1,
  CONFIRMED: 0,
  PREPARING: 1,
  OUT_FOR_DELIVERY: 2,
  DELIVERED: 3,
};

/**
 * Horizontal 4-stage progress tracker for an order.
 * Cancelled orders skip the tracker entirely (parent decides what to show).
 */
export default function OrderProgress({ status }: Props) {
  if (status === "CANCELLED") return null;
  const currentIndex = STATUS_INDEX[status] ?? -1;

  return (
    <div className="progress-track">
      {STAGES.map((stage, i) => {
        const done = i <= currentIndex;
        const active = i === currentIndex;
        return (
          <div key={stage.key} className={`stage ${done ? "done" : ""} ${active ? "active" : ""}`}>
            <div className="stage-dot">
              {done ? <Check size={12} strokeWidth={3} /> : <span>{i + 1}</span>}
            </div>
            <span className="stage-label">{stage.label}</span>
            {i < STAGES.length - 1 && <div className="stage-line" />}
          </div>
        );
      })}
    </div>
  );
}
