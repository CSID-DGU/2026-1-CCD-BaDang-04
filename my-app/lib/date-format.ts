const fullDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatFullDate(dateString: string) {
  return fullDateFormatter.format(new Date(dateString));
}

export function formatShortDate(dateString: string) {
  return shortDateFormatter.format(new Date(dateString));
}
