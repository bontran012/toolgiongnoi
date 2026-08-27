export type ProviderType = 'ElevenLabs' | 'MiniMax' | 'OpenSpeaker' | 'Edge';

export interface KeyItem {
  key: string;
  name: string;
  balance: number;
  email: string;
  label: string;
  source?: 'genmax' | 'openspeaker';
}

export interface VoiceOption {
  id: string;
  name: string;
  tag?: string;
  provider?: string;
  lang?: string;
  previewUrl?: string;
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

