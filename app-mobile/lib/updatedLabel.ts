/** A feed older than this is worth calling out - the collector runs every weekday. */
const STALE_AFTER_DAYS = 3;

/**
 * The collector writes updatedAt already formatted as "2026-09-03 15:33 KST",
 * so the label is that timestamp verbatim. An absolute time is the honest
 * thing to show here: the reader needs to know which session the numbers come
 * from, which "어제" alone doesn't tell them.
 */
export function updatedLabel(updatedAt: string | null): string {
  if (!updatedAt) return '';
  return `${updatedAt} 업데이트`;
}

/** True once the snapshot is old enough that the reader should be told. */
export function isStale(updatedAt: string | null, now: Date = new Date()): boolean {
  const match = updatedAt?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  const [, year, month, day] = match;
  const updated = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (today.getTime() - updated.getTime()) / 86_400_000 >= STALE_AFTER_DAYS;
}
