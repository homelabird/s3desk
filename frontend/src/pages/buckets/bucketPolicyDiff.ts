export function unifiedDiff(fromText: string, toText: string): string {
  if (fromText.trim() === "" && toText.trim() === "") return " (no changes)";
  const a = fromText.split("\n");
  const b = toText.split("\n");

  const out: string[] = [];
  let prefixLength = 0;
  while (prefixLength < a.length && prefixLength < b.length && a[prefixLength] === b[prefixLength]) {
    out.push(` ${a[prefixLength]}`);
    prefixLength++;
  }
  let suffixLength = 0;
  while (
    suffixLength < a.length - prefixLength
    && suffixLength < b.length - prefixLength
    && a[a.length - suffixLength - 1] === b[b.length - suffixLength - 1]
  ) suffixLength++;

  const aEnd = a.length - suffixLength;
  const bEnd = b.length - suffixLength;
  let aIndex = prefixLength;
  let bIndex = prefixLength;
  for (const commonLine of longestCommonSubsequence(a.slice(prefixLength, aEnd), b.slice(prefixLength, bEnd))) {
    while (a[aIndex] !== commonLine) {
      out.push(`-${a[aIndex++]}`);
    }
    while (b[bIndex] !== commonLine) {
      out.push(`+${b[bIndex++]}`);
    }
    out.push(` ${commonLine}`);
    aIndex++;
    bIndex++;
  }
  while (aIndex < aEnd) out.push(`-${a[aIndex++]}`);
  while (bIndex < bEnd) out.push(`+${b[bIndex++]}`);
  for (let i = aEnd; i < a.length; i++) out.push(` ${a[i]}`);

  return out.join("\n");
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  if (a.length === 0 || b.length === 0) return [];
  if (a.length === 1) return b.includes(a[0]) ? [a[0]] : [];
  if (b.length === 1) return a.includes(b[0]) ? [b[0]] : [];

  const middle = Math.floor(a.length / 2);
  const leftA = a.slice(0, middle);
  const rightA = a.slice(middle);
  const leftLengths = lcsPrefixLengths(leftA, b);
  const rightLengths = lcsSuffixLengths(rightA, b);
  let split = 0;
  for (let i = 1; i <= b.length; i++) {
    if (leftLengths[i] + rightLengths[i] > leftLengths[split] + rightLengths[split]) split = i;
  }

  return [
    ...longestCommonSubsequence(leftA, b.slice(0, split)),
    ...longestCommonSubsequence(rightA, b.slice(split)),
  ];
}

function lcsPrefixLengths(a: string[], b: string[]): Uint32Array {
  let previous = new Uint32Array(b.length + 1);
  let current = new Uint32Array(b.length + 1);
  for (const line of a) {
    for (let j = 1; j <= b.length; j++) {
      current[j] = line === b[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  return previous;
}

function lcsSuffixLengths(a: string[], b: string[]): Uint32Array {
  let previous = new Uint32Array(b.length + 1);
  let current = new Uint32Array(b.length + 1);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      current[j] = a[i] === b[j]
        ? previous[j + 1] + 1
        : Math.max(previous[j], current[j + 1]);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  return previous;
}

export function hasUnifiedDiffChanges(fromText: string, toText: string) {
  return fromText.trimEnd() !== toText.trimEnd();
}

export function getUnifiedDiffStats(diffText: string) {
  if (diffText === " (no changes)") return { added: 0, removed: 0 };
  let added = 0;
  let removed = 0;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }
  return { added, removed };
}

export function getVisibleUnifiedDiff(diffText: string, showDiffContext: boolean) {
  if (diffText === " (no changes)" || showDiffContext) return diffText;
  const changedOnly = diffText
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .join("\n");
  return changedOnly || " (no changes)";
}
