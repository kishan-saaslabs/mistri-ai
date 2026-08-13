import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  authApi,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from "@/lib/api";
import { queryKeys } from "@/lib/query";

type AuthValue = {
  user: AuthUser | null;
  /** True until the initial `me` check resolves. */
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return (await authApi.me()).user;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const login = useCallback(
    async (input: LoginInput) => {
      const res = await authApi.login(input);
      queryClient.setQueryData(queryKeys.me, res.user);
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const res = await authApi.register(input);
      queryClient.setQueryData(queryKeys.me, res.user);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Best effort — clear the local session even if the call fails.
    } finally {
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      user: me.data ?? null,
      loading: me.isPending,
      login,
      register,
      logout,
    }),
    [me.data, me.isPending, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
