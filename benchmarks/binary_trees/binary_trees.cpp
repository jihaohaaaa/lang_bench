#include <chrono>
#include <cstdlib>
#include <cstdio>
#include <iostream>
#include <memory_resource>
#include <vector>

/* Binary Trees benchmark in C++.
   Uses std::pmr::monotonic_buffer_resource as a per-tree arena. */

struct Node {
    Node *left = nullptr, *right = nullptr;
};

static Node *make_tree(std::pmr::memory_resource *pool, int depth) {
    auto *n = static_cast<Node *>(pool->allocate(sizeof(Node), alignof(Node)));
    new (n) Node{};
    if (depth == 0) return n;
    n->left  = make_tree(pool, depth - 1);
    n->right = make_tree(pool, depth - 1);
    return n;
}

static long long check_tree(const Node *n) {
    if (!n->left) return 1;
    return 1 + check_tree(n->left) + check_tree(n->right);
}

int main(int argc, char *argv[]) {
    int max_depth = 21;
    if (argc > 1) max_depth = std::atoi(argv[1]);

    const int min_depth     = 4;
    const int stretch_depth = max_depth + 1;

    auto t0 = std::chrono::high_resolution_clock::now();

    /* Stretch tree */
    {
        std::pmr::monotonic_buffer_resource pool;
        Node *t = make_tree(&pool, stretch_depth);
        std::printf("stretch tree of depth %d\t check: %lld\n",
                    stretch_depth, check_tree(t));
    }

    /* Long-lived tree */
    std::pmr::monotonic_buffer_resource ll_pool;
    Node *long_lived = make_tree(&ll_pool, max_depth);

    long long total_check = 0;
    for (int d = min_depth; d <= max_depth; d += 2) {
        int iterations = 1 << (max_depth - d + min_depth);
        long long c = 0;
        for (int i = 0; i < iterations; i++) {
            std::pmr::monotonic_buffer_resource pool;
            c += check_tree(make_tree(&pool, d));
        }
        total_check += c;
    }

    long long ll_check = check_tree(long_lived);

    auto t1 = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double, std::milli> elapsed = t1 - t0;

    std::cout << "{\n";
    std::cout << "  \"runtime\": \"c++\",\n";
    std::cout << "  \"maxDepth\": " << max_depth << ",\n";
    std::cout << "  \"checksum\": " << (total_check + ll_check) << ",\n";
    std::cout << "  \"timeMs\": " << elapsed.count() << "\n";
    std::cout << "}\n";
    return 0;
}
