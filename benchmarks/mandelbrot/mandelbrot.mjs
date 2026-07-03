// Mandelbrot benchmark for Node.js / Deno / Bun
// Usage: node mandelbrot.mjs [node|deno|bun] [N]
//        deno run -A mandelbrot.mjs deno [N]
//        bun mandelbrot.mjs bun [N]

const RUNTIME = process.argv[2] || 'node';
const N = parseInt(process.argv[3] || '16000', 10);
const LIMIT = 50;

function mandelbrot(cr, ci) {
  let zr = 0.0, zi = 0.0;
  for (let i = 0; i < LIMIT; i++) {
    const zr2 = zr * zr;
    const zi2 = zi * zi;
    if (zr2 + zi2 > 4.0) return false;
    zi = 2.0 * zr * zi + ci;
    zr = zr2 - zi2 + cr;
  }
  return true;
}

const t0 = performance.now();
let count = 0;

for (let y = 0; y < N; y++) {
  const ci = 2.0 * y / N - 1.0;
  for (let x = 0; x < N; x++) {
    const cr = 2.0 * x / N - 1.5;
    if (mandelbrot(cr, ci)) count++;
  }
}

const timeMs = performance.now() - t0;

console.log(JSON.stringify({
  runtime: RUNTIME,
  n: N,
  checksum: count,
  timeMs: Number(timeMs.toFixed(2)),
}, null, 2));
