
import { useState, useRef, useCallback } from 'react';

export const useAudioRecorder = (onStop: (audioBlob: Blob) => void) => {
  const [isRecording, setIsRecording] = useState(false);
  const [permission, setPermission] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const getPermission = useCallback(async () => {
    if ('MediaRecorder' in window) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setPermission(true);
        return stream;
      } catch (err) {
        console.error('Microphone permission denied', err);
        setPermission(false);
        alert("Microphone access is needed to record your reading. Please allow access in your browser settings.");
        return null;
      }
    } else {
      alert('The MediaRecorder API is not supported in your browser.');
      return null;
    }
  }, []);

  const startRecording = async () => {
    const stream = await getPermission();
    if (!stream) return;

    setIsRecording(true);
    audioChunks.current = [];
    
    const recorder = new MediaRecorder(stream);
    mediaRecorder.current = recorder;
    recorder.start();

    recorder.ondataavailable = (event) => {
      audioChunks.current.push(event.data);
    };

    recorder.onstop = () => {
      const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
      onStop(audioBlob);
      // Stop all tracks on the stream to turn off the mic indicator
      stream.getTracks().forEach(track => track.stop());
    };
  };

  const stopRecording = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  return { isRecording, startRecording, stopRecording, hasPermission: permission };
};
