'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { fetchThreadNotes, postPhraseNote } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { timeAgo } from '@/lib/utils';
import type { ThreadPhraseNote } from '@/lib/types';

export default function ThreadDetailPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const { id: crewId, threadId } = use(params);
  const supabase = createClient();
  const { user } = useAuth();
  const [notes, setNotes] = useState<ThreadPhraseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchThreadNotes(supabase, threadId);
      setNotes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, threadId]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!user) { toast.error('Please sign in'); return; }

    setUploading(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const description = prompt('Add a description (optional):') || '';
      await postPhraseNote(supabase, threadId, json, description);
      toast.success('PhraseNote uploaded!');
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invalid JSON file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/crews/${crewId}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to Crew
          </Link>
          <h1 className="text-2xl font-bold mt-1">Song Thread</h1>
        </div>
        {user && (
          <Button disabled={uploading} onClick={() => document.getElementById('phrasenote-upload')?.click()}>
            {uploading ? 'Uploading...' : '📎 Upload PhraseNote'}
            <input
              id="phrasenote-upload"
              type="file"
              accept=".json,.mct"
              className="hidden"
              onChange={handleFileUpload}
            />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No PhraseNotes yet. Upload the first one!
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={note.profile?.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs bg-primary/20 text-primary">
                      {(note.profile?.displayName ?? '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {note.profile?.displayName ?? 'Unknown'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(note.createdAt)}
                      </span>
                    </div>
                    {note.description && (
                      <p className="text-sm mt-1">{note.description}</p>
                    )}
                    {/* PhraseNote preview */}
                    <div className="mt-2 p-3 rounded-md bg-secondary text-sm">
                      <div className="flex gap-4 flex-wrap text-muted-foreground">
                        {'bpm' in note.phraseNoteData && note.phraseNoteData.bpm != null && (
                          <span>BPM: {String(note.phraseNoteData.bpm)}</span>
                        )}
                        {'danceStyle' in note.phraseNoteData && note.phraseNoteData.danceStyle != null && (
                          <span className="capitalize">
                            Style: {String(note.phraseNoteData.danceStyle)}
                          </span>
                        )}
                        {'phrases' in note.phraseNoteData && Array.isArray(note.phraseNoteData.phrases) && (
                          <span>
                            Phrases: {(note.phraseNoteData.phrases as unknown[]).length}
                          </span>
                        )}
                      </div>
                      <Badge variant="secondary" className="mt-2 text-xs">
                        JSON Data
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
