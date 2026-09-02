/** "당일 정규장 등락" if the feed's trading date is today, else "전 거래일 정규장 등락". */
export function sessionChangeLabel(feedDateIso: string | null): string {
  if (!feedDateIso) return '';
  const today = new Date();
  const feedDate = new Date(`${feedDateIso}T00:00:00`);
  const isToday =
    today.getFullYear() === feedDate.getFullYear() &&
    today.getMonth() === feedDate.getMonth() &&
    today.getDate() === feedDate.getDate();
  return isToday ? '당일 정규장 등락 기준' : '전 거래일 정규장 등락 기준';
}
