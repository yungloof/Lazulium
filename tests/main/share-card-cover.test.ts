import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { useTempUserData } from '../helpers/electron-mock';
import { makeGame } from '../helpers/fixtures';
import {
  bufferToDataUrl,
  collectCoverCandidates,
  resolveShareCardCoverDataUrl,
  sniffImageMime
} from '../../src/main/services/profile/share-card-cover';
import { mediaUrl, resolveMediaFilePath } from '../../src/main/services/metadata/media-cache.service';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP'), Buffer.from('VP8 ')]);
const GIF_BYTES = Buffer.from('GIF89a\x01\x00\x01\x00');

describe('shareCardCover MIME sniffing & data URL conversion', () => {
  it('identifica PNG, JPEG, WebP e GIF pelos magic bytes e rejeita lixo', () => {
    expect(sniffImageMime(PNG_BYTES)).toBe('image/png');
    expect(sniffImageMime(JPG_BYTES)).toBe('image/jpeg');
    expect(sniffImageMime(WEBP_BYTES)).toBe('image/webp');
    expect(sniffImageMime(GIF_BYTES)).toBe('image/gif');
    expect(sniffImageMime(Buffer.from('not an image'))).toBeNull();
    expect(bufferToDataUrl(Buffer.from('<html>erro</html>'), 'text/html')).toBeNull();

    const dataUrl = bufferToDataUrl(PNG_BYTES);
    expect(dataUrl).toBe(`data:image/png;base64,${PNG_BYTES.toString('base64')}`);
  });
});

describe('collectCoverCandidates & resolveShareCardCoverDataUrl', () => {
  it('ordena coverUrl antes de coverSourceUrl, publicCoverUrl e heroUrl entre edições', () => {
    const primary = makeGame({
      id: 'epic-fn',
      platform: 'epic',
      title: 'Fortnite',
      media: {
        coverUrl: 'lazulium-media://media/epic-fn/cover.png',
        publicCoverUrl: 'https://images.igdb.com/cover.jpg',
        heroUrl: 'lazulium-media://media/epic-fn/hero.png'
      }
    });
    const secondary = makeGame({
      id: 'steam-fn',
      platform: 'steam',
      title: 'Fortnite',
      media: {
        coverUrl: 'https://cdn.example.com/steam-cover.jpg',
        heroUrl: 'lazulium-media://media/epic-fn/hero.png'
      }
    });

    expect(collectCoverCandidates([primary, secondary])).toEqual([
      'lazulium-media://media/epic-fn/cover.png',
      'https://cdn.example.com/steam-cover.jpg',
      'https://images.igdb.com/cover.jpg',
      'lazulium-media://media/epic-fn/hero.png'
    ]);
  });

  it('lê capa local em lazulium-media:// usando resolveMediaFilePath e converte para data URL', async () => {
    const userData = useTempUserData();
    const artworkDir = join(userData, 'artwork', 'epic-fn');
    mkdirSync(artworkDir, { recursive: true });
    writeFileSync(join(artworkDir, 'cover.webp'), WEBP_BYTES);

    const url = mediaUrl('media', 'epic-fn/cover.webp');
    expect(await resolveMediaFilePath(url)).toBe(join(artworkDir, 'cover.webp'));
    expect(await resolveMediaFilePath('lazulium-media://media/../../etc/passwd')).toBeUndefined();

    const game = makeGame({
      id: 'epic-fn',
      platform: 'epic',
      title: 'Fortnite',
      media: { coverUrl: url }
    });

    const dataUrl = await resolveShareCardCoverDataUrl(['epic-fn'], { getGame: () => game });
    expect(dataUrl).toBe(`data:image/webp;base64,${WEBP_BYTES.toString('base64')}`);
  });

  it('faz fallback para https:// via fetchRemote quando a capa local falha', async () => {
    const game = makeGame({
      id: 'epic-fn',
      platform: 'epic',
      title: 'Fortnite',
      media: {
        coverUrl: 'lazulium-media://media/epic-fn/missing.png',
        publicCoverUrl: 'https://cdn.example.com/fortnite.jpg'
      }
    });
    const fetchRemote = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => JPG_BYTES.buffer.slice(JPG_BYTES.byteOffset, JPG_BYTES.byteOffset + JPG_BYTES.byteLength)
    }));

    const dataUrl = await resolveShareCardCoverDataUrl(['epic-fn'], {
      getGame: () => game,
      resolveLocalPath: async () => undefined,
      fetchRemote
    });

    expect(fetchRemote).toHaveBeenCalledWith('https://cdn.example.com/fortnite.jpg');
    expect(dataUrl).toBe(`data:image/jpeg;base64,${JPG_BYTES.toString('base64')}`);
  });
});
