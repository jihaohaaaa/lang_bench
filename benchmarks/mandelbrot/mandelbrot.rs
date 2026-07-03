use std::env;
use std::time::Instant;

fn mandelbrot(cr: f64, ci: f64, limit: u32) -> bool {
    let mut zr = 0.0_f64;
    let mut zi = 0.0_f64;
    for _ in 0..limit {
        let zr2 = zr * zr;
        let zi2 = zi * zi;
        if zr2 + zi2 > 4.0 {
            return false;
        }
        zi = 2.0 * zr * zi + ci;
        zr = zr2 - zi2 + cr;
    }
    true
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let n: usize = if args.len() > 1 {
        args[1].parse().unwrap_or(16000)
    } else {
        16000
    };

    const LIMIT: u32 = 50;
    let mut count: i64 = 0;

    let t0 = Instant::now();

    for y in 0..n {
        let ci = 2.0 * y as f64 / n as f64 - 1.0;
        for x in 0..n {
            let cr = 2.0 * x as f64 / n as f64 - 1.5;
            if mandelbrot(cr, ci, LIMIT) {
                count += 1;
            }
        }
    }

    let elapsed = t0.elapsed();
    let time_ms = elapsed.as_secs_f64() * 1000.0;

    println!("{{");
    println!("  \"runtime\": \"rust\",");
    println!("  \"n\": {},", n);
    println!("  \"checksum\": {},", count);
    println!("  \"timeMs\": {:.2}", time_ms);
    println!("}}");
}
