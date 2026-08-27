// audioUtils.ts - Professional Audio & Video Extractor & Normalizer

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Lỗi đọc dữ liệu tệp'));
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// Convert AudioBuffer to 16-bit PCM WAV Blob
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const samples: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    samples.push(buffer.getChannelData(i));
  }

  const length = buffer.length;
  const dataByteLength = length * blockAlign;
  const bufferArray = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(bufferArray);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, 'WAVE');

  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = samples[channel][i];
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([bufferArray], { type: 'audio/wav' });
}

export interface ExtractedMediaResult {
  previewUrl: string;
  base64: string;
  duration: number;
  isVideo: boolean;
  fileName: string;
  fileSizeFormatted: string;
}

export async function extractMediaData(file: File): Promise<ExtractedMediaResult> {
  const isVideo =
    file.type.startsWith('video/') ||
    /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i.test(file.name);

  const fileSizeFormatted = formatFileSize(file.size);
  const rawBase64 = await fileToBase64(file);
  let previewUrl = rawBase64;
  let finalBase64 = rawBase64;
  let duration = 0;

  // 1. Try high-precision Web Audio API decoding (works for mp3, wav, ogg, m4a, aac, flac)
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      if (decodedBuffer && decodedBuffer.duration > 0) {
        duration = decodedBuffer.duration;
        // Convert to standard 16-bit PCM WAV for 100% reliable HTML5 playback and Colab AI model compatibility
        const wavBlob = audioBufferToWav(decodedBuffer);
        finalBase64 = await fileToBase64(wavBlob);
        previewUrl = URL.createObjectURL(wavBlob);
      }
      audioCtx.close().catch(() => {});
    }
  } catch (err) {
    console.log('Web Audio decoding skipped/fallback:', err);
  }

  // 2. Video fallback probe
  if ((!duration || duration <= 0) && isVideo) {
    try {
      duration = await new Promise<number>((resolve) => {
        const videoEl = document.createElement('video');
        videoEl.preload = 'metadata';
        videoEl.src = previewUrl;
        const timer = setTimeout(() => resolve(0), 1500);
        videoEl.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve(videoEl.duration || 0);
        };
        videoEl.onerror = () => {
          clearTimeout(timer);
          resolve(0);
        };
      });
    } catch (e) {
      console.warn('Video probe error:', e);
    }
  }

  // Guarantee minimum duration if valid audio has data
  if (duration <= 0 && file.size > 100) {
    // Approximate duration based on standard MP3/WAV bitrate ~128kbps = 16KB/s
    duration = Math.max(0.5, Number((file.size / 16000).toFixed(1)));
  }

  return {
    previewUrl,
    base64: finalBase64,
    duration: Number(duration.toFixed(2)),
    isVideo,
    fileName: file.name,
    fileSizeFormatted,
  };
}
