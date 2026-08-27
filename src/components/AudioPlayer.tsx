import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Download, Volume2, VolumeX, Sparkles, BookmarkPlus, Check } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  autoPlay?: boolean;
  onSaveAsVoiceModel?: () => void;
  isSavedAsModel?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title = 'Kết Quả Giọng Nói',
  autoPlay = true,
  onSaveAsVoiceModel,
  isSavedAsModel = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = src;
      audioRef.current.load();
      if (autoPlay) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        setIsPlaying(false);
      }
    }
  }, [src, autoPlay]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
    } else {
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div id="audio-player-container" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200 line-clamp-1">{title}</h4>
            <p className="text-xs text-slate-400">Định dạng Âm thanh Chuẩn Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSaveAsVoiceModel && (
            <button
              type="button"
              onClick={onSaveAsVoiceModel}
              disabled={isSavedAsModel}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition shadow-sm cursor-pointer ${
                isSavedAsModel
                  ? 'bg-emerald-600/30 border border-emerald-500/40 text-emerald-300'
                  : 'bg-purple-600/80 hover:bg-purple-500 text-white shadow-purple-600/20'
              }`}
              title="Lưu file âm thanh vừa tạo này làm giọng mẫu mới vào kho để tái sử dụng"
            >
              {isSavedAsModel ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Đã Lưu Mẫu</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Lưu Làm Mẫu</span>
                </>
              )}
            </button>
          )}

          <a
            id="btn-download-audio"
            href={src}
            download="audio_giongnoi.mp3"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải file MP3</span>
          </a>
        </div>
      </div>

      {/* Progress & Waveform bars */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-xs font-mono text-slate-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        <input
          id="audio-progress-bar"
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />

        {/* Animated Sound Waveform Preview */}
        <div className="flex items-center justify-center gap-1 h-6 py-1">
          {Array.from({ length: 32 }).map((_, i) => {
            const height = isPlaying
              ? Math.max(15, (Math.sin(i * 0.4 + currentTime * 5) + 1) * 45 + (i % 3) * 8)
              : 20;
            return (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-150 ${
                  (currentTime / (duration || 1)) * 32 > i
                    ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                    : 'bg-slate-700/60'
                }`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
        <div className="flex items-center space-x-2">
          <button
            id="btn-play-pause"
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white flex items-center justify-center transition shadow-lg shadow-blue-500/20"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            id="btn-replay"
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play();
                setIsPlaying(true);
              }
            }}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            title="Phát lại từ đầu"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Speed selectors */}
        <div className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/50 text-xs">
          {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
            <button
              key={rate}
              onClick={() => changeSpeed(rate)}
              className={`px-2 py-1 rounded transition ${
                playbackRate === rate
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        {/* Volume */}
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleMute}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            id="audio-volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>
    </div>
  );
};
