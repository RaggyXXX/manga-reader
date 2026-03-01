import { useEffect } from "react";

interface KeyboardHandlers {
  nextPage: () => void;
  prevPage: () => void;
  toggleFullscreen: () => void;
  toggleSettings: () => void;
  toggleBars: () => void;
}

export function useReaderKeyboard(handlers: KeyboardHandlers): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keypresses when focus is inside an input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ": // Space
          e.preventDefault();
          handlers.nextPage();
          break;

        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          handlers.prevPage();
          break;

        case "f":
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            document.documentElement.requestFullscreen();
          }
          handlers.toggleFullscreen();
          break;

        case "s":
          e.preventDefault();
          handlers.toggleSettings();
          break;

        case "Escape":
          e.preventDefault();
          handlers.toggleBars();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handlers]);
}
