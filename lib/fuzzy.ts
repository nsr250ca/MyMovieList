import { compactTitle } from "@/lib/normalization";

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);

  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      matrix[i][j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }

  return matrix[b.length][a.length];
}

export function titleSimilarity(input: string, candidate: string) {
  const a = compactTitle(input);
  const b = compactTitle(candidate);

  if (!a || !b) return 0;
  if (a === b) return 100;

  const maxLength = Math.max(a.length, b.length);
  const distance = levenshtein(a, b);
  const baseScore = Math.max(0, (1 - distance / maxLength) * 100);

  if (a.includes(b) || b.includes(a)) {
    return Math.max(baseScore, 82);
  }

  return Math.round(baseScore * 100) / 100;
}
