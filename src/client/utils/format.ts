export function formatEuros(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function formatMonth(date: string) {
  const value = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(`${date}T12:00:00Z`),
  );
  return value.charAt(0).toUpperCase() + value.slice(1);
}

