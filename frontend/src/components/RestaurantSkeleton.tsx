/**
 * Placeholder card shown while restaurants are loading.
 * Matches the shape of the real card so the layout doesn't jump
 * when data arrives.
 */
export default function RestaurantSkeleton() {
  return (
    <div className="card skeleton-card">
      <div className="skel skel-img" />
      <div className="card-body">
        <div className="skel skel-title" />
        <div className="skel-meta">
          <div className="skel skel-pill" />
          <div className="skel skel-pill" />
          <div className="skel skel-pill" />
        </div>
      </div>
    </div>
  );
}
