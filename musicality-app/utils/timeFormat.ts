/**
 * Time formatting utilities for messages.
 * Korean-style relative time ("방금", "3분 전", "어제").
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** "방금" / "3분 전" / "2시간 전" / "어제" / "3일 전" / "3월 5일" */
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr);
  const diff = now - date.getTime();

  if (diff < MINUTE) return '방금';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;
  if (diff < 2 * DAY) return '어제';
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}일 전`;

  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}월 ${d}일`;
}

/** "오후 3:42" */
export function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const h = date.getHours();
  const m = date.getMinutes();
  const period = h < 12 ? '오전' : '오후';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${hour12}:${m.toString().padStart(2, '0')}`;
}

/** "2026년 3월 13일 (목)" */
export function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const day = DAY_NAMES[date.getDay()];
  return `${y}년 ${m}월 ${d}일 (${day})`;
}

/** Check if two date strings are on the same calendar day */
export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
