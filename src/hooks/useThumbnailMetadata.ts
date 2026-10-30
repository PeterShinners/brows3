'use client';

import { useEffect, useState } from 'react';
import { getThumbrellaClient, type ThumbnailMetadata } from '@/lib/thumbrella';

/**
 * Format metadata for a thumbnail URL. The Thumbrella client caches results, so
 * repeated lookups for the same object do not hit the server again.
 */
export function useThumbnailMetadata(src: string | null): ThumbnailMetadata | null {
  const [resolved, setResolved] = useState<{ src: string; metadata: ThumbnailMetadata } | null>(null);

  useEffect(() => {
    if (!src) return;
    const client = getThumbrellaClient();
    if (!client?.thumb) return;

    let cancelled = false;
    client.thumb(src).then(
      (result) => { if (!cancelled) setResolved({ src, metadata: result ?? { status: 'failed' } }); },
      (error: unknown) => {
        if (!cancelled) {
          setResolved({ src, metadata: { status: 'failed', message: error instanceof Error ? error.message : String(error) } });
        }
      }
    );

    return () => { cancelled = true; };
  }, [src]);

  return src && resolved?.src === src ? resolved.metadata : null;
}
