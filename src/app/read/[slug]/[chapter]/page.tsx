"use client";

import { useEffect, useState, useCallback } from "react";
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

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const chapterNum = parseInt(params.chapter as string, 10);

  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapterIds, setChapterIds] = useState<Record<number, string>>({});
  const [allChapterNums, setAllChapterNums] = useState<number[]>([]);

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

  // Fetch current chapter
  const fetchChapter = useCallback(async () => {
    const chapterId = chapterIds[chapterNum];
    if (!chapterId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/chapters/${chapterId}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Fehler beim Laden");
        return;
      }

      setChapter(data.chapter);
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  }, [chapterIds, chapterNum]);

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
    router.push(`/read/${slug}/${num}`);
  };

  if (loading && !chapter) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Kapitel wird vorbereitet...</p>
        <p className={styles.hint}>
          Falls noch nicht gecrawlt, kann dies 20-30 Sekunden dauern.
        </p>
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
      </div>
    );
  }

  if (!chapter || chapter.imageUrls.length === 0) {
    return (
      <div className={styles.loading}>
        <p>Keine Bilder gefunden.</p>
        <button className={styles.retryBtn} onClick={() => router.back()}>
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
