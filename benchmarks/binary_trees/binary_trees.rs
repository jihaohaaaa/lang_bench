use std::env;
use std::time::Instant;

/* Binary Trees benchmark in Rust.
   Uses a simple bump/arena allocator via a Vec<Node> pool
   to avoid per-node heap allocation overhead. */

struct Node {
    left:  u32, // index into pool, 0 = leaf
    right: u32,
}

struct Arena {
    pool: Vec<Node>,
}

impl Arena {
    fn with_capacity(cap: usize) -> Self {
        let mut pool = Vec::with_capacity(cap);
        // index 0 is the sentinel "null" leaf — push a dummy
        pool.push(Node { left: 0, right: 0 });
        Arena { pool }
    }

    fn alloc(&mut self) -> u32 {
        let idx = self.pool.len() as u32;
        self.pool.push(Node { left: 0, right: 0 });
        idx
    }

    fn make_tree(&mut self, depth: u32) -> u32 {
        let idx = self.alloc();
        if depth == 0 {
            return idx;
        }
        let l = self.make_tree(depth - 1);
        let r = self.make_tree(depth - 1);
        self.pool[idx as usize].left  = l;
        self.pool[idx as usize].right = r;
        idx
    }

    fn check_tree(&self, idx: u32) -> i64 {
        let n = &self.pool[idx as usize];
        if n.left == 0 && n.right == 0 {
            return 1;
        }
        1 + self.check_tree(n.left) + self.check_tree(n.right)
    }
}

fn tree_nodes(depth: u32) -> usize {
    ((1_usize << (depth + 1)) + 1).max(4)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let max_depth: u32 = if args.len() > 1 {
        args[1].parse().unwrap_or(21)
    } else {
        21
    };

    let min_depth = 4u32;
    let stretch_depth = max_depth + 1;

    let t0 = Instant::now();

    // Stretch tree
    {
        let mut a = Arena::with_capacity(tree_nodes(stretch_depth));
        let root = a.make_tree(stretch_depth);
        let c = a.check_tree(root);
        eprintln!("stretch tree of depth {stretch_depth}\t check: {c}");
    }

    // Long-lived tree
    let mut ll_arena = Arena::with_capacity(tree_nodes(max_depth));
    let ll_root = ll_arena.make_tree(max_depth);

    let mut total_check: i64 = 0;
    let mut d = min_depth;
    while d <= max_depth {
        let iterations = 1usize << (max_depth - d + min_depth);
        let mut c: i64 = 0;
        for _ in 0..iterations {
            let mut a = Arena::with_capacity(tree_nodes(d));
            let root = a.make_tree(d);
            c += a.check_tree(root);
        }
        total_check += c;
        d += 2;
    }

    let ll_check = ll_arena.check_tree(ll_root);
    let elapsed = t0.elapsed();
    let time_ms = elapsed.as_secs_f64() * 1000.0;

    println!("{{");
    println!("  \"runtime\": \"rust\",");
    println!("  \"maxDepth\": {},", max_depth);
    println!("  \"checksum\": {},", total_check + ll_check);
    println!("  \"timeMs\": {:.2}", time_ms);
    println!("}}");
}
