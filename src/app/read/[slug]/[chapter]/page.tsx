"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Reader from "@/components/reader/Reader";
import styles from "./page.module.css";

interface ChapterData {
  _id: string;
  number: number;
  title: string;
  imageUrls: string[];
  pageCount: number;
  status: string;
}

const POLL_INTERVAL = 3000;
const MAX_POLL_TIME = 120000; // 120s max wait

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const chapterNum = parseInt(params.chapter as string, 10);

  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chapterIds, setChapterIds] = useState<Record<number, string>>({});
  const [allChapterNums, setAllChapterNums] = useState<number[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crawlStartRef = useRef<number>(0);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Fetch chapter list for navigation
  useEffect(() => {
    fetch(`/api/series/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.chapters) {
          const ids: Record<number, string> = {};
          const nums: number[] = [];
          for (const ch of data.chapters) {
            ids[ch.number] = ch._id;
            nums.push(ch.number);
          }
          setChapterIds(ids);
          setAllChapterNums(nums.sort((a, b) => a - b));
        }
      })
      .catch(() => {});
  }, [slug]);

  // Stop any existing poll
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll GET until chapter is crawled
  const startPolling = useCallback(
    (chapterId: string) => {
      stopPolling();
      crawlStartRef.current = Date.now();

      pollRef.current = setInterval(async () => {
        // Timeout: stop polling after MAX_POLL_TIME
        if (Date.now() - crawlStartRef.current > MAX_POLL_TIME) {
          stopPolling();
          setCrawling(false);
          setError("Timeout beim Crawlen. Bitte erneut versuchen.");
          return;
        }

        try {
          const res = await fetch(`/api/chapters/${chapterId}`);
          const data = await res.json();

          if (data.chapter?.status === "crawled" && data.chapter.imageUrls?.length > 0) {
            stopPolling();
            setCrawling(false);
            setChapter(data.chapter);
            setLoading(false);
          } else if (data.chapter?.status === "error") {
            stopPolling();
            setCrawling(false);
            setError(data.chapter.errorMessage || "Crawling fehlgeschlagen");
            setLoading(false);
          }
        } catch {
          // Network error — keep polling
        }
      }, POLL_INTERVAL);
    },
    [stopPolling]
  );

  // Fetch chapter: GET first, then POST to trigger crawl if pending
  const fetchChapter = useCallback(async () => {
    const chapterId = chapterIds[chapterNum];
    if (!chapterId) return;

    setLoading(true);
    setError(null);
    setCrawling(false);
    stopPolling();

    try {
      // 1. GET — check current status
      const res = await fetch(`/api/chapters/${chapterId}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Fehler beim Laden");
        setLoading(false);
        return;
      }

      const ch = data.chapter;

      // Already crawled — show immediately
      if (ch.status === "crawled" && ch.imageUrls?.length > 0) {
        setChapter(ch);
        setLoading(false);
        return;
      }

      // Not crawled — trigger crawl via POST
      setCrawling(true);

      const crawlRes = await fetch(`/api/chapters/${chapterId}`, { method: "POST" });
      const crawlData = await crawlRes.json();

      if (crawlRes.ok && crawlData.chapter?.status === "crawled" && crawlData.chapter.imageUrls?.length > 0) {
        // Crawl completed in time
        setChapter(crawlData.chapter);
        setCrawling(false);
        setLoading(false);
        return;
      }

      if (!crawlRes.ok) {
        setError(crawlData.error || "Crawling fehlgeschlagen");
        setCrawling(false);
        setLoading(false);
        return;
      }

      // Crawl might still be running — start polling
      startPolling(chapterId);
    } catch {
      setError("Netzwerkfehler");
      setCrawling(false);
      setLoading(false);
    }
  }, [chapterIds, chapterNum, stopPolling, startPolling]);

  useEffect(() => {
    if (chapterIds[chapterNum]) {
      fetchChapter();
    }
  }, [chapterIds, chapterNum, fetchChapter]);

  const currentIndex = allChapterNums.indexOf(chapterNum);
  const prevChapter = currentIndex > 0 ? allChapterNums[currentIndex - 1] : null;
  const nextChapter =
    currentIndex < allChapterNums.length - 1 ? allChapterNums[currentIndex + 1] : null;

  const goToChapter = (num: number) => {
    stopPolling();
    setChapter(null);
    setLoading(true);
    setCrawling(false);
    setError(null);
    router.push(`/read/${slug}/${num}`);
  };

  // Loading / Crawling state
  if ((loading || crawling) && !chapter) {
    return (
      <div className={styles.loading}>
        <svg className={styles.spinner} width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path d="M24 4C24 4 28 13 28 17C28 21 24 24 24 24C24 24 20 21 20 17C20 13 24 4 24 4Z" fill="#f2a0b3" opacity="0.9" />
          <path d="M44 24C44 24 35 28 31 28C27 28 24 24 24 24C24 24 27 20 31 20C35 20 44 24 44 24Z" fill="#f2a0b3" opacity="0.75" />
          <path d="M24 44C24 44 20 35 20 31C20 27 24 24 24 24C24 24 28 27 28 31C28 35 24 44 24 44Z" fill="#f2a0b3" opacity="0.65" />
          <path d="M4 24C4 24 13 20 17 20C21 20 24 24 24 24C24 24 21 28 17 28C13 28 4 24 4 24Z" fill="#f2a0b3" opacity="0.8" />
          <circle cx="24" cy="24" r="5" fill="#e8a849" opacity="0.9" />
        </svg>
        <p>{crawling ? "Kapitel wird gecrawlt..." : "Kapitel wird geladen..."}</p>
        {crawling && (
          <p className={styles.hint}>
            Bilder werden von der Quelle geladen. Dies kann 20-40 Sekunden dauern.
          </p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.loading}>
        <p className={styles.errorText}>{error}</p>
        <button className={styles.retryBtn} onClick={fetchChapter}>
          Erneut versuchen
        </button>
        <button
          className={styles.retryBtn}
          onClick={() => router.back()}
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
        >
          Zurueck
        </button>
      </div>
    );
  }

  if (!chapter || chapter.imageUrls.length === 0) {
    return (
      <div className={styles.loading}>
        <p>Keine Bilder gefunden.</p>
        <button className={styles.retryBtn} onClick={fetchChapter}>
          Erneut versuchen
        </button>
        <button
          className={styles.retryBtn}
          onClick={() => router.back()}
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
        >
          Zurueck
        </button>
      </div>
    );
  }

  return (
    <Reader
      slug={slug}
      chapterNumber={chapterNum}
      title={chapter.title}
      imageUrls={chapter.imageUrls}
      prevChapter={prevChapter}
      nextChapter={nextChapter}
      allChapterNums={allChapterNums}
      onNavigate={goToChapter}
    />
  );
}
