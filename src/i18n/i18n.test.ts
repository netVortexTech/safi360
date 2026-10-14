import en from './en.json';
import sw from './sw.json';

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? flatten(v as Record<string, unknown>, key) : [key];
  });
}

describe('i18n catalogues', () => {
  it('sw and en have exactly the same keys', () => {
    const swKeys = flatten(sw).sort();
    const enKeys = flatten(en).sort();
    expect(swKeys).toEqual(enKeys);
  });
  it('no empty strings', () => {
    for (const [name, cat] of [
      ['sw', sw],
      ['en', en],
    ] as const) {
      const empty = flatten(cat).filter((k) => {
        const v = k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], cat);
        return typeof v === 'string' && v.trim() === '';
      });
      expect(empty, `${name} has empty strings`).toEqual([]);
    }
  });
});
