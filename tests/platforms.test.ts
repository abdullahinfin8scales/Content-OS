import { describe, expect, it } from 'vitest';
import { BRANDS } from '../src/lib/brandCatalog';
import { builtinForHost, detectPlatform, parsePlatformUrl, siteDomain } from '../src/lib/platformDetect';
import { buildPlatformRegistry, platformInfo } from '../src/lib/platforms';

describe('platform detection', () => {
  const detect = (input: string) => detectPlatform(input, BRANDS)!;

  it('finds the brand logo and name from a link', () => {
    for (const [link, name] of [
      ['https://www.pinterest.com/someone/', 'Pinterest'],
      ['snapchat.com', 'Snapchat'],
      ['https://bsky.app/profile/me.bsky.social', 'Bluesky'],
      ['https://t.me/mychannel', 'Telegram'],
      ['https://discord.gg/abc123', 'Discord'],
      ['https://www.reddit.com/r/socialmedia', 'Reddit'],
      ['twitch.tv/streamer', 'Twitch'],
      ['https://someone.substack.com', 'Substack'],
      ['https://mastodon.social/@me', 'Mastodon'],
      ['https://music.youtube.com/channel/x', 'YouTube Music'],
    ] as const) {
      const d = detect(link);
      expect(d.name, link).toBe(name);
      expect(d.matched, link).toBe(true);
      expect(d.icon.kind, link).toBe('path');
      expect(d.builtin, link).toBeNull();
    }
  });

  it('knows post limits for some platforms', () => {
    expect(detect('https://bsky.app').limit).toBe(300);
    expect(detect('https://pinterest.com').limit).toBe(500);
    expect(detect('https://snapchat.com').limit).toBeNull();
  });

  it('recognises built-in platforms instead of adding duplicates', () => {
    expect(detect('https://www.instagram.com/me').builtin).toBe('instagram');
    expect(detect('https://twitter.com/me').builtin).toBe('x');
    expect(detect('youtu.be/abc').builtin).toBe('youtube');
    expect(builtinForHost('music.youtube.com')).toBeNull();
  });

  it('falls back to a letter badge for sites without a logo', () => {
    const d = detect('https://www.lemon8-app.com/me');
    expect(d.matched).toBe(false);
    expect(d.icon).toEqual({ kind: 'monogram', text: 'L' });
    expect(d.name).toBe('Lemon8 App');
    expect(d.domain).toBe('lemon8-app.com');
  });

  it('accepts a plain platform name', () => {
    const d = detect('Pinterest');
    expect(d.name).toBe('Pinterest');
    expect(d.url).toBe('');
    expect(d.icon.kind).toBe('path');
  });

  it('works without the logo catalogue', () => {
    const d = detectPlatform('https://bsky.app', null)!;
    expect(d.icon).toEqual({ kind: 'monogram', text: 'B' });
  });

  it('parses links and domains carefully', () => {
    expect(parsePlatformUrl('not a link')).toBeNull();
    expect(parsePlatformUrl('javascript:alert(1)')).toBeNull();
    expect(parsePlatformUrl('ftp://example.com')).toBeNull();
    expect(parsePlatformUrl('example.com/path')?.hostname).toBe('example.com');
    expect(siteDomain('www.bbc.co.uk')).toBe('bbc.co.uk');
    expect(siteDomain('user.substack.com')).toBe('substack.com');
  });
});

describe('platform registry', () => {
  it('lists built-ins first, then custom platforms by date added, and handles missing ids', () => {
    const reg = buildPlatformRegistry([
      { id: 'custom-b', name: 'B', url: '', domain: '', icon: { kind: 'monogram', text: 'B' }, limit: null, createdAt: 2, updatedAt: 2 },
      { id: 'custom-a', name: 'A', url: '', domain: '', icon: { kind: 'monogram', text: 'A' }, limit: 300, createdAt: 1, updatedAt: 1 },
    ]);
    expect(reg.list.map((p) => p.id).slice(-2)).toEqual(['custom-a', 'custom-b']);
    expect(platformInfo(reg, 'x').limit).toBe(280);
    expect(platformInfo(reg, 'custom-gone').name).toBe('Removed platform');
  });
});
