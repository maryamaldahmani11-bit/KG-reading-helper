import { useState, useCallback, useEffect } from 'react';
import type { SpeechRequest } from '../types';

export const useSpeechSynthesis = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    
    // Voices load asynchronously
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices(); // In case they are already loaded

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const speak = useCallback((requests: SpeechRequest[]) => {
    if (!('speechSynthesis' in window) || requests.length === 0) {
      console.error('Text-to-speech not supported in this browser.');
      return;
    }

    speechSynthesis.cancel(); 
    
    setIsPaused(false);
    setIsPlaying(true);

    requests.forEach((request, index) => {
      const utterance = new SpeechSynthesisUtterance(request.text);
      utterance.lang = request.lang;
      utterance.rate = request.rate ?? 0.9; // Use provided rate or default
      if (request.voice) {
        utterance.voice = request.voice;
      }
      
      utterance.onboundary = request.onBoundary || null;
      
      utterance.onend = () => {
        request.onEnd?.(); // Fire individual onEnd callback

        // When the last utterance in the queue has finished, update the hook state.
        if (index === requests.length - 1) {
            setIsPlaying(false);
            setIsPaused(false);
        }
      };
      
      speechSynthesis.speak(utterance);
    });
  }, []);

  const pause = useCallback(() => {
    if (speechSynthesis.speaking) {
      speechSynthesis.pause();
      setIsPlaying(false);
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      setIsPlaying(true);
      setIsPaused(false);
    }
  }, []);
  
  const cancel = useCallback(() => {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        setIsPlaying(false);
        setIsPaused(false);
    }
  }, []);

  return { speak, pause, resume, cancel, isPlaying, isPaused, voices };
};