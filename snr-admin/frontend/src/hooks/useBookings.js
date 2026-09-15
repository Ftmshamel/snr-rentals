import { useState, useEffect, useCallback } from "react";
import { apiGetJson } from "../utils/api.js";

/**
 * @param {string | null} path API path starting with /api
 */
export function useBookings(path) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(null);

  const fetchBookings = useCallback(async (silent = false) => {
    if (!path) {
      setBookings([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiGetJson(path);
      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : "Failed to load");
        setBookings([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [path]);

  const silentRefetch = useCallback(() => fetchBookings(true), [fetchBookings]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  return { bookings, loading, error, refetch: fetchBookings, silentRefetch };
}
