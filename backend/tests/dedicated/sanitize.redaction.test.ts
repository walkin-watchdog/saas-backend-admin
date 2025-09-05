import { sanitize } from '../../src/utils/sanitize';

describe('sanitize()', () => {
  test('redacts DSN & password query params', () => {
    const msg = 'connect failed: postgresql://user:secret@db:5432/app?password=supersecret';
    const red = sanitize(msg);
    expect(red).not.toMatch(/secret/);
    expect(red).toMatch(/postgresql:\/\/<redacted>/);
    expect(red).not.toMatch(/password=/i);
    expect(red).not.toMatch(/supersecret/);
  });

  test('redacts nested structures', () => {
    const obj = {
      err: new Error('url=postgres://u:pw@h/db?password=foo'),
      arr: ['postgresql://u:p@h/db', 'ok'],
    };
    const out = sanitize(obj);
    expect(out.err.message).not.toMatch(/u:p@/);
    expect(out.arr[0]).toMatch(/<redacted>/);
  });
});