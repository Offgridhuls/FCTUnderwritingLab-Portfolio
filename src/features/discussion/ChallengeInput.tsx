import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type SpeechResult = { isFinal: boolean; [index: number]: { transcript: string } };
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognizer;
  webkitSpeechRecognition?: new () => Recognizer;
};

export function ChallengeInput({
  value,
  onChange,
  onActiveChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onActiveChange: (active: boolean) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'listening' | 'stopping'>('idle');
  const [interim, setInterim] = useState('');
  const [message, setMessage] = useState('');
  const ref = useRef<Recognizer | null>(null);
  const text = useRef(value);
  text.current = value;
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const Speech =
    (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
  const active = phase !== 'idle';

  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);
  useEffect(
    () => () => {
      clearTimeout(timeout.current);
      clearTimeout(stopTimeout.current);
      const recognition = ref.current;
      ref.current = null;
      if (recognition) {
        recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
        recognition.abort();
      }
      onActiveChange(false);
    },
    [onActiveChange],
  );

  function stop() {
    if (!ref.current) return;
    setPhase('stopping');
    clearTimeout(timeout.current);
    ref.current.stop();
    stopTimeout.current = setTimeout(() => {
      const recognition = ref.current;
      ref.current = null;
      if (recognition) {
        recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
        recognition.abort();
      }
      setPhase('idle');
      setInterim('');
      setMessage('Dictation stopped. Review the captured text before submitting.');
    }, 5000);
  }
  function start() {
    if (!Speech || ref.current || disabled) return;
    setMessage('');
    setInterim('');
    setPhase('starting');
    const recognition = new Speech();
    ref.current = recognition;
    recognition.lang = 'en-CA';
    recognition.continuous = true;
    recognition.interimResults = true;
    const committed = new Set<number>();
    recognition.onstart = () => {
      if (ref.current === recognition) setPhase('listening');
    };
    recognition.onresult = (event) => {
      if (ref.current !== recognition) return;
      const additions: string[] = [];
      const preview: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal && !committed.has(i)) {
          committed.add(i);
          additions.push(result[0].transcript.trim());
        } else if (!result.isFinal) preview.push(result[0].transcript);
      }
      if (additions.length) {
        const next = [text.current.trimEnd(), ...additions].filter(Boolean).join(' ');
        text.current = next.slice(0, 2000);
        onChange(text.current);
        if (next.length >= 2000) {
          stop();
          setMessage('The 2,000-character limit was reached. Review your challenge.');
        }
      }
      setInterim(preview.join(' '));
    };
    recognition.onerror = (event) => {
      if (ref.current !== recognition) return;
      const messages: Record<string, string> = {
        'not-allowed':
          'Microphone access was denied. Allow it in browser settings, or type your challenge.',
        'service-not-allowed':
          'This browser does not allow its speech service. Try Chrome, or use Windows dictation (Win + H) in the text box.',
        'audio-capture': 'No microphone is available. Connect a microphone or type your challenge.',
        network:
          'The browser speech service could not connect. Try Chrome, or use Windows dictation (Win + H) in the text box.',
        'no-speech': 'No speech was detected. Try again or type your challenge.',
        'language-not-supported':
          'English (Canada) dictation is unavailable in this browser. You can still type your challenge.',
      };
      setMessage(
        messages[event.error] || 'Dictation stopped. You can edit the captured text or try again.',
      );
      recognition.abort();
      ref.current = null;
      clearTimeout(timeout.current);
      clearTimeout(stopTimeout.current);
      setPhase('idle');
      setInterim('');
    };
    recognition.onend = () => {
      if (ref.current !== recognition) return;
      ref.current = null;
      clearTimeout(timeout.current);
      clearTimeout(stopTimeout.current);
      setPhase('idle');
      setInterim('');
    };
    try {
      recognition.start();
      timeout.current = setTimeout(stop, 60000);
    } catch {
      ref.current = null;
      setPhase('idle');
      setMessage(
        'Dictation could not start in this browser. Try Chrome or use Windows dictation (Win + H).',
      );
    }
  }
  return (
    <div className="challenge-input">
      <label htmlFor="challenge-text">Your question or challenge</label>
      <textarea
        id="challenge-text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={active}
        disabled={disabled}
        placeholder="What evidence would change this finding? Does the cited document address the gap?"
        required
        minLength={3}
        maxLength={2000}
      />
      <div className="voice-controls">
        <button
          type="button"
          className={active ? 'voice-button listening' : 'voice-button'}
          onClick={active ? stop : start}
          disabled={disabled || !Speech || phase === 'stopping'}
          aria-pressed={active}
        >
          {active ? <Square size={15} /> : <Mic size={16} />}
          {phase === 'stopping'
            ? 'Finishing dictation…'
            : active
              ? 'Stop dictation'
              : 'Use microphone'}
        </button>
        <span role="status" aria-live="polite">
          {phase === 'starting'
            ? 'Waiting for microphone…'
            : phase === 'listening'
              ? 'Listening…'
              : phase === 'stopping'
                ? 'Finishing…'
                : `${value.length} / 2,000`}
        </span>
      </div>
      {interim && (
        <p className="voice-preview" aria-live="polite">
          Hearing: {interim}
        </p>
      )}
      {message && (
        <p className="voice-message" role="alert">
          {message}
        </p>
      )}
      <p className="voice-help">
        {Speech
          ? 'Dictate, stop, then edit and submit. Your browser’s speech provider may process audio; this app saves only the submitted text.'
          : 'Voice recognition is unavailable in this browser. Open this app in Chrome, or focus the text box and press Win + H for Windows dictation.'}
      </p>
    </div>
  );
}
