#include <stdio.h>
#include <stdlib.h>
#include <time.h>

/* Binary Trees benchmark (Computer Language Benchmarks Game style).
   Allocates and deallocates complete binary trees up to depth `max_depth`.
   Checksum = sum of all node checks.

   Uses a simple arena allocator per tree for fast allocation. */

typedef struct Node {
    struct Node *left, *right;
} Node;

/* --- Arena allocator ----------------------------------------------- */
#define ARENA_BLOCK (1 << 22) /* 4 MiB blocks */

typedef struct Block { char *buf; size_t pos; struct Block *prev; } Block;
typedef struct Arena { Block *cur; } Arena;

static Block *new_block(Block *prev) {
    Block *b = malloc(sizeof(Block) + ARENA_BLOCK);
    b->buf = (char *)(b + 1);
    b->pos = 0;
    b->prev = prev;
    return b;
}

static void arena_init(Arena *a) { a->cur = new_block(NULL); }

static void *arena_alloc(Arena *a, size_t sz) {
    sz = (sz + 7) & ~(size_t)7; /* 8-byte align */
    if (a->cur->pos + sz > ARENA_BLOCK) a->cur = new_block(a->cur);
    void *p = a->cur->buf + a->cur->pos;
    a->cur->pos += sz;
    return p;
}

static void arena_free(Arena *a) {
    Block *b = a->cur;
    while (b) { Block *prev = b->prev; free(b); b = prev; }
    a->cur = NULL;
}

static void arena_reset(Arena *a) {
    Block *b = a->cur;
    while (b && b->prev) {
        Block *prev = b->prev;
        free(b);
        b = prev;
    }
    a->cur = b;
    if (b) {
        b->pos = 0;
    }
}

/* --- Tree helpers --------------------------------------------------- */
static Node *make_tree(Arena *a, int depth) {
    Node *n = arena_alloc(a, sizeof(Node));
    if (depth == 0) { n->left = n->right = NULL; return n; }
    n->left  = make_tree(a, depth - 1);
    n->right = make_tree(a, depth - 1);
    return n;
}

static long long check_tree(const Node *n) {
    if (!n->left) return 1;
    return 1 + check_tree(n->left) + check_tree(n->right);
}

int main(int argc, char *argv[]) {
    int max_depth = 21;
    if (argc > 1) max_depth = atoi(argv[1]);

    const int min_depth = 4;
    const int stretch_depth = max_depth + 1;

    struct timespec ts, te;
    clock_gettime(CLOCK_MONOTONIC, &ts);

    /* Stretch tree */
    {
        Arena a; arena_init(&a);
        Node *t = make_tree(&a, stretch_depth);
        long long c = check_tree(t);
        printf("stretch tree of depth %d\t check: %lld\n", stretch_depth, c);
        arena_free(&a);
    }

    /* Long-lived tree */
    Arena long_lived_arena; arena_init(&long_lived_arena);
    Node *long_lived = make_tree(&long_lived_arena, max_depth);

    /* Iterating trees */
    long long total_check = 0;
    for (int d = min_depth; d <= max_depth; d += 2) {
        int iterations = 1 << (max_depth - d + min_depth);
        long long c = 0;
        Arena a; arena_init(&a);
        for (int i = 0; i < iterations; i++) {
            c += check_tree(make_tree(&a, d));
            arena_reset(&a);
        }
        arena_free(&a);
        total_check += c;
    }

    long long ll_check = check_tree(long_lived);
    arena_free(&long_lived_arena);

    clock_gettime(CLOCK_MONOTONIC, &te);
    double time_ms = (te.tv_sec - ts.tv_sec) * 1000.0
                   + (te.tv_nsec - ts.tv_nsec) / 1e6;

    printf("{\n");
    printf("  \"runtime\": \"c\",\n");
    printf("  \"maxDepth\": %d,\n", max_depth);
    printf("  \"checksum\": %lld,\n", total_check + ll_check);
    printf("  \"timeMs\": %.2f\n", time_ms);
    printf("}\n");
    return 0;
}
