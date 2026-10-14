import { brandStyle, hexToChannels } from './brand';

describe('tenant brand colour', () => {
  it('parses hex to channels', () => {
    expect(hexToChannels('#0E7C7B')).toBe('14 124 123');
    expect(hexToChannels('0e7c7b')).toBe('14 124 123');
    expect(hexToChannels('teal')).toBeNull();
    expect(hexToChannels(undefined)).toBeNull();
  });

  it('uses white text on dark brands', () => {
    expect(brandStyle('#13293D')).toMatchObject({
      '--brand': '19 41 61',
      '--brand-foreground': '255 255 255',
    });
  });

  it('uses navy text on light brands', () => {
    expect(brandStyle('#F2A93B')).toMatchObject({
      '--brand': '242 169 59',
      '--brand-foreground': '19 41 61',
    });
  });

  it('falls back when neither foreground is readable', () => {
    // mid grey has < 4.5:1 against both white and navy
    expect(brandStyle('#8A8A8A')).toBeUndefined();
  });
});
