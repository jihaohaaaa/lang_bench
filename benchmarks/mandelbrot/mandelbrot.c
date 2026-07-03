#include <stdio.h>
#include <stdlib.h>
#include <time.h>

/* Mandelbrot set benchmark (Computer Language Benchmarks Game style).
   Outputs the number of "black" pixels (points inside the set) as a
   checksum for correctness verification, plus a JSON timing blob. */

static int mandelbrot(double cr, double ci, int limit) {
    double zr = 0.0, zi = 0.0;
    for (int i = 0; i < limit; i++) {
        double zr2 = zr * zr;
        double zi2 = zi * zi;
        if (zr2 + zi2 > 4.0) return 0;
        zi = 2.0 * zr * zi + ci;
        zr = zr2 - zi2 + cr;
    }
    return 1;
}

int main(int argc, char *argv[]) {
    int n = 16000;
    if (argc > 1) n = atoi(argv[1]);

    const int LIMIT = 50;
    long long count = 0;

    struct timespec ts, te;
    clock_gettime(CLOCK_MONOTONIC, &ts);

    for (int y = 0; y < n; y++) {
        double ci = 2.0 * y / n - 1.0;
        for (int x = 0; x < n; x++) {
            double cr = 2.0 * x / n - 1.5;
            if (mandelbrot(cr, ci, LIMIT)) count++;
        }
    }

    clock_gettime(CLOCK_MONOTONIC, &te);
    double time_ms = (te.tv_sec - ts.tv_sec) * 1000.0
                   + (te.tv_nsec - ts.tv_nsec) / 1e6;

    printf("{\n");
    printf("  \"runtime\": \"c\",\n");
    printf("  \"n\": %d,\n", n);
    printf("  \"checksum\": %lld,\n", count);
    printf("  \"timeMs\": %.2f\n", time_ms);
    printf("}\n");
    return 0;
}
