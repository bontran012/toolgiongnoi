import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Video,
  Music,
  Trash2,
  CheckCircle2,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

interface SampleMediaPreviewProps {
  previewUrl: string;
  isVideo: boolean;
  fileName: string;
  fileSize: string;
  duration: number;
  onClear: () => void;
}

export const SampleMediaPreview: React.FC<SampleMediaPreviewProps> = ({
  previewUrl,
  isVideo,
  fileName,
  fileSize,
  duration: initialDuration,
  onClear,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(initialDuration > 0 ? initialDuration : 0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync initial duration
  useEffect(() => {
    if (initialDuration && initialDuration > 0) {
      setDuration(initialDuration);
    }
  }, [initialDuration]);

  // Update media source and duration when URL changes
  useEffect(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (el) {
      el.src = previewUrl;
      el.load();
    }
    setIsPlaying(false);
    setCurrentTime(0);
  }, [previewUrl, isVideo]);

  const updateDuration = (el: HTMLMediaElement) => {
    if (el.duration && !isNaN(el.duration) && isFinite(el.duration) && el.duration > 0) {
      setDuration(Number(el.duration.toFixed(2)));
    }
  };

  const togglePlay = () => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;

    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn('Playback error, retrying load:', err);
          el.load();
          el.play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    const el = isVideo ? videoRef.current : audioRef.current;
    if (el) {
      el.currentTime = targetTime;
    }
  };

  const handleReplay = () => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (el) {
      el.currentTime = 0;
      setCurrentTime(0);
      el.play()
        .then(() => setIsPlaying(true))
        .catch(console.warn);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    if (duration < 10 && duration > 0) {
      return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const effectiveDuration = duration > 0 ? duration : initialDuration > 0 ? initialDuration : 1;

  return (
    <div className="p-4 bg-slate-950 border border-purple-500/40 rounded-xl space-y-3 shadow-lg">
      {/* File Info Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">
            {isVideo ? <Video className="w-4 h-4" /> : <Music className="w-4 h-4" />}
          </div>
          <div className="truncate">
            <div className="text-xs font-bold text-slate-100 truncate flex items-center gap-1.5">
              <span>{fileName}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
              <span>{isVideo ? 'Video Clip Mẫu' : 'Tệp Audio Mẫu'}</span>
              <span>•</span>
              <span className="text-slate-300 font-semibold">{fileSize}</span>
              {duration > 0 && (
                <>
                  <span>•</span>
                  <span className="text-purple-300 font-mono font-bold">
                    {duration < 10 ? `${duration.toFixed(1)}s` : `${Math.round(duration)}s`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg transition"
          title="Xóa tệp mẫu này"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Video Preview Box if Video */}
      {isVideo && (
        <div className="relative rounded-lg overflow-hidden bg-black aspect-video max-h-52 flex items-center justify-center border border-slate-800">
          <video
            ref={videoRef}
            src={previewUrl}
            playsInline
            controls
            preload="auto"
            onTimeUpdate={(e) => {
              setCurrentTime(e.currentTarget.currentTime);
              updateDuration(e.currentTarget);
            }}
            onLoadedMetadata={(e) => updateDuration(e.currentTarget)}
            onDurationChange={(e) => updateDuration(e.currentTarget)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {/* Audio Player if Audio */}
      {!isVideo && (
        <div className="space-y-2.5">
          <audio
            ref={audioRef}
            src={previewUrl}
            preload="auto"
            onTimeUpdate={(e) => {
              setCurrentTime(e.currentTarget.currentTime);
              updateDuration(e.currentTarget);
            }}
            onLoadedMetadata={(e) => updateDuration(e.currentTarget)}
            onDurationChange={(e) => updateDuration(e.currentTarget)}
            onCanPlay={(e) => updateDuration(e.currentTarget)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />

          {/* Interactive Custom Player Controls */}
          <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="w-9 h-9 rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center transition flex-shrink-0 shadow-md shadow-purple-900/40"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5 fill-current" />
                )}
              </button>

              <button
                type="button"
                onClick={handleReplay}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition flex-shrink-0"
                title="Nghe lại từ đầu"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Progress Slider */}
              <div className="flex-1 flex flex-col justify-center gap-1.5">
                <input
                  type="range"
                  min={0}
                  max={effectiveDuration}
                  step={0.01}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />

                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                  <span className="text-purple-300 font-medium">{formatTime(currentTime)}</span>
                  <span className="text-slate-300 font-medium">
                    {formatTime(effectiveDuration)}
                  </span>
                </div>
              </div>

              {/* Mute Button */}
              <button
                type="button"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition flex-shrink-0"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {/* Dynamic Waveform Visualizer */}
            <div className="flex items-center justify-center gap-1 pt-0.5 h-3">
              {[25, 60, 40, 85, 55, 35, 75, 50, 90, 60, 70, 40, 65, 30].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isPlaying
                      ? 'bg-purple-400 animate-pulse'
                      : (currentTime / effectiveDuration) * 14 > i
                      ? 'bg-purple-500'
                      : 'bg-slate-700/60'
                  }`}
                  style={{
                    height: `${isPlaying ? Math.max(25, (Math.sin(i * 0.5 + currentTime * 6) + 1) * 45 + 10) : h}%`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Native HTML5 Audio Bar (100% Reliable Backup) */}
          <div className="pt-0.5">
            <audio
              src={previewUrl}
              controls
              className="w-full h-8 opacity-80 hover:opacity-100 transition rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Success Ready Badge */}
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
        <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Âm thanh mẫu đã sẵn sàng để gửi tới Colab GPU!</span>
      </div>
    </div>
  );
};
