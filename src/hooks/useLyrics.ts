import { useEffect, useMemo, useState } from 'react';
import { hasTranslation, parseLrc, type LyricLine } from '../utils/lrc';

/** 加载并解析 LRC 歌词（带中文译文时会自动归并到 translation 字段） */
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

  // 是否含译文：决定界面上要不要出现「翻译」开关，避免放一个永远无效的按钮
  const translated = useMemo(() => hasTranslation(lines), [lines]);

  return { lines, loading, hasTranslation: translated };
}
