export type ReadingMode = "vertical" | "page" | "rtl" | "double-page" | "panel";

export type ImageFitMode = "fit-width" | "fit-height" | "original" | "fit-screen";

export type ReaderBackground = "black" | "dark" | "sepia" | "white";

export interface ReaderSettings {
  readingMode: ReadingMode;
  imageFitMode: ImageFitMode;
  background: ReaderBackground;
  brightness: number;
  autoScroll: boolean;
  autoScrollSpeed: number;
  showProgressBar: boolean;
  preloadNextChapter: boolean;
  doubleTapZoom: boolean;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  readingMode: "vertical",
  imageFitMode: "fit-width",
  background: "black",
  brightness: 1,
  autoScroll: false,
  autoScrollSpeed: 60,
  showProgressBar: true,
  preloadNextChapter: true,
  doubleTapZoom: true,
};

export interface ReadingStats {
  totalChaptersRead: number;
  totalPagesViewed: number;
  estimatedMinutes: number;
  seriesStats: Array<{
    slug: string;
    title?: string;
    readChapters: number;
    totalChapters: number;
  }>;
}
