import getUtf8ByteLength from './get-utf8-byte-length';

test('counts UTF-8 bytes rather than JavaScript code units', () => {
  expect(getUtf8ByteLength('abc')).toBe(3);
  expect(getUtf8ByteLength('台灣')).toBe(6);
  expect(getUtf8ByteLength('😀')).toBe(4);
});
