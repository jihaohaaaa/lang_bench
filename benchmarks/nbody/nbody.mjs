const RUNTIME = process.argv[2] || 'unknown';
const ITERATIONS = parseInt(process.argv[3] || '20000000', 10);

const PI = 3.141592653589793;
const SOLAR_MASS = 4 * PI * PI;
const DAYS_PER_YEAR = 365.24;

class Body {
  constructor(x, y, z, vx, vy, vz, mass) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.mass = mass;
  }
}

function Jupiter() {
  return new Body(
    4.84143144246472090e+00,
    -1.16032004402742839e+00,
    -1.03622044471123109e-01,
    1.66007664274403694e-03 * DAYS_PER_YEAR,
    7.69901118419740425e-03 * DAYS_PER_YEAR,
    -6.90460016972063023e-05 * DAYS_PER_YEAR,
    9.54791938424326609e-04 * SOLAR_MASS
  );
}

function Saturn() {
  return new Body(
    8.34336671824457987e+00,
    4.12479856412430479e+00,
    -4.03523417114321381e-01,
    -2.76742510726862411e-03 * DAYS_PER_YEAR,
    4.99852801208914658e-03 * DAYS_PER_YEAR,
    2.30417297573763929e-05 * DAYS_PER_YEAR,
    2.85885980666130812e-04 * SOLAR_MASS
  );
}

function Uranus() {
  return new Body(
    1.28943695621391344e+01,
    -1.51111514016986312e+01,
    -2.23307578892655734e-01,
    2.96460137564761618e-03 * DAYS_PER_YEAR,
    2.37847173959480950e-03 * DAYS_PER_YEAR,
    -2.96589568540237556e-05 * DAYS_PER_YEAR,
    4.36624404335156298e-05 * SOLAR_MASS
  );
}

function Neptune() {
  return new Body(
    1.53796971148509165e+01,
    -2.59193146099879641e+01,
    1.79258772950371181e-01,
    2.68067772490389322e-03 * DAYS_PER_YEAR,
    1.62824170038242295e-03 * DAYS_PER_YEAR,
    -9.51592254519715870e-05 * DAYS_PER_YEAR,
    5.15138902046611451e-05 * SOLAR_MASS
  );
}

function Sun() {
  return new Body(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, SOLAR_MASS);
}

class NBodySystem {
  constructor(bodies) {
    this.bodies = bodies;
    let px = 0.0;
    let py = 0.0;
    let pz = 0.0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      px += b.vx * b.mass;
      py += b.vy * b.mass;
      pz += b.vz * b.mass;
    }
    this.bodies[0].vx = -px / SOLAR_MASS;
    this.bodies[0].vy = -py / SOLAR_MASS;
    this.bodies[0].vz = -pz / SOLAR_MASS;
  }

  advance(dt) {
    const bodies = this.bodies;
    const size = bodies.length;

    for (let i = 0; i < size; i++) {
      const bi = bodies[i];
      for (let j = i + 1; j < size; j++) {
        const bj = bodies[j];
        const dx = bi.x - bj.x;
        const dy = bi.y - bj.y;
        const dz = bi.z - bj.z;

        const distanceSq = dx * dx + dy * dy + dz * dz;
        const distance = Math.sqrt(distanceSq);
        const mag = dt / (distanceSq * distance);

        bi.vx -= dx * bj.mass * mag;
        bi.vy -= dy * bj.mass * mag;
        bi.vz -= dz * bj.mass * mag;

        bj.vx += dx * bi.mass * mag;
        bj.vy += dy * bi.mass * mag;
        bj.vz += dz * bi.mass * mag;
      }
    }

    for (let i = 0; i < size; i++) {
      const b = bodies[i];
      b.x += dt * b.vx;
      b.y += dt * b.vy;
      b.z += dt * b.vz;
    }
  }

  energy() {
    let e = 0.0;
    const bodies = this.bodies;
    const size = bodies.length;

    for (let i = 0; i < size; i++) {
      const bi = bodies[i];
      e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz);

      for (let j = i + 1; j < size; j++) {
        const bj = bodies[j];
        const dx = bi.x - bj.x;
        const dy = bi.y - bj.y;
        const dz = bi.z - bj.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        e -= (bi.mass * bj.mass) / distance;
      }
    }
    return e;
  }
}

async function main() {
  const system = new NBodySystem([
    Sun(),
    Jupiter(),
    Saturn(),
    Uranus(),
    Neptune()
  ]);

  const energyStart = system.energy();
  const start = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    system.advance(0.01);
  }

  const elapsedMs = performance.now() - start;
  const energyEnd = system.energy();

  console.log(JSON.stringify({
    runtime: RUNTIME,
    iterations: ITERATIONS,
    energyBefore: Number(energyStart.toFixed(9)),
    energyAfter: Number(energyEnd.toFixed(9)),
    timeMs: Number(elapsedMs.toFixed(2)),
    ips: Number((ITERATIONS / (elapsedMs / 1000)).toFixed(2))
  }, null, 2));
}

main();
