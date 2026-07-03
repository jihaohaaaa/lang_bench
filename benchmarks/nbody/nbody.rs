use std::env;
use std::time::Instant;

const PI: f64 = 3.141592653589793;
const SOLAR_MASS: f64 = 4.0 * PI * PI;
const DAYS_PER_YEAR: f64 = 365.24;

#[derive(Clone, Copy)]
struct Body {
    x: f64,
    y: f64,
    z: f64,
    vx: f64,
    vy: f64,
    vz: f64,
    mass: f64,
}

impl Body {
    fn new(x: f64, y: f64, z: f64, vx: f64, vy: f64, vz: f64, mass: f64) -> Self {
        Body { x, y, z, vx, vy, vz, mass }
    }
}

fn jupiter() -> Body {
    Body::new(
        4.84143144246472090e+00,
        -1.16032004402742839e+00,
        -1.03622044471123109e-01,
        1.66007664274403694e-03 * DAYS_PER_YEAR,
        7.69901118419740425e-03 * DAYS_PER_YEAR,
        -6.90460016972063023e-05 * DAYS_PER_YEAR,
        9.54791938424326609e-04 * SOLAR_MASS,
    )
}

fn saturn() -> Body {
    Body::new(
        8.34336671824457987e+00,
        4.12479856412430479e+00,
        -4.03523417114321381e-01,
        -2.76742510726862411e-03 * DAYS_PER_YEAR,
        4.99852801208914658e-03 * DAYS_PER_YEAR,
        2.30417297573763929e-05 * DAYS_PER_YEAR,
        2.85885980666130812e-04 * SOLAR_MASS,
    )
}

fn uranus() -> Body {
    Body::new(
        1.28943695621391344e+01,
        -1.51111514016986312e+01,
        -2.23307578892655734e-01,
        2.96460137564761618e-03 * DAYS_PER_YEAR,
        2.37847173959480950e-03 * DAYS_PER_YEAR,
        -2.96589568540237556e-05 * DAYS_PER_YEAR,
        4.36624404335156298e-05 * SOLAR_MASS,
    )
}

fn neptune() -> Body {
    Body::new(
        1.53796971148509165e+01,
        -2.59193146099879641e+01,
        1.79258772950371181e-01,
        2.68067772490389322e-03 * DAYS_PER_YEAR,
        1.62824170038242295e-03 * DAYS_PER_YEAR,
        -9.51592254519715870e-05 * DAYS_PER_YEAR,
        5.15138902046611451e-05 * SOLAR_MASS,
    )
}

fn sun() -> Body {
    Body::new(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, SOLAR_MASS)
}

struct NBodySystem {
    bodies: Vec<Body>,
}

impl NBodySystem {
    fn new(mut bodies: Vec<Body>) -> Self {
        let mut px = 0.0;
        let mut py = 0.0;
        let mut pz = 0.0;
        for b in &bodies {
            px += b.vx * b.mass;
            py += b.vy * b.mass;
            pz += b.vz * b.mass;
        }
        bodies[0].vx = -px / SOLAR_MASS;
        bodies[0].vy = -py / SOLAR_MASS;
        bodies[0].vz = -pz / SOLAR_MASS;
        NBodySystem { bodies }
    }

    fn advance(&mut self, dt: f64) {
        let size = self.bodies.len();
        let bodies_ptr = self.bodies.as_mut_ptr();

        for i in 0..size {
            for j in (i + 1)..size {
                unsafe {
                    let bi = &mut *bodies_ptr.add(i);
                    let bj = &mut *bodies_ptr.add(j);
                    
                    let dx = bi.x - bj.x;
                    let dy = bi.y - bj.y;
                    let dz = bi.z - bj.z;

                    let distance_sq = dx * dx + dy * dy + dz * dz;
                    let distance = distance_sq.sqrt();
                    let mag = dt / (distance_sq * distance);

                    let mass_j = bj.mass;
                    let mass_i = bi.mass;

                    bi.vx -= dx * mass_j * mag;
                    bi.vy -= dy * mass_j * mag;
                    bi.vz -= dz * mass_j * mag;

                    bj.vx += dx * mass_i * mag;
                    bj.vy += dy * mass_i * mag;
                    bj.vz += dz * mass_i * mag;
                }
            }
        }

        for b in &mut self.bodies {
            b.x += dt * b.vx;
            b.y += dt * b.vy;
            b.z += dt * b.vz;
        }
    }

    fn energy(&self) -> f64 {
        let mut e = 0.0;
        let size = self.bodies.len();

        for i in 0..size {
            let bi = &self.bodies[i];
            e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz);

            for j in (i + 1)..size {
                let bj = &self.bodies[j];
                let dx = bi.x - bj.x;
                let dy = bi.y - bj.y;
                let dz = bi.z - bj.z;
                let distance = (dx * dx + dy * dy + dz * dz).sqrt();
                e -= (bi.mass * bj.mass) / distance;
            }
        }
        e
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut iterations = 20000000;
    if args.len() > 1 {
        if let Ok(val) = args[1].parse::<u32>() {
            iterations = val;
        }
    }

    let mut system = NBodySystem::new(vec![
        sun(),
        jupiter(),
        saturn(),
        uranus(),
        neptune(),
    ]);

    let energy_start = system.energy();
    let start = Instant::now();

    for _ in 0..iterations {
        system.advance(0.01);
    }

    let elapsed = start.elapsed();
    let energy_end = system.energy();
    let time_ms = elapsed.as_secs_f64() * 1000.0;

    println!("{{");
    println!("  \"runtime\": \"rust (release)\",");
    println!("  \"iterations\": {},", iterations);
    println!("  \"energyBefore\": {:.9},", energy_start);
    println!("  \"energyAfter\": {:.9},", energy_end);
    println!("  \"timeMs\": {:.2},", time_ms);
    println!("  \"ips\": {:.2}", (iterations as f64) / (elapsed.as_secs_f64()));
    println!("}}");
}
