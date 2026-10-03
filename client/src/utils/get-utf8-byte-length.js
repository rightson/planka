export default (value) => new TextEncoder().encode(value).byteLength;
