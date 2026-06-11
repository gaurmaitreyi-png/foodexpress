import { Star, StarHalf } from "lucide-react";

interface Props {
  value: string | number;
  size?: number;
  showNumber?: boolean;
}

/**
 * Visual 5-star rating. Renders full stars, a half star if applicable,
 * and empty stars to fill out to 5. Optionally shows the numeric value.
 */
export default function StarRating({ value, size = 14, showNumber = true }: Props) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  const full = Math.floor(num);
  const hasHalf = num - full >= 0.25 && num - full < 0.75;
  const fullStars = num - full >= 0.75 ? full + 1 : full;
  const total = 5;

  return (
    <span className="stars" aria-label={`${num} out of 5 stars`}>
      {Array.from({ length: fullStars }).map((_, i) => (
        <Star key={`f${i}`} size={size} fill="currentColor" strokeWidth={0} />
      ))}
      {hasHalf && <StarHalf size={size} fill="currentColor" strokeWidth={0} />}
      {Array.from({ length: total - fullStars - (hasHalf ? 1 : 0) }).map((_, i) => (
        <Star key={`e${i}`} size={size} className="star-empty" />
      ))}
      {showNumber && <span className="stars-num">{num.toFixed(1)}</span>}
    </span>
  );
}
