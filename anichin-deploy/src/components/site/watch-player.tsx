'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Hls from 'hls.js';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  X, Play, Pause, Volume2, VolumeX, Maximize, SkipForward, SkipBack,
  Settings, ChevronLeft, ChevronRight, List, Download, Share2, Keyboard,
  Loader2, AlertCircle, Volume1,
} from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatViews, timeAgo, type AnimeDetail, type EpisodeData } from '@/lib/types';
import { EpisodeComments } from './episode-comments';
import { useI18n } from '@/lib/i18n-context';

export function WatchPlayerModal() {
  const { t } = useI18n();
  const { watchOpen, watchSlug, watchEpisode, closeWatch, openDetail, markWatched } = useUIStore();

  const { data: anime, isLoading } = useQuery({
    queryKey: ['anime-detail', watchSlug],
    queryFn: async () => {
      const res = await fetch(`/api/anime/${watchSlug}`);
      if (!res.ok) throw new Error('detail');
      return res.json();
    },
    enabled: !!watchSlug,
  });

  // Stabilize the markWatched wrapper so PlayerBody's effect deps are stable.
  const handleMarkWatched = useCallback(
    (ep: EpisodeData, progress?: number) => {
      if (!anime) return;
      markWatched({
        slug: anime.slug,
        title: anime.title,
        poster: anime.poster,
        episodeNumber: ep.number,
        totalEpisodes: anime.totalEpisodes ?? undefined,
        watchedAt: Date.now(),
        progress: progress ?? 100,
      });
    },
    [anime, markWatched]
  );

  return (
    <Dialog open={watchOpen} onOpenChange={(o) => !o && closeWatch()}>
      <DialogContent
        className="max-w-6xl w-[min(98vw,1280px)] p-0 gap-0 bg-background border-border overflow-hidden max-h-dvh-96"
        aria-describedby="watch-player-desc"
      >
        <DialogTitle className="sr-only">
          {anime ? t('watch.titleWithName').replace('{title}', anime.title) : t('watch.titleFallback')}
        </DialogTitle>
        <DialogDescription id="watch-player-desc" className="sr-only">
          {t('watch.description')}
        </DialogDescription>
        {isLoading || !anime ? (
          <div className="flex items-center justify-center h-[400px]">
            <div className="text-muted-foreground text-sm">{t('common.loading')}</div>
          </div>
        ) : (
          <PlayerBody
            anime={anime as AnimeDetail}
            initialEpisode={watchEpisode ?? 1}
            onClose={closeWatch}
            onOpenDetail={(slug) => {
              closeWatch();
              setTimeout(() => openDetail(slug), 100);
            }}
            onMarkWatched={handleMarkWatched}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlayerBody({
  anime,
  initialEpisode,
  onClose,
  onOpenDetail,
  onMarkWatched,
}: {
  anime: AnimeDetail;
  initialEpisode: number;
  onClose: () => void;
  onOpenDetail: (slug: string) => void;
  onMarkWatched: (ep: EpisodeData, progress?: number) => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSaveRef = useRef<number>(0);

  const [currentEp, setCurrentEp] = useState<EpisodeData>(
    () => anime.episodes.find((e) => e.number === initialEpisode) ?? anime.episodes[0]
  );
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  // Show the loading spinner initially whenever we already know we have a stream URL.
  const [isLoading, setIsLoading] = useState(() => !!currentEp.streamUrl);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showEpList, setShowEpList] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showVolume, setShowVolume] = useState(false);

  const streamUrl = currentEp.streamUrl ?? null;
  const isHls = !!streamUrl && streamUrl.toLowerCase().endsWith('.m3u8');

  // Stabilize onMarkWatched via ref to avoid re-running the source-setup effect.
  const onMarkWatchedRef = useRef(onMarkWatched);
  useEffect(() => {
    onMarkWatchedRef.current = onMarkWatched;
  });

  // Stabilize currentEp via ref so the timeupdate handler always has the latest.
  const currentEpRef = useRef(currentEp);
  useEffect(() => {
    currentEpRef.current = currentEp;
  });

  // Setup HLS or MP4 source whenever the episode (or URL) changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Tear down any previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.removeAttribute('src');
    video.load();

    if (!streamUrl) {
      // No stream — placeholder UI is rendered below.
      return;
    }

    const handleLoadedMetadata = () => {
      const dur = video.duration;
      if (dur && !isNaN(dur)) setDuration(dur);
      setIsLoading(false);
      // Autoplay attempt (may be blocked by browser policies)
      video.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    };
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      const dur = video.duration;
      if (!dur || isNaN(dur)) return;
      const progress = (video.currentTime / dur) * 100;
      const now = Date.now();
      if (now - lastSaveRef.current > 5000 && progress > 2 && progress < 100) {
        lastSaveRef.current = now;
        onMarkWatchedRef.current(currentEpRef.current, progress);
      }
    };
    const handleProgress = () => {
      try {
        if (video.buffered && video.buffered.length > 0) {
          setBuffered(video.buffered.end(video.buffered.length - 1));
        }
      } catch {
        // ignore
      }
    };
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);
    const handleCanPlay = () => setIsLoading(false);
    const handleEnded = () => {
      setPlaying(false);
      onMarkWatchedRef.current(currentEpRef.current, 100);
    };
    const handleErrorEvt = () => {
      setError(t('watch.loadStreamError'));
      setIsLoading(false);
      setPlaying(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleErrorEvt);

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          enableWorker: true,
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError('Stream error: ' + (data.details || 'unknown'));
              setIsLoading(false);
              setPlaying(false);
              hls.destroy();
              hlsRef.current = null;
              break;
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS support
        video.src = streamUrl;
        video.load();
      } else {
        setError(t('watch.hlsUnsupported'));
        setIsLoading(false);
      }
    } else {
      // Regular MP4 / direct video
      video.src = streamUrl;
      video.load();
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleErrorEvt);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
    // Re-run when episode id or stream URL changes.
  }, [currentEp.id, streamUrl, isHls]);

  // Sync volume / muted state to the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume]);

  // Sync playback rate
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = playbackRate;
  }, [playbackRate]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || error) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [streamUrl, error]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration;
    if (!dur || isNaN(dur)) return;
    video.currentTime = Math.max(0, Math.min(dur, time));
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    seek((video.currentTime ?? 0) + delta);
  }, [seek]);

  const seekToPercent = useCallback((pct: number) => {
    const video = videoRef.current;
    if (!video || !video.duration || isNaN(video.duration)) return;
    seek(video.duration * (pct / 100));
  }, [seek]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const nextEp = anime.episodes.find((e) => e.number === currentEp.number + 1);
  const prevEp = anime.episodes.find((e) => e.number === currentEp.number - 1);

  const switchEp = useCallback((ep: EpisodeData) => {
    const video = videoRef.current;
    if (video && video.duration && !isNaN(video.duration)) {
      const progress = (video.currentTime / video.duration) * 100;
      if (progress > 2 && progress < 100) {
        onMarkWatchedRef.current(currentEpRef.current, progress);
      }
    }
    // Reset all per-episode state synchronously so the UI doesn't briefly
    // show the previous episode's timecode while the new stream loads.
    setError(null);
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setPlaying(false);
    setIsLoading(!!ep.streamUrl);
    lastSaveRef.current = 0;
    setCurrentEp(ep);
    setShowEpList(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          if (e.shiftKey) {
            if (prevEp) { e.preventDefault(); switchEp(prevEp); }
          } else {
            e.preventDefault();
            seekBy(-10);
          }
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            if (nextEp) { e.preventDefault(); switchEp(nextEp); }
          } else {
            e.preventDefault();
            seekBy(10);
          }
          break;
        case 'm':
          e.preventDefault();
          setMuted((m) => !m);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'l':
          e.preventDefault();
          setShowEpList((v) => !v);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, toggleFullscreen, seekBy, switchEp, prevEp, nextEp]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  const fmtTime = (s: number) => {
    if (!s || isNaN(s)) return '00:00';
    const total = Math.floor(s);
    const m = Math.floor(total / 60);
    const sec = total % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekToPercent(pct * 100);
  };

  const qualityLabel = isHls ? 'AUTO' : streamUrl ? 'MP4' : '—';

  return (
    <div className="flex flex-col max-h-dvh-96">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/60 bg-card/40">
        <button
          onClick={onClose}
          className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={t('watch.back')}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold truncate">
            {anime.title}
            <span className="text-muted-foreground font-normal"> · {t('watch.episodeN').replace('{n}', String(currentEp.number))}</span>
          </h2>
          <p className="text-xs text-muted-foreground truncate">
            {anime.titleJp} · {anime.studio}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-brand"
            onClick={() => onOpenDetail(anime.slug)}
            title={t('watch.viewDetail')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-brand" title={t('watch.download')}>
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-brand" title={t('watch.share')}>
            <Share2 className="h-4 w-4" />
          </Button>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={t('watch.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Player area */}
      <div ref={containerRef} className="relative bg-black aspect-video shrink-0">
        {streamUrl ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full"
            playsInline
            onClick={togglePlay}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-gradient-to-br from-zinc-900 to-black">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-white/80 text-sm font-medium">{t('watch.streamUnavailable')}</p>
            <p className="text-white/50 text-xs mt-1">{t('watch.streamUnavailableDesc')}</p>
          </div>
        )}

        {/* Loading spinner overlay */}
        {isLoading && streamUrl && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="h-12 w-12 text-brand animate-spin drop-shadow-lg" />
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-black/85">
            <AlertCircle className="h-12 w-12 text-red-500 mb-3" />
            <p className="text-white text-sm font-medium mb-1">{t('watch.playbackFailed')}</p>
            <p className="text-white/60 text-xs max-w-md">{error}</p>
          </div>
        )}

        {/* Center play/pause button (click anywhere on video) */}
        {streamUrl && !error && (
          <button
            onClick={togglePlay}
            className={cn(
              'absolute inset-0 flex items-center justify-center group',
              isLoading && 'pointer-events-none'
            )}
            aria-label={playing ? t('watch.pause') : t('watch.play')}
          >
            <div
              className={cn(
                'h-20 w-20 rounded-full bg-brand/90 backdrop-blur flex items-center justify-center shadow-2xl shadow-brand/40 transition-all duration-300',
                'group-hover:scale-110 group-hover:bg-brand',
                playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100 animate-pulse-glow'
              )}
            >
              {playing ? (
                <Pause className="h-8 w-8 fill-brand-foreground text-brand-foreground" />
              ) : (
                <Play className="h-8 w-8 fill-brand-foreground text-brand-foreground ml-1" />
              )}
            </div>
          </button>
        )}

        {/* Top-left EP badge */}
        <div className="absolute top-3 left-3 pointer-events-none">
          <Badge className="bg-brand text-brand-foreground border-0 text-xs font-bold">
            EP {currentEp.number}
          </Badge>
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-none">
          <Badge className="bg-black/80 backdrop-blur text-white border-0 text-xs font-bold">
            {qualityLabel}
          </Badge>
          {playing && (
            <Badge className="bg-red-500/90 text-white border-0 text-xs font-bold animate-pulse">
              ● LIVE
            </Badge>
          )}
        </div>

        {/* Bottom control bar */}
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-white/80 font-mono w-14">{fmtTime(currentTime)}</span>
            <div
              className="flex-1 relative group cursor-pointer h-3 flex items-center"
              onClick={handleProgressClick}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressPct)}
            >
              <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden relative">
                {/* Buffered */}
                <div
                  className="absolute inset-y-0 left-0 bg-white/30"
                  style={{ width: `${bufferedPct}%` }}
                />
                {/* Progress */}
                <div
                  className="absolute inset-y-0 left-0 bg-brand"
                  style={{ width: `${progressPct}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-3 w-3 rounded-full bg-brand shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
            <span className="text-xs text-white/80 font-mono w-14">{fmtTime(duration)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              disabled={!streamUrl || !!error}
              className="h-9 w-9 rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
              aria-label={playing ? t('watch.pause') : t('watch.play')}
            >
              {playing ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white ml-0.5" />}
            </button>

            {/* Volume control */}
            <div
              className="relative flex items-center"
              onMouseEnter={() => setShowVolume(true)}
              onMouseLeave={() => setShowVolume(false)}
            >
              <button
                onClick={() => setMuted((m) => !m)}
                className="h-9 w-9 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                aria-label={muted ? t('watch.unmute') : t('watch.mute')}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : volume < 0.5 ? (
                  <Volume1 className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              {showVolume && (
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    if (v > 0 && muted) setMuted(false);
                  }}
                  className="w-20 h-1 accent-brand ml-1 cursor-pointer"
                  aria-label="Volume"
                />
              )}
            </div>

            <button
              onClick={() => prevEp && switchEp(prevEp)}
              disabled={!prevEp}
              className="h-9 w-9 rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
              aria-label={t('watch.prevEpisode')}
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={() => nextEp && switchEp(nextEp)}
              disabled={!nextEp}
              className="h-9 w-9 rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
              aria-label={t('watch.nextEpisode')}
            >
              <SkipForward className="h-4 w-4" />
            </button>

            <div className="ml-auto flex items-center gap-2 text-xs text-white/80">
              <button
                onClick={() => setShowEpList((v) => !v)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded hover:bg-white/20 transition-colors',
                  showEpList && 'bg-white/20'
                )}
              >
                <List className="h-3.5 w-3.5" /> {t('watch.episode')}
              </button>
              <button
                onClick={() => setShowSettings((v) => !v)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded hover:bg-white/20 transition-colors',
                  showSettings && 'bg-white/20'
                )}
              >
                <Settings className="h-3.5 w-3.5" /> {qualityLabel}
              </button>
              <button
                className="h-8 w-8 rounded hover:bg-white/20 flex items-center justify-center"
                aria-label={t('watch.fullscreen')}
                onClick={toggleFullscreen}
              >
                <Maximize className="h-4 w-4" />
              </button>
              <KeyboardShortcuts />
            </div>
          </div>

          {/* Settings popover */}
          {showSettings && (
            <div className="absolute bottom-16 right-3 w-48 rounded-lg border border-white/20 bg-black/90 backdrop-blur-xl p-2 animate-fade-up">
              <div className="text-xs text-white/60 uppercase tracking-wide mb-1.5 px-1">
                {t('watch.quality')}
              </div>
              <div className="px-2 py-1.5 flex items-center justify-between text-xs">
                <span className="text-brand font-semibold">{qualityLabel}</span>
                <span className="text-white/50 text-xs">
                  {isHls ? t('watch.adaptiveHls') : streamUrl ? t('watch.directMp4') : t('watch.na')}
                </span>
              </div>
              <div className="h-px bg-white/10 my-1.5" />
              <div className="text-xs text-white/60 uppercase tracking-wide mb-1.5 px-1">
                {t('watch.speed')}
              </div>
              {['0.75x', '1x', '1.25x', '1.5x', '2x'].map((sp) => {
                const val = parseFloat(sp);
                const active = playbackRate === val;
                return (
                  <button
                    key={sp}
                    onClick={() => { setPlaybackRate(val); setShowSettings(false); }}
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-white/10',
                      active ? 'text-brand font-semibold' : 'text-white/80'
                    )}
                  >
                    <span>{sp}</span>
                    {active && <span className="text-brand">●</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Episode list popover */}
          {showEpList && (
            <div className="absolute bottom-16 left-3 w-64 max-h-72 rounded-lg border border-white/20 bg-black/90 backdrop-blur-xl p-2 animate-fade-up overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-xs text-white/60 uppercase tracking-wide">{t('watch.episodeList')}</span>
                <span className="text-xs text-white/60">{t('common.epCount').replace('{n}', String(anime.episodes.length))}</span>
              </div>
              <ScrollArea className="flex-1 scrollbar-anichin">
                <div className="grid grid-cols-1 gap-0.5">
                  {anime.episodes.map((ep) => (
                    <button
                      key={ep.id}
                      onClick={() => switchEp(ep)}
                      className={cn(
                        'flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-white/10 text-left',
                        ep.number === currentEp.number ? 'bg-brand/20 text-brand font-semibold' : 'text-white/80'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-mono w-6">EP{ep.number}</span>
                        <span className="truncate">{timeAgo(ep.releasedAt, t)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        {ep.streamUrl ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title={t('watch.streamAvailable')} />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-white/20" title={t('watch.streamUnavailableShort')} />
                        )}
                        {ep.number === currentEp.number && <span className="text-brand">▶</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>

      {/* Bottom info bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-card/40 border-t border-border/60 text-xs">
        <Badge variant="secondary" className="bg-brand/15 text-brand border-brand/30">
          {anime.type}
        </Badge>
        <span className="text-muted-foreground">
          {t('watch.scoreViewsDuration').replace('{score}', anime.score.toFixed(1)).replace('{views}', formatViews(anime.views)).replace('{duration}', anime.duration ?? '—')}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {prevEp ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs hover:text-brand"
              onClick={() => switchEp(prevEp)}
            >
              <ChevronLeft className="h-3 w-3" /> EP {prevEp.number}
            </Button>
          ) : null}
          {nextEp ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs hover:text-brand"
              onClick={() => switchEp(nextEp)}
            >
              EP {nextEp.number} <ChevronRight className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Episode comments */}
      <div className="px-4 py-3 border-t border-border/60 bg-card/40">
        <EpisodeComments
          animeSlug={anime.slug}
          episodeNumber={currentEp.number}
          animeTitle={anime.title}
        />
      </div>
    </div>
  );
}

function KeyboardShortcuts() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const shortcuts: { key: string; descKey: string }[] = [
    { key: 'Space / K', descKey: 'watch.kbdPlayPause' },
    { key: '← / →', descKey: 'watch.kbdSeek' },
    { key: 'Shift + ← / →', descKey: 'watch.kbdEpisode' },
    { key: 'M', descKey: 'watch.kbdMute' },
    { key: 'F', descKey: 'watch.kbdFullscreen' },
    { key: 'L', descKey: 'watch.kbdOpenList' },
    { key: 'Esc', descKey: 'watch.kbdClose' },
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-8 w-8 rounded hover:bg-white/20 flex items-center justify-center transition-colors',
          open && 'bg-white/20'
        )}
        aria-label={t('watch.kbdShortcuts')}
        title={t('watch.kbdShortcuts')}
      >
        <Keyboard className="h-4 w-4 text-white" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-10 right-0 w-64 rounded-lg border border-white/20 bg-black/95 backdrop-blur-xl p-3 animate-fade-up z-50 shadow-2xl">
            <div className="text-xs text-white/60 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Keyboard className="h-3 w-3" /> {t('watch.kbdShortcutsTitle')}
            </div>
            <div className="space-y-1.5">
              {shortcuts.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/70">{t(s.descKey)}</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/90 font-mono text-xs whitespace-nowrap">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
