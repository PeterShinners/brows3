'use client';

import { memo } from 'react';
import type { CSSProperties, DetailedHTMLProps, HTMLAttributes } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { useThumbnailMetadata } from '@/hooks/useThumbnailMetadata';
import { ThumbnailInfo } from './ThumbnailInfo';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- React 19 declares JSX types on the react module.
  namespace JSX {
    interface IntrinsicElements {
      'tbr-thumb': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
      };
    }
  }
}

// Thumbrella thumbnails are always 5:4. The icon column leaves a 32px gutter
// between the folder icons and the name text, so 32x25.6 is the largest size
// that fits; the small negative margin keeps a 2px gap before the file name.
const THUMBNAIL_WIDTH = 32;
const THUMBNAIL_HEIGHT = 25.6;

const THUMBNAIL_STYLE: CSSProperties = {
  width: THUMBNAIL_WIDTH,
  height: THUMBNAIL_HEIGHT,
  display: 'block',
  borderRadius: 2,
};

const TRIGGER_STYLE: CSSProperties = {
  width: THUMBNAIL_WIDTH,
  height: THUMBNAIL_HEIGHT,
  display: 'block',
  marginLeft: -2,
};

export const PREVIEW_WIDTH = 250;
export const PREVIEW_HEIGHT = 200;

// Distance from the trigger thumbnail so the card clears the file name column.
const PREVIEW_OFFSET_X = 200;

const PREVIEW_STYLE: CSSProperties = {
  width: PREVIEW_WIDTH,
  height: PREVIEW_HEIGHT,
  display: 'block',
};

/** Full-size Thumbbrella thumbnail, used by the hover preview and the preview dialog. */
export const ThumbnailImage = memo(function ThumbnailImage({ src, alt }: { src: string; alt: string }) {
  return <tbr-thumb src={src} alt={alt} style={PREVIEW_STYLE} />;
});

/** Mounted only while the preview is open, so metadata is fetched on demand. */
function ThumbnailPreview({ src, alt }: { src: string; alt: string }) {
  const metadata = useThumbnailMetadata(src);

  return (
    <Box
      sx={{
        width: PREVIEW_WIDTH,
        bgcolor: 'background.paper',
        color: 'text.primary',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <ThumbnailImage src={src} alt={alt} />
      <ThumbnailInfo metadata={metadata} />
    </Box>
  );
}

/** Only rendered while Thumbrella is configured, so previews are opt-in. */
export const ObjectThumbnail = memo(function ObjectThumbnail({
  src,
  alt,
  open,
  onMouseEnter,
  onMouseLeave,
}: {
  src: string;
  alt: string;
  open: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <Tooltip
      open={open}
      title={<ThumbnailPreview src={src} alt={alt} />}
      placement="right"
      disableInteractive
      slotProps={{
        popper: {
          // Push the card clear of the file name and the size/date columns.
          popperOptions: { modifiers: [{ name: 'offset', options: { offset: [0, PREVIEW_OFFSET_X] } }] },
        },
        tooltip: {
          sx: { p: 0, bgcolor: 'transparent', maxWidth: 'none', boxShadow: 3 },
        },
      }}
    >
      <span style={TRIGGER_STYLE} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <tbr-thumb className="tbr-list-thumb" src={src} alt={alt} style={THUMBNAIL_STYLE} />
      </span>
    </Tooltip>
  );
});
