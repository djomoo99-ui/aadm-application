export async function privateMutation<T>(url: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(payload?.message ?? "L’action n’a pas pu être enregistrée.");
  return payload as T;
}
