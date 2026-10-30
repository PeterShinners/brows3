'use client';

import { useEffect, useState } from 'react';
import { objectApi } from '@/lib/tauri';
import { useProfileStore } from '@/store/profileStore';

// Presigned URLs are valid for an hour; refresh them well before they expire.
const URL_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_URLS = 500;
const MAX_IN_FLIGHT = 6;

interface CachedUrl {
  url: string;
  expiresAt: number;
}

const urlCache = new Map<string, CachedUrl>();
const inFlight = new Map<string, Promise<string>>();
const waiting: (() => void)[] = [];
let running = 0;

function cacheKey(profileId: string, bucket: string, region: string | undefined, key: string): string {
  return [profileId, bucket, region ?? '', key].join('\u0000');
}

function readCached(id: string): string | null {
  const hit = urlCache.get(id);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    urlCache.delete(id);
    return null;
  }
  return hit.url;
}

function remember(id: string, url: string) {
  urlCache.set(id, { url, expiresAt: Date.now() + URL_TTL_MS });
  while (urlCache.size > MAX_CACHED_URLS) {
    const oldest = urlCache.keys().next().value;
    if (oldest === undefined) break;
    urlCache.delete(oldest);
  }
}

// Signing is local, but the queue keeps a fast scroll from flooding the IPC bridge.
function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running += 1;
      task().then(resolve, reject).finally(() => {
        running -= 1;
        waiting.shift()?.();
      });
    };
    if (running < MAX_IN_FLIGHT) run();
    else waiting.push(run);
  });
}

function requestUrl(bucket: string, region: string | undefined, key: string, id: string): Promise<string> {
  const existing = inFlight.get(id);
  if (existing) return existing;

  const request = schedule(() => objectApi.getPresignedUrl(bucket, region, key))
    .then((url) => {
      remember(id, url);
      return url;
    })
    .finally(() => { inFlight.delete(id); });

  inFlight.set(id, request);
  return request;
}

/**
 * Presigned object URL for a Thumbrella thumbnail, or null while unavailable.
 * Requests only happen for mounted rows, and URLs are cached across scrolling.
 */
export function useObjectThumbnailUrl(
  bucket: string | undefined,
  region: string | undefined,
  key: string,
  enabled: boolean
): string | null {
  // Subscribing here keeps a row from showing a previous profile's thumbnail,
  // even when the memoized row would otherwise skip the parent's update.
  const profileId = useProfileStore((state) => state.activeProfileId) ?? '';
  const id = enabled && bucket ? cacheKey(profileId, bucket, region, key) : null;
  const [, setRevision] = useState(0);

  useEffect(() => {
    if (!id || !bucket || readCached(id)) return;

    let cancelled = false;
    const rerender = () => { if (!cancelled) setRevision((revision) => revision + 1); };
    requestUrl(bucket, region, key, id).then(rerender, rerender);

    return () => { cancelled = true; };
  }, [id, bucket, region, key]);

  return id ? readCached(id) : null;
}
