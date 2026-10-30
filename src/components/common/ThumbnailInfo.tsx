'use client';

import { Box, Typography } from '@mui/material';
import { formatSize } from '@/lib/utils';
import type { ThumbnailMetadata } from '@/lib/thumbrella';

const KIND_LABELS: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
  vector: 'Vector',
  geometry: '3D model',
  archive: 'Archive',
  text: 'Text',
  binary: 'Binary',
  unknown: 'File',
};

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return minutes > 0 ? `${minutes}:${String(remaining).padStart(2, '0')}` : `${remaining}s`;
}

function numberProperty(properties: Record<string, unknown>, name: string): number | null {
  const value = properties[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metadataRows(metadata: ThumbnailMetadata): [string, string][] {
  const media = metadata.media;
  if (!media) return [];

  const properties = (media.properties ?? {}) as Record<string, unknown>;
  const rows: [string, string][] = [];

  const kind = KIND_LABELS[media.kind ?? 'unknown'] ?? media.kind;
  const extension = media.extension?.toUpperCase();
  if (kind) rows.push(['Type', extension ? `${kind} · ${extension}` : kind]);

  const width = numberProperty(properties, 'width');
  const height = numberProperty(properties, 'height');
  if (width && height) rows.push(['Dimensions', `${width} × ${height} px`]);

  const duration = numberProperty(properties, 'duration');
  if (duration) rows.push(['Duration', formatDuration(duration)]);

  const pages = numberProperty(properties, 'pages');
  if (pages) rows.push(['Pages', String(pages)]);

  const channels = numberProperty(properties, 'channels');
  if (channels) rows.push(['Channels', String(channels)]);

  const bitDepth = numberProperty(properties, 'bpp');
  if (bitDepth) rows.push(['Colour', `${bitDepth}-bit`]);

  if (typeof media.fileSize === 'number' && media.fileSize > 0) {
    rows.push(['Size', formatSize(media.fileSize)]);
  }

  if (media.mime) rows.push(['MIME', media.mime]);

  const flags = [
    Number(properties.alpha) === 1 ? 'alpha channel' : null,
    Number(properties.lossless) === 1 ? 'lossless' : null,
  ].filter(Boolean);
  if (flags.length) rows.push(['Details', flags.join(', ')]);

  return rows;
}

interface Props {
  metadata: ThumbnailMetadata | null;
}

export function ThumbnailInfo({ metadata }: Props) {
  if (!metadata) return null;

  if (metadata.status && metadata.status !== 'success') {
    return (
      <Box sx={{ px: 1.25, py: 1, width: '100%' }}>
        <Typography variant="caption" color="text.secondary">
          {metadata.message || `Thumbnail ${metadata.status}.`}
        </Typography>
      </Box>
    );
  }

  const rows = metadataRows(metadata);
  if (!rows.length) return null;

  return (
    <Box sx={{ px: 1.25, py: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {label}
          </Typography>
          <Typography
            variant="caption"
            sx={{ fontFamily: 'monospace', fontSize: '0.7rem', textAlign: 'right', overflowWrap: 'anywhere' }}
          >
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
