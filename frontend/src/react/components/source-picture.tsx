import { useLayoutEffect, useRef, useState } from 'react';
import { coverUrl } from '@peach/card-art';
import { Button } from '@/components/base/buttons/button';
import { Note } from './note';
import type { JavDetail } from '../jav-detail/jav-detail';

/** URL of source pictures (samples, source covers, source avatars). The server fetches once and saves to disk, and what comes back is the image itself,
 *  which the browser caches by ETag and private freshness lifetime; `attempt` makes a retry use a different URL instead of reusing the one that just failed. */
export const javImageUrl = (code: string, image: string, attempt = 0): string =>
  `/jav-image?code=${encodeURIComponent(code)}&image=${encodeURIComponent(image)}${attempt ? `&attempt=${attempt}` : ''}`;

/** Source image: use the local cover if there is one, otherwise fetch through `/jav-image`. */
export function SourcePicture({ item, image, thumbnail = false }: {
  item: Pick<JavDetail, 'code' | 'has_cover' | 'source_image' | 'cover_url' | 'cover_version'>;
  image: string; thumbnail?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ src: string; alt: string } | null>(null);
  const [failed, setFailed] = useState('');
  const picture = useRef<HTMLImageElement>(null);
  const local = image === 'cover' && item.has_cover;
  const remote = !local && (image !== 'cover' || item.source_image);
  const alt = thumbnail ? '' : image === 'cover' ? `${item.code} cover` : `${item.code} preview ${Number(image) + 1}`;
  const src = remote ? javImageUrl(item.code, image, attempt) : local ? coverUrl(item, true) : item.cover_url || '';
  useLayoutEffect(() => {
    const node = picture.current;
    if (node?.complete && node.naturalWidth > 0) setLoaded({ src, alt });
  }, [src, alt]);
  if (!remote) {
    if (src) return <img ref={picture} data-jav-picture={thumbnail ? undefined : ''} src={src} alt={alt} referrerPolicy="no-referrer"
      onLoad={() => setLoaded({ src, alt })} />;
    return thumbnail ? <span>Preview unavailable</span> : <div data-jav-picture-wait=""><Note tone="neutral">Cover unavailable</Note></div>;
  }
  if (failed === src) {
    if (thumbnail) return <span>Preview unavailable</span>;
    return <div data-jav-picture-wait=""><Note tone="neutral"
      action={<Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Retry now</Button>}>
      Image unavailable</Note></div>;
  }
  const ready = loaded?.src === src;
  const reveal = async (node: HTMLImageElement) => {
    try { await node.decode() } catch { return }
    if (picture.current === node && node.getAttribute('src') === src) setLoaded({ src, alt });
  };
  return <>
    {ready || loaded ? null : thumbnail
      ? <span className="relative block h-full w-full skeleton-sheen" aria-label="Loading preview" />
      : <div data-jav-picture-wait="" data-skeleton="image" role="status" aria-label="Loading image"><span className="relative skeleton-sheen" /></div>}
    {!ready && loaded ? <img data-jav-picture={thumbnail ? undefined : ''} data-source-picture="" src={loaded.src}
      alt={loaded.alt} referrerPolicy="no-referrer" /> : null}
    <img ref={picture} data-jav-picture={thumbnail ? undefined : ''} data-source-picture="" src={src} alt={alt} referrerPolicy="no-referrer"
      hidden={!ready} onLoad={event => { void reveal(event.currentTarget) }} onError={() => setFailed(src)} />
  </>;
}
