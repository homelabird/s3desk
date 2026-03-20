export function unifiedDiff(fromText: string, toText: string): string {
  const a = fromText.split("\n");
  const b = toText.split("\n");

  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const out: string[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      out.push(` ${a[i - 1]}`);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      out.push(`+${b[j - 1]}`);
      j--;
    } else if (i > 0) {
      out.push(`-${a[i - 1]}`);
      i--;
    }
  }

  out.reverse();

  if (fromText.trim() === "" && toText.trim() === "") return " (no changes)";
  return out.join("\n");
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
