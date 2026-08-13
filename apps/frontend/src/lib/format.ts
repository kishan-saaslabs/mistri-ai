export function formatDuration(totalSeconds: number) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

export const statusHex: Record<string, string> = {
  success: "#2F9E44",
  warning: "#D9822B",
  danger: "#E03131",
  neutral: "#D4D4D4",
};
