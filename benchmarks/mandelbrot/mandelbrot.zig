const std = @import("std");

fn mandelbrot(cr: f64, ci: f64, limit: u32) bool {
    var zr: f64 = 0.0;
    var zi: f64 = 0.0;
    var i: u32 = 0;
    while (i < limit) : (i += 1) {
        const zr2 = zr * zr;
        const zi2 = zi * zi;
        if (zr2 + zi2 > 4.0) return false;
        zi = 2.0 * zr * zi + ci;
        zr = zr2 - zi2 + cr;
    }
    return true;
}

pub fn main(init: std.process.Init) !void {
    var it = try std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa);
    defer it.deinit();
    _ = it.skip(); // skip executable name

    var n: usize = 16000;
    if (it.next()) |arg| {
        n = std.fmt.parseInt(usize, arg, 10) catch 16000;
    }

    const limit: u32 = 50;
    var count: i64 = 0;

    const t0 = std.Io.Clock.now(.awake, init.io);

    var y: usize = 0;
    while (y < n) : (y += 1) {
        const ci = 2.0 * @as(f64, @floatFromInt(y)) / @as(f64, @floatFromInt(n)) - 1.0;
        var x: usize = 0;
        while (x < n) : (x += 1) {
            const cr = 2.0 * @as(f64, @floatFromInt(x)) / @as(f64, @floatFromInt(n)) - 1.5;
            if (mandelbrot(cr, ci, limit)) count += 1;
        }
    }

    const t1 = std.Io.Clock.now(.awake, init.io);
    const elapsed_ns = t1.nanoseconds - t0.nanoseconds;
    const time_ms = @as(f64, @floatFromInt(elapsed_ns)) / 1e6;

    var stdout_buffer: [1024]u8 = undefined;
    var stdout_file_writer: std.Io.File.Writer = .init(.stdout(), init.io, &stdout_buffer);
    const stdout = &stdout_file_writer.interface;
    try stdout.print(
        \\{{
        \\  "runtime": "zig",
        \\  "n": {},
        \\  "checksum": {},
        \\  "timeMs": {:.2}
        \\}}
        \\
    , .{ n, count, time_ms });
    try stdout_file_writer.flush();
}
