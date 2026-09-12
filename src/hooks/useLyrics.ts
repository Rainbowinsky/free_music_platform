import { useEffect, useState } from 'react';
import { parseLrc, type LyricLine } from '../utils/lrc';

/** 加载并解析 LRC 歌词 */
export function useLyrics(url?: string) {
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setLines([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    fetch(url)
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (cancelled) return;
        setLines(text ? parseLrc(text) : []);
      })
      .catch(() => {
        if (!cancelled) setLines([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { lines, loading };
}
