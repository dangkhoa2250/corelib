import { useCallback, useEffect, useRef, useState } from "react";

export interface UsePronunciationResult {
  isSupported: boolean;
  isPlaying: boolean;
  play: (text: string, lang?: string) => void;
  stop: () => void;
}

export function usePronunciation(): UsePronunciationResult {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isSupported = typeof window !== "undefined" && !!window.speechSynthesis;

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }, [isSupported]);

  const play = useCallback(
    (text: string, lang?: string) => {
      if (!isSupported || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (lang) utterance.lang = lang;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported],
  );

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  return { isSupported, isPlaying, play, stop };
}
