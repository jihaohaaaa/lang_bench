const std = @import("std");

const PI = 3.141592653589793;
const SOLAR_MASS = 4.0 * PI * PI;
const DAYS_PER_YEAR = 365.24;

const Body = struct {
    x: f64,
    y: f64,
    z: f64,
    vx: f64,
    vy: f64,
    vz: f64,
    mass: f64,

    fn new(x: f64, y: f64, z: f64, vx: f64, vy: f64, vz: f64, mass: f64) Body {
        return Body{ .x = x, .y = y, .z = z, .vx = vx, .vy = vy, .vz = vz, .mass = mass };
    }
};

fn jupiter() Body {
    return Body.new(
        4.84143144246472090e+00,
        -1.16032004402742839e+00,
        -1.03622044471123109e-01,
        1.66007664274403694e-03 * DAYS_PER_YEAR,
        7.69901118419740425e-03 * DAYS_PER_YEAR,
        -6.90460016972063023e-05 * DAYS_PER_YEAR,
        9.54791938424326609e-04 * SOLAR_MASS,
    );
}

fn saturn() Body {
    return Body.new(
        8.34336671824457987e+00,
        4.12479856412430479e+00,
        -4.03523417114321381e-01,
        -2.76742510726862411e-03 * DAYS_PER_YEAR,
        4.99852801208914658e-03 * DAYS_PER_YEAR,
        2.30417297573763929e-05 * DAYS_PER_YEAR,
        2.85885980666130812e-04 * SOLAR_MASS,
    );
}

fn uranus() Body {
    return Body.new(
        1.28943695621391344e+01,
        -1.51111514016986312e+01,
        -2.23307578892655734e-01,
        2.96460137564761618e-03 * DAYS_PER_YEAR,
        2.37847173959480950e-03 * DAYS_PER_YEAR,
        -2.96589568540237556e-05 * DAYS_PER_YEAR,
        4.36624404335156298e-05 * SOLAR_MASS,
    );
}

fn neptune() Body {
    return Body.new(
        1.53796971148509165e+01,
        -2.59193146099879641e+01,
        1.79258772950371181e-01,
        2.68067772490389322e-03 * DAYS_PER_YEAR,
        1.62824170038242295e-03 * DAYS_PER_YEAR,
        -9.51592254519715870e-05 * DAYS_PER_YEAR,
        5.15138902046611451e-05 * SOLAR_MASS,
    );
}

fn sun() Body {
    return Body.new(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, SOLAR_MASS);
}

const NBodySystem = struct {
    bodies: [5]Body,

    fn init() NBodySystem {
        var bodies = [5]Body{
            sun(),
            jupiter(),
            saturn(),
            uranus(),
            neptune(),
        };

        var px: f64 = 0.0;
        var py: f64 = 0.0;
        var pz: f64 = 0.0;
        for (bodies) |b| {
            px += b.vx * b.mass;
            py += b.vy * b.mass;
            pz += b.vz * b.mass;
        }
        bodies[0].vx = -px / SOLAR_MASS;
        bodies[0].vy = -py / SOLAR_MASS;
        bodies[0].vz = -pz / SOLAR_MASS;

        return NBodySystem{ .bodies = bodies };
    }

    fn advance(self: *NBodySystem, dt: f64) void {
        const size = self.bodies.len;
        var i: usize = 0;
        while (i < size) : (i += 1) {
            const bi = &self.bodies[i];
            var j: usize = i + 1;
            while (j < size) : (j += 1) {
                const bj = &self.bodies[j];
                const dx = bi.x - bj.x;
                const dy = bi.y - bj.y;
                const dz = bi.z - bj.z;

                const distance_sq = dx * dx + dy * dy + dz * dz;
                const distance = @sqrt(distance_sq);
                const mag = dt / (distance_sq * distance);

                bi.vx -= dx * bj.mass * mag;
                bi.vy -= dy * bj.mass * mag;
                bi.vz -= dz * bj.mass * mag;

                bj.vx += dx * bi.mass * mag;
                bj.vy += dy * bi.mass * mag;
                bj.vz += dz * bi.mass * mag;
            }
        }

        for (&self.bodies) |*b| {
            b.x += dt * b.vx;
            b.y += dt * b.vy;
            b.z += dt * b.vz;
        }
    }

    fn energy(self: *const NBodySystem) f64 {
        var e: f64 = 0.0;
        const size = self.bodies.len;
        var i: usize = 0;
        while (i < size) : (i += 1) {
            const bi = &self.bodies[i];
            e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz);
            var j: usize = i + 1;
            while (j < size) : (j += 1) {
                const bj = &self.bodies[j];
                const dx = bi.x - bj.x;
                const dy = bi.y - bj.y;
                const dz = bi.z - bj.z;
                const distance = @sqrt(dx * dx + dy * dy + dz * dz);
                e -= (bi.mass * bj.mass) / distance;
            }
        }
        return e;
    }
};

pub fn main(init: std.process.Init) !void {
    var it = try std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa);
    defer it.deinit();

    _ = it.skip(); // skip executable name

    var iterations: u32 = 20000000;
    if (it.next()) |arg| {
        iterations = std.fmt.parseInt(u32, arg, 10) catch 20000000;
    }

    var system = NBodySystem.init();

    const energy_start = system.energy();
    
    const start_time = std.Io.Clock.now(.awake, init.io);
    
    var i: u32 = 0;
    while (i < iterations) : (i += 1) {
        system.advance(0.01);
    }
    
    const end_time = std.Io.Clock.now(.awake, init.io);
    const elapsed_ns = end_time.nanoseconds - start_time.nanoseconds;
    const energy_end = system.energy();
    const time_ms = @as(f64, @floatFromInt(elapsed_ns)) / 1e6;

    std.debug.print(
        \\{{
        \\  "runtime": "zig (release)",
        \\  "iterations": {},
        \\  "energyBefore": {:.9},
        \\  "energyAfter": {:.9},
        \\  "timeMs": {:.2},
        \\  "ips": {:.2}
        \\}}
        \\
    , .{
        iterations,
        energy_start,
        energy_end,
        time_ms,
        @as(f64, @floatFromInt(iterations)) / (@as(f64, @floatFromInt(elapsed_ns)) / 1e9),
    });
}
