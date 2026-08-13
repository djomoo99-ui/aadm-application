import { useCallback, useEffect, useState } from "react";

export function usePrivateApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Impossible de charger les informations.");
      }
      setData((await response.json()) as T);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

