import { useCallback, useEffect, useRef, useState } from 'react';
import type { IrisSettings } from '../types/iris';

const FEMALE_VOICE_HINTS = [
  'aria',
  'jenny',
  'zira',
  'hazel',
  'susan',
  'libby',
  'sonia',
  'neerja',
  'swara',
  'heera',
  'kalpana',
  'uzma',
  'female',
  'samantha',
  'victoria',
  'karen',
  'moira',
  'tessa',
  'google uk english female',
  'google हिन्दी',
  'natural',
];

function scoreFemaleVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = 0;

  if (FEMALE_VOICE_HINTS.some((hint) => name.includes(hint))) {
    score += 50;
  }
  if (name.includes('male') && !name.includes('female')) {
    score -= 40;
  }
  if (name.includes('david') || name.includes('mark') || name.includes('george') || name.includes('ravi') || name.includes('hemant') || name.includes('asad')) {
    score -= 40;
  }
  if (name.includes('microsoft') || name.includes('natural')) {
    score += 15;
  }
  if (lang.startsWith('en-in') || lang.startsWith('en-gb') || lang.startsWith('en-us')) {
    score += 10;
  }
  return score;
}

function detectScriptLanguage(text: string): 'hi-IN' | 'ur-PK' | 'en' {
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hi-IN';
  }
  if (/[\u0600-\u06FF]/.test(text)) {
    return 'ur-PK';
  }
  return 'en';
}

function cleanTextForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoSpeakableChunks(text: string, maxLen = 200): string[] {
  const sentences = text.match(/[^.!?।\n]+[.!?।\n]?/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;
    if ((current + ' ' + sentence).trim().length <= maxLen) {
      current = (current + ' ' + sentence).trim();
    } else {
      if (current) chunks.push(current);
      if (sentence.length > maxLen) {
        const words = sentence.split(' ');
        let sub = '';
        for (const w of words) {
          if ((sub + ' ' + w).trim().length <= maxLen) {
            sub = (sub + ' ' + w).trim();
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        if (sub) current = sub;
        else current = '';
      } else {
        current = sentence;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function useSpeechSynthesis(settings: IrisSettings) {
  const [supported] = useState<boolean>(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const cancelledRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      const sorted = [...available].sort((a, b) => scoreFemaleVoice(b) - scoreFemaleVoice(a));
      setVoices(sorted);
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [supported]);

  const stopSpeaking = useCallback(() => {
    cancelledRef.current = true;
    if (supported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setSpeakingMessageId(null);
  }, [supported]);

  const pickVoiceForText = useCallback(
    (text: string): SpeechSynthesisVoice | undefined => {
      if (voices.length === 0) return undefined;
      const scriptLang = detectScriptLanguage(text);

      if (scriptLang === 'hi-IN') {
        const hiVoice = voices.find((v) => v.lang.toLowerCase().startsWith('hi'));
        if (hiVoice) return hiVoice;
      }
      if (scriptLang === 'ur-PK') {
        const urVoice = voices.find((v) => v.lang.toLowerCase().startsWith('ur'));
        if (urVoice) return urVoice;
      }

      if (settingsRef.current.voiceURI) {
        const selected = voices.find((v) => v.voiceURI === settingsRef.current.voiceURI);
        if (selected) return selected;
      }

      return voices[0];
    },
    [voices]
  );

  const speak = useCallback(
    (rawText: string, messageId?: string, onComplete?: () => void) => {
      if (!supported) {
        onComplete?.();
        return;
      }
      const clean = cleanTextForSpeech(rawText);
      if (!clean) {
        onComplete?.();
        return;
      }

      cancelledRef.current = false;
      window.speechSynthesis.cancel();

      const chunks = splitIntoSpeakableChunks(clean);
      const voice = pickVoiceForText(clean);
      const { muted, volume, speechRate, speechPitch } = settingsRef.current;

      if (muted || volume <= 0) {
        onComplete?.();
        return;
      }

      setIsSpeaking(true);
      setSpeakingMessageId(messageId || null);

      let idx = 0;
      const speakNext = () => {
        if (cancelledRef.current || idx >= chunks.length) {
          setIsSpeaking(false);
          setSpeakingMessageId(null);
          if (!cancelledRef.current) {
            onComplete?.();
          }
          return;
        }
        const utterance = new SpeechSynthesisUtterance(chunks[idx]);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
        utterance.volume = volume;
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;

        utterance.onend = () => {
          idx += 1;
          speakNext();
        };
        utterance.onerror = () => {
          setIsSpeaking(false);
          setSpeakingMessageId(null);
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNext();
    },
    [pickVoiceForText, supported]
  );

  useEffect(() => {
    return () => {
      if (supported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [supported]);

  return {
    supported,
    voices,
    isSpeaking,
    speakingMessageId,
    speak,
    stopSpeaking,
  };
}
