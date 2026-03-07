import type { MangaSource } from "./manga-store";
import { isSourceSearchable, recordSourceFailure, recordSourceSuccess } from "./source-health";

export interface SearchResult {
  title: string;
  coverUrl: string;
  sourceUrl: string;
  source: MangaSource;
  sourceId?: string;
  availableLanguages?: string[];
  chapterCount?: number;
}

export interface SearchError {
  source: string;
  message: string;
}

export interface SearchSourceRunner {
  name: MangaSource;
  fn: () => Promise<SearchResult[]>;
}

export function relevanceScore(title: string, query: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase();

  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  const wordBoundary = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`);
  if (wordBoundary.test(t)) return 80;
  if (t.includes(q)) return 70;
  const qWords = q.split(/\s+/);
  const allWordsMatch = qWords.every((w) => t.includes(w));
  if (allWordsMatch) return 60;
  const matchCount = qWords.filter((w) => t.includes(w)).length;
  return (matchCount / qWords.length) * 50;
}

export async function collectSearchResults(
  query: string,
  sources: SearchSourceRunner[],
  withTimeout: <T>(promise: Promise<T>, ms: number) => Promise<T> = defaultWithTimeout,
): Promise<{ results: SearchResult[]; errors: SearchError[] }> {
  const activeSources = sources.filter((source) => isSourceSearchable(source.name));
  const settled = await Promise.allSettled(activeSources.map((source) => withTimeout(source.fn(), 8000)));

  const results: SearchResult[] = [];
  const errors: SearchError[] = [];

  for (const [index, result] of settled.entries()) {
    if (result.status === "fulfilled") {
      await recordSourceSuccess(activeSources[index].name);
      results.push(...result.value.filter((item) => isSourceSearchable(item.source)));
      continue;
    }

    const message = result.reason?.message || "Unknown error";
    await recordSourceFailure(activeSources[index].name, message, Date.now(), "weak");
    errors.push({
      source: activeSources[index].name,
      message,
    });
  }

  results.sort((a, b) => relevanceScore(b.title, query) - relevanceScore(a.title, query));

  return { results, errors };
}

function defaultWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
