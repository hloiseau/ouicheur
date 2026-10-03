"use client";
import { useEffect, useRef, useState } from "react";
import type { WishlistPage, WishlistQuery } from "../lib/wishlist-query";
import { ApiError } from "./ui";

async function readPage(query: WishlistQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== null) params.set(key, String(value));
  const response = await fetch(`/api/wishes?${params}`, {
    cache: "no-store",
    signal,
  });
  const value = await response.json();
  if (!response.ok) throw new ApiError(value.error, response.status);
  return value as WishlistPage;
}

export function useWishlistPage(
  initial: WishlistPage | undefined,
  query: WishlistQuery,
) {
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0),
    first = useRef(true);
  const key = JSON.stringify(query);
  useEffect(() => {
    const current = ++generation.current;
    if (!initial) return;
    if (first.current) {
      first.current = false;
      setPage(initial);
      return;
    }
    const controller = new AbortController();
    setPage((p) => p && { ...p, items: [], total: 0, next: null });
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      readPage(JSON.parse(key), controller.signal)
        .then((value) => {
          if (current === generation.current) setPage(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted && current === generation.current)
            setError(e.message);
        })
        .finally(() => {
          if (current === generation.current) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [initial, key]);
  const more = async () => {
    if (loading || !page?.next) return;
    const current = generation.current;
    setLoading(true);
    setError("");
    try {
      const value = await readPage({ ...query, cursor: page.next });
      if (current === generation.current)
        setPage((p) => ({
          ...value,
          items: [...(p?.items || []), ...value.items],
        }));
    } catch (e) {
      if (current !== generation.current) return;
      setError((e as Error).message);
      setPage((p) => p && { ...p, items: [], total: 0, next: null });
      if (e instanceof ApiError && e.status === 409) {
        try {
          const value = await readPage(query);
          if (current === generation.current) setPage(value);
        } catch (retry) {
          if (current === generation.current)
            setError((retry as Error).message);
        }
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };
  return { page, loading, error, more };
}
