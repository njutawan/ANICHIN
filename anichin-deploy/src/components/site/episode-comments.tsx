'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useUIStore } from '@/lib/store';
import { sanitizeDisplayName, sanitizeComment } from '@/lib/security';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThumbsUp, Trash2, MessageSquare, Send } from 'lucide-react';
import { timeAgo } from '@/lib/types';
import { useMounted } from '@/hooks/use-mounted';

interface EpisodeCommentsProps {
  animeSlug: string;
  episodeNumber: number;
  animeTitle: string;
}

export function EpisodeComments({ animeSlug, episodeNumber, animeTitle }: EpisodeCommentsProps) {
  const mounted = useMounted();
  const allComments = useUIStore((s) => s.episodeComments);
  const addComment = useUIStore((s) => s.addEpisodeComment);
  const likeComment = useUIStore((s) => s.likeEpisodeComment);
  const deleteComment = useUIStore((s) => s.deleteEpisodeComment);

  const [name, setName] = useState('');
  const [comment, setComment] = useState('');

  const episodeComments = mounted
    ? allComments.filter((c) => c.animeSlug === animeSlug && c.episodeNumber === episodeNumber)
    : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    // Sanitize user input before storing
    const sanitizedName = sanitizeDisplayName(name);
    const sanitizedComment = sanitizeComment(comment);
    addComment({
      animeSlug,
      episodeNumber,
      name: sanitizedName,
      comment: sanitizedComment,
    });
    toast.success('Komentar terkirim');
    setComment('');
    setName('');
  };

  return (
    <div className="space-y-3">
      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="space-y-2 p-3 rounded-lg border border-border/60 bg-card/40">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" /> Komentar Episode {episodeNumber}
        </div>
        <Input
          placeholder="Nama (opsional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 text-sm"
          maxLength={30}
        />
        <Textarea
          placeholder={`Bagikan pendapatmu tentang ${animeTitle} EP ${episodeNumber}…`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="text-sm min-h-[70px] resize-none"
          maxLength={300}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{comment.length}/300</span>
          <Button
            type="submit"
            disabled={!comment.trim()}
            size="sm"
            className="bg-brand text-brand-foreground hover:bg-brand/90 disabled:opacity-40"
          >
            <Send className="h-3 w-3 mr-1" /> Kirim
          </Button>
        </div>
      </form>

      {/* Comments list */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Komentar ({episodeComments.length})
        </div>
        {episodeComments.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg">
            <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-30" />
            Belum ada komentar. Kasih komentar pertama!
          </div>
        ) : (
          <ScrollArea className="max-h-[200px] scrollbar-anichin pr-2">
            <div className="space-y-2">
              {episodeComments.map((c) => (
                <div
                  key={c.id}
                  className="p-2.5 rounded-lg border border-border/60 bg-card/40 hover:border-border transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand to-amber-600 flex items-center justify-center font-bold text-brand-foreground text-xs shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                      </div>
                      <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap">{c.comment}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <button
                          onClick={() => likeComment(c.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-brand transition-colors"
                        >
                          <ThumbsUp className="h-3 w-3" /> {c.likes > 0 ? c.likes : 'Suka'}
                        </button>
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3 w-3" /> Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
