/**
 * [停用预留 · d5e3fac7 问②B 裁决] 零消费工具, 保留不删 (2026-10-04 复核仍零消费,
 * 全仓唯一提及是死件注释)。勿为「消灭未用导出」顺手删 — 裁决口径为预留。
 */
import { useCallback, useEffect, useRef, useState, type DependencyList, type Dispatch, type SetStateAction } from "react";

export interface UseAsyncResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
  setData: Dispatch<SetStateAction<T | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

export interface UseAsyncOptions {
  immediate?: boolean;
}

/**
 * 异步取数三件套: { data, error, loading, refetch }。
 * deps 变化时重新拉取; 结果过期后不再写入 state。
 */
export function useAsync<T>(
  run: () => Promise<T>,
  deps: DependencyList,
  options: UseAsyncOptions = {},
): UseAsyncResult<T> {
  const { immediate = true } = options;
  const runRef = useRef(run);
  runRef.current = run;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(immediate);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await runRef.current();
      if (aliveRef.current) setData(next);
    } catch (e) {
      if (aliveRef.current) setError(String((e as Error)?.message ?? e));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!immediate) return;
    void refetch();
  }, deps);

  return { data, error, loading, refetch, setData, setError };
}
