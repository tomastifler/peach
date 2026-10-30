/** Personal ratings are stored as 0-100 and shown as five stars; 0 means the rating is cleared. */
export const RATING_STEP = 20;
export const clampRating = (value: number | null | undefined) => Math.min(Math.max(value || 0, 0), 100);
export const ratingStars = (value: number | null | undefined) => Math.round(clampRating(value) / RATING_STEP);
export const ratingText = (value: number | null | undefined) => {
  const stars = ratingStars(value);
  return stars ? `${stars} stars` : 'Not rated';
};
export const nextRating = (before: number | null | undefined, star: number) =>
  star === ratingStars(before) ? 0 : star * RATING_STEP;
