// Binary Trees benchmark for Node.js / Deno / Bun
// Usage: node binary_trees.mjs [node|deno|bun] [maxDepth]

const RUNTIME  = process.argv[2] || 'node';
const MAX_DEPTH = parseInt(process.argv[3] || '21', 10);
const MIN_DEPTH = 4;

function makeTree(depth) {
  if (depth === 0) return { left: null, right: null };
  return { left: makeTree(depth - 1), right: makeTree(depth - 1) };
}

function checkTree(n) {
  if (n.left === null) return 1;
  return 1 + checkTree(n.left) + checkTree(n.right);
}

const t0 = performance.now();

// Stretch tree
const stretchDepth = MAX_DEPTH + 1;
const stretchTree  = makeTree(stretchDepth);
console.error(`stretch tree of depth ${stretchDepth}\t check: ${checkTree(stretchTree)}`);

// Long-lived tree
const longLived = makeTree(MAX_DEPTH);

let totalCheck = 0;
for (let d = MIN_DEPTH; d <= MAX_DEPTH; d += 2) {
  const iterations = 1 << (MAX_DEPTH - d + MIN_DEPTH);
  let c = 0;
  for (let i = 0; i < iterations; i++) {
    c += checkTree(makeTree(d));
  }
  totalCheck += c;
}

const llCheck = checkTree(longLived);
const timeMs  = performance.now() - t0;

console.log(JSON.stringify({
  runtime:  RUNTIME,
  maxDepth: MAX_DEPTH,
  checksum: totalCheck + llCheck,
  timeMs:   Number(timeMs.toFixed(2)),
}, null, 2));
