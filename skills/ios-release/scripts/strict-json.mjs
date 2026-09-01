export function duplicateJsonKeys(raw) {
  const duplicates = new Set();
  const stack = [];
  let stringStart = -1;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (stringStart >= 0) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') {
        let next = index + 1;
        while (/\s/.test(raw[next] ?? '')) next += 1;
        const frame = stack.at(-1);
        if (frame?.type === 'object' && raw[next] === ':') {
          const key = JSON.parse(raw.slice(stringStart, index + 1));
          if (frame.keys.has(key)) duplicates.add(key);
          else frame.keys.add(key);
        }
        stringStart = -1;
      }
    } else if (character === '"') stringStart = index;
    else if (character === '{') stack.push({ type: 'object', keys: new Set() });
    else if (character === '[') stack.push({ type: 'array' });
    else if (character === '}' || character === ']') stack.pop();
  }
  return [...duplicates];
}

export function parseUniqueJson(raw) {
  const value = JSON.parse(raw);
  const duplicate = duplicateJsonKeys(raw)[0];
  if (duplicate !== undefined) {
    const error = new Error(`duplicate JSON object key ${JSON.stringify(duplicate)}`);
    error.code = 'DUPLICATE_JSON_KEY';
    throw error;
  }
  return value;
}
