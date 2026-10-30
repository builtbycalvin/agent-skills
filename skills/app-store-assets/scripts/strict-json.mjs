import { TextDecoder } from 'node:util';

const fail = message => { throw new Error(message); };

// JSON.parse accepts duplicate fields. Reject them before accepting identity data.
export function parseJSON(bytes) {
  const source = typeof bytes === 'string' ? bytes : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let i = 0;
  const whitespace = () => { while (/[\t\n\r ]/.test(source[i] ?? '\0')) i++; };
  const string = () => {
    const start = i++;
    while (i < source.length) {
      if (source[i] === '\\') { i += 2; continue; }
      if (source[i++] === '"') return JSON.parse(source.slice(start, i));
    }
    fail('Unterminated JSON string');
  };
  const value = () => {
    whitespace();
    if (source[i] === '"') return string();
    if (source[i] === '{') {
      i++;
      const result = Object.create(null);
      whitespace();
      if (source[i] === '}') { i++; return result; }
      while (true) {
        whitespace();
        if (source[i] !== '"') fail('Expected JSON field');
        const key = string();
        if (Object.hasOwn(result, key)) fail(`Duplicate JSON field: ${key}`);
        whitespace();
        if (source[i++] !== ':') fail('Expected JSON colon');
        result[key] = value();
        whitespace();
        const separator = source[i++];
        if (separator === '}') return result;
        if (separator !== ',') fail('Expected JSON object separator');
      }
    }
    if (source[i] === '[') {
      i++;
      const result = [];
      whitespace();
      if (source[i] === ']') { i++; return result; }
      while (true) {
        result.push(value());
        whitespace();
        const separator = source[i++];
        if (separator === ']') return result;
        if (separator !== ',') fail('Expected JSON array separator');
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(i));
    if (!token) fail('Invalid JSON value');
    i += token[0].length;
    return JSON.parse(token[0]);
  };
  const result = value();
  whitespace();
  if (i !== source.length) fail('Unexpected trailing JSON content');
  return result;
}
