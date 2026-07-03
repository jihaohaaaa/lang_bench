const std = @import("std");

// Binary Trees benchmark in Zig.
// Uses a custom DirectArena allocator to bypass virtual table interfaces (std.mem.Allocator)
// for maximum CPU inlining and zero-allocation performance.

const Node = struct {
    left:  ?*Node = null,
    right: ?*Node = null,
};

const DirectBlock = struct {
    buf: []u8,
    pos: usize,
    prev: ?*DirectBlock,
};

const DirectArena = struct {
    cur: *DirectBlock,
    gpa: std.mem.Allocator,

    fn init(gpa: std.mem.Allocator) !DirectArena {
        const block = try gpa.create(DirectBlock);
        const buf = try gpa.alloc(u8, 4 * 1024 * 1024); // 4 MiB
        block.* = .{
            .buf = buf,
            .pos = 0,
            .prev = null,
        };
        return DirectArena{ .cur = block, .gpa = gpa };
    }

    fn alloc(self: *DirectArena, comptime T: type) *T {
        const sz = (@sizeOf(T) + 7) & ~@as(usize, 7);
        if (self.cur.pos + sz > self.cur.buf.len) {
            const next_block = self.gpa.create(DirectBlock) catch @panic("OOM");
            const buf = self.gpa.alloc(u8, 4 * 1024 * 1024) catch @panic("OOM");
            next_block.* = .{
                .buf = buf,
                .pos = 0,
                .prev = self.cur,
            };
            self.cur = next_block;
        }
        const p = &self.cur.buf[self.cur.pos];
        self.cur.pos += sz;
        return @alignCast(@ptrCast(p));
    }

    fn reset(self: *DirectArena) void {
        var b = self.cur;
        while (b.prev) |prev| {
            self.gpa.free(b.buf);
            self.gpa.destroy(b);
            b = prev;
        }
        self.cur = b;
        b.pos = 0;
    }

    fn deinit(self: *DirectArena) void {
        var b = self.cur;
        while (true) {
            const prev = b.prev;
            self.gpa.free(b.buf);
            self.gpa.destroy(b);
            if (prev == null) break;
            b = prev.?;
        }
    }
};

fn makeTree(arena: *DirectArena, depth: u32) *Node {
    const n = arena.alloc(Node);
    n.* = .{};
    if (depth == 0) return n;
    n.left  = makeTree(arena, depth - 1);
    n.right = makeTree(arena, depth - 1);
    return n;
}

fn checkTree(n: *const Node) i64 {
    if (n.left == null) return 1;
    return 1 + checkTree(n.left.?) + checkTree(n.right.?);
}

pub fn main(init: std.process.Init) !void {
    var it = try std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa);
    defer it.deinit();
    _ = it.skip();

    var max_depth: u32 = 18;
    if (it.next()) |arg| {
        max_depth = std.fmt.parseInt(u32, arg, 10) catch 18;
    }

    const min_depth: u32 = 4;
    const stretch_depth = max_depth + 1;

    const t0 = std.Io.Clock.now(.awake, init.io);

    // Stretch tree
    {
        var arena = try DirectArena.init(init.gpa);
        defer arena.deinit();
        const t = makeTree(&arena, stretch_depth);
        const c = checkTree(t);
        std.debug.print("stretch tree of depth {d}\t check: {d}\n", .{ stretch_depth, c });
    }

    // Long-lived tree
    var ll_arena = try DirectArena.init(init.gpa);
    defer ll_arena.deinit();
    const long_lived = makeTree(&ll_arena, max_depth);

    var total_check: i64 = 0;
    var d: u32 = min_depth;
    while (d <= max_depth) : (d += 2) {
        const iterations = @as(usize, 1) << @intCast(max_depth - d + min_depth);
        var c: i64 = 0;
        var arena = try DirectArena.init(init.gpa);
        defer arena.deinit();
        for (0..iterations) |_| {
            const t = makeTree(&arena, d);
            c += checkTree(t);
            arena.reset();
        }
        total_check += c;
    }

    const ll_check = checkTree(long_lived);
    const t1 = std.Io.Clock.now(.awake, init.io);
    const elapsed_ns = t1.nanoseconds - t0.nanoseconds;
    const time_ms = @as(f64, @floatFromInt(elapsed_ns)) / 1e6;

    var stdout_buffer: [1024]u8 = undefined;
    var stdout_file_writer: std.Io.File.Writer = .init(.stdout(), init.io, &stdout_buffer);
    const stdout = &stdout_file_writer.interface;
    try stdout.print(
        \\{{
        \\  "runtime": "zig",
        \\  "maxDepth": {},
        \\  "checksum": {},
        \\  "timeMs": {:.2}
        \\}}
        \\
    , .{ max_depth, total_check + ll_check, time_ms });
    try stdout_file_writer.flush();
}
