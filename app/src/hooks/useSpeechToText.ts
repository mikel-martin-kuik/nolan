import { useState, useRef, useCallback, useEffect } from 'react';

export type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'prompt';

export interface UseSpeechToTextResult {
  /** Whether the browser supports speech recognition */
  isSupported: boolean;
  /** Whether currently recording */
  isRecording: boolean;
  /** Current transcript (interim results) */
  transcript: string;
  /** Error message if any */
  error: string | null;
  /** Microphone permission status */
  permissionStatus: PermissionStatus;
  /** Request microphone permission explicitly */
  requestPermission: () => Promise<boolean>;
  /** Start recording */
  startRecording: () => void;
  /** Stop recording */
  stopRecording: () => void;
  /** Toggle recording state */
  toggleRecording: () => void;
}

// Extend Window interface for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

// Check browser support once at module load
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

const LOG_PREFIX = '[SpeechToText]';

/**
 * Hook for speech-to-text using the Web Speech API.
 * Includes explicit microphone permission handling and debug logging.
 *
 * @param onTranscript - Callback fired when final transcript is available
 * @returns Object with recording state, controls, and transcript
 *
 * @example
 * const { isSupported, isRecording, toggleRecording, error } = useSpeechToText(
 *   (text) => setDescription(prev => prev + ' ' + text)
 * );
 */
export function useSpeechToText(
  onTranscript: (transcript: string) => void,
): UseSpeechToTextResult {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  const isSupported = !!SpeechRecognitionAPI;

  // Log support status on mount
  useEffect(() => {
    console.log(LOG_PREFIX, 'Browser support check:', {
      isSupported,
      hasSpeechRecognition: !!window.SpeechRecognition,
      hasWebkitSpeechRecognition: !!window.webkitSpeechRecognition,
      userAgent: navigator.userAgent,
    });
  }, [isSupported]);

  // Keep callback ref updated
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Check permission status on mount
  useEffect(() => {
    const checkPermission = async () => {
      try {
        // Use Permissions API if available
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          console.log(LOG_PREFIX, 'Permission query result:', result.state);
          setPermissionStatus(result.state as PermissionStatus);

          // Listen for permission changes
          result.onchange = () => {
            console.log(LOG_PREFIX, 'Permission changed to:', result.state);
            setPermissionStatus(result.state as PermissionStatus);
          };
        }
      } catch (err) {
        console.log(LOG_PREFIX, 'Permissions API not available:', err);
        // Permissions API not available, status remains unknown
      }
    };

    if (isSupported) {
      checkPermission();
    }
  }, [isSupported]);

  // Request microphone permission explicitly
  const requestPermission = useCallback(async (): Promise<boolean> => {
    console.log(LOG_PREFIX, 'Requesting microphone permission...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission granted - stop the stream immediately
      stream.getTracks().forEach(track => track.stop());
      console.log(LOG_PREFIX, 'Microphone permission granted');
      setPermissionStatus('granted');
      setError(null);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(LOG_PREFIX, 'Microphone permission denied:', errorMessage);

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionStatus('denied');
          setError('Microphone access denied. Please allow microphone access in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.');
        } else if (err.name === 'NotSupportedError') {
          setError('Microphone access is not supported in this browser/environment.');
        } else {
          setError(`Microphone error: ${err.name} - ${err.message}`);
        }
      } else {
        setError(`Failed to access microphone: ${errorMessage}`);
      }
      return false;
    }
  }, []);

  // Initialize recognition instance
  useEffect(() => {
    if (!SpeechRecognitionAPI) {
      console.log(LOG_PREFIX, 'SpeechRecognition API not available, skipping initialization');
      return;
    }

    console.log(LOG_PREFIX, 'Initializing SpeechRecognition instance');
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log(LOG_PREFIX, 'Recording started');
      setIsRecording(true);
      setError(null);
    };

    recognition.onend = () => {
      console.log(LOG_PREFIX, 'Recording ended');
      setIsRecording(false);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (interimTranscript) {
        console.log(LOG_PREFIX, 'Interim transcript:', interimTranscript);
      }
      setTranscript(interimTranscript);

      if (finalTranscript) {
        console.log(LOG_PREFIX, 'Final transcript:', finalTranscript);
        onTranscriptRef.current(finalTranscript);
        setTranscript('');
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error(LOG_PREFIX, 'Recognition error:', event.error, event.message);

      const errorMessages: Record<string, string> = {
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'No microphone found. Please connect a microphone.',
        'not-allowed': 'Microphone access denied. Please allow microphone access in your browser settings.',
        'network': 'Network error. Speech recognition requires an internet connection.',
        'aborted': 'Recording was stopped.',
        'service-not-allowed': 'Speech recognition service not allowed. This may not work in this environment.',
      };

      const errorMessage = errorMessages[event.error] || `Speech recognition error: ${event.error}`;
      setError(errorMessage);
      setIsRecording(false);

      if (event.error === 'not-allowed') {
        setPermissionStatus('denied');
      }
    };

    recognitionRef.current = recognition;
    console.log(LOG_PREFIX, 'SpeechRecognition instance ready');

    return () => {
      console.log(LOG_PREFIX, 'Cleaning up SpeechRecognition instance');
      recognition.abort();
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!recognitionRef.current) {
      console.log(LOG_PREFIX, 'Cannot start: recognition not initialized');
      return;
    }
    if (isRecording) {
      console.log(LOG_PREFIX, 'Cannot start: already recording');
      return;
    }

    setError(null);
    setTranscript('');

    // Request permission first if not already granted
    if (permissionStatus !== 'granted') {
      console.log(LOG_PREFIX, 'Permission not granted, requesting...');
      const granted = await requestPermission();
      if (!granted) {
        console.log(LOG_PREFIX, 'Permission request failed, aborting start');
        return;
      }
    }

    try {
      console.log(LOG_PREFIX, 'Starting recognition...');
      recognitionRef.current.start();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(LOG_PREFIX, 'Failed to start recording:', errorMessage);

      // Handle "already started" error
      if (errorMessage.includes('already started')) {
        console.log(LOG_PREFIX, 'Recognition already running, stopping first');
        recognitionRef.current.stop();
      } else {
        setError(`Failed to start recording: ${errorMessage}`);
      }
    }
  }, [isRecording, permissionStatus, requestPermission]);

  const stopRecording = useCallback(() => {
    if (!recognitionRef.current) {
      console.log(LOG_PREFIX, 'Cannot stop: recognition not initialized');
      return;
    }
    if (!isRecording) {
      console.log(LOG_PREFIX, 'Cannot stop: not recording');
      return;
    }

    console.log(LOG_PREFIX, 'Stopping recognition...');
    recognitionRef.current.stop();
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isSupported,
    isRecording,
    transcript,
    error,
    permissionStatus,
    requestPermission,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
