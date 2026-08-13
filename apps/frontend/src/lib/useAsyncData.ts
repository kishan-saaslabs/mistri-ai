import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/**
 * Runs an async loader on mount (and whenever `deps` change) and exposes
 * loading/error state plus a `refetch`. Guards against setting state after
 * unmount or after a stale request resolves.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList,
) {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const run = useCallback(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    loader()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (active)
          setState({
            data: null,
            loading: false,
            error:
              err instanceof ApiError
                ? err.message
                : "Something went wrong. Please try again.",
          });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);

  const refetch = useCallback(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch };
}
