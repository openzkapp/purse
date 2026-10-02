export function formatRelativeTime(timestampMs: number): string {
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestampMs) / 1000));

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatCountdown(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return "00:00";
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const mm = mins.toString().padStart(2, "0");
  const ss = secs.toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatShortDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
