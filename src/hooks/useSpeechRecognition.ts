import { useCallback, useEffect, useRef, useState } from 'react';
import type { IrisLanguage } from '../types/iris';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function getLangCode(language: IrisLanguage): string {
  switch (language) {
    case 'hi':
      return 'hi-IN';
    case 'ur':
      return 'ur-PK';
    case 'en':
      return 'en-US';
    case 'auto':
    default:
      return 'en-IN';
  }
}

export interface UseSpeechRecognitionOptions {
  language: IrisLanguage;
  wakeWordEnabled: boolean;
  onFinalTranscript: (transcript: string) => void;
  onWakeWordDetected?: () => void;
}

export function useSpeechRecognition({
  language,
  wakeWordEnabled,
  onFinalTranscript,
  onWakeWordDetected,
}: UseSpeechRecognitionOptions) {
  const [supported] = useState<boolean>(() => Boolean(getSpeechRecognitionCtor()));
  const [isListening, setIsListening] = useState(false);
  const [isStandby, setIsStandby] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef<'idle' | 'active' | 'standby'>('idle');

  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;
  const onWakeRef = useRef(onWakeWordDetected);
  onWakeRef.current = onWakeWordDetected;

  const stopAudioMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startAudioMeter = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return true;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            sum += data[i];
          }
          const avg = sum / data.length / 128;
          setAudioLevel(Math.min(1, avg));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
      return true;
    } catch (err) {
      setMicPermission('denied');
      setError('Microphone permission denied. Please allow microphone access in your browser.');
      return false;
    }
  }, []);

  const stopAll = useCallback(() => {
    modeRef.current = 'idle';
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    stopAudioMeter();
    setIsListening(false);
    setIsStandby(false);
    setInterimTranscript('');
  }, [stopAudioMeter]);

  const startActiveListening = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser. Use Microsoft Edge or Google Chrome on Windows.');
      return false;
    }

    setError(null);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    const ok = await startAudioMeter();
    if (!ok) return false;

    const recognition = new Ctor();
    recognition.lang = getLangCode(language);
    recognition.interimResults = true;
    recognition.continuous = false;
    modeRef.current = 'active';
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setIsStandby(false);
      setInterimTranscript('');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript(interim);
      if (finalText.trim()) {
        setInterimTranscript('');
        onFinalRef.current(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicPermission('denied');
        setError('Microphone access blocked. Allow microphone permission in browser site settings.');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Voice input error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      stopAudioMeter();
      setIsListening(false);
      setInterimTranscript('');
      if (modeRef.current === 'active') {
        modeRef.current = 'idle';
      }
    };

    try {
      recognition.start();
      return true;
    } catch {
      stopAll();
      setError('Could not start speech recognition.');
      return false;
    }
  }, [language, startAudioMeter, stopAll, stopAudioMeter]);

  const startWakeStandby = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || !wakeWordEnabled) return;

    setError(null);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const recognition = new Ctor();
    recognition.lang = getLangCode(language);
    recognition.interimResults = true;
    recognition.continuous = true;
    modeRef.current = 'standby';
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsStandby(true);
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const raw = (res[0]?.transcript || '').trim();
        const lower = raw.toLowerCase();
        const wakeMatch = lower.match(/(?:hello|hey|hi)\s+iris\b(.*)/i);
        if (wakeMatch) {
          const remainder = (wakeMatch[1] || '').trim();
          if (res.isFinal && remainder.length > 1) {
            onWakeRef.current?.();
            onFinalRef.current(remainder);
          } else if (!remainder) {
            onWakeRef.current?.();
            startActiveListening();
          }
          break;
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicPermission('denied');
        setError('Microphone permission required for "Hello IRIS" wake phrase.');
        stopAll();
      }
    };

    recognition.onend = () => {
      if (modeRef.current === 'standby' && wakeWordEnabled) {
        setTimeout(() => {
          if (modeRef.current === 'standby') {
            startWakeStandby();
          }
        }, 350);
      } else {
        setIsStandby(false);
      }
    };

    try {
      recognition.start();
    } catch {
      setIsStandby(false);
    }
  }, [language, startActiveListening, stopAll, wakeWordEnabled]);

  useEffect(() => {
    if (!wakeWordEnabled && modeRef.current === 'standby') {
      stopAll();
    }
  }, [wakeWordEnabled, stopAll]);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

  return {
    supported,
    isListening,
    isStandby,
    interimTranscript,
    audioLevel,
    micPermission,
    error,
    clearError: () => setError(null),
    startListening: startActiveListening,
    stopListening: stopAll,
    startWakeStandby,
  };
}
