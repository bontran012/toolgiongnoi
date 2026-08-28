export type ProviderType = 'ElevenLabs_Official' | 'ElevenLabs' | 'MiniMax' | 'OpenSpeaker' | 'Edge';

export interface KeyItem {
  key: string;
  name: string;
  balance: number;
  email: string;
  label: string;
  source?: 'elevenlabs' | 'genmax' | 'openspeaker';
  tier?: string;
  limit?: number;
  used?: number;
  status?: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  tag?: string;
  provider?: string;
  lang?: string;
  previewUrl?: string;
  category?: string;
  gender?: string;
  accent?: string;
  description?: string;
  isCloned?: boolean;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  pitch: number;
  volume?: number;
  useSpeakerBoost?: boolean;
  outputFormat?: string;
  latency?: number;
  quality?: 'high' | 'low';
}

export interface GeneratedAudioItem {
  id: string;
  title: string;
  text: string;
  audioUrl: string;
  provider: string;
  voiceName?: string;
  createdAt: string;
  cost?: number;
  duration?: number;
}

