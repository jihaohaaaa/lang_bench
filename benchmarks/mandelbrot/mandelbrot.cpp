#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>

/* Mandelbrot set benchmark.
   Checksum = number of pixels inside the set (escape count ≥ limit). */

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
    if (argc > 1) n = std::atoi(argv[1]);

    const int LIMIT = 50;
    long long count = 0;

    auto t0 = std::chrono::high_resolution_clock::now();

    for (int y = 0; y < n; y++) {
        double ci = 2.0 * y / n - 1.0;
        for (int x = 0; x < n; x++) {
            double cr = 2.0 * x / n - 1.5;
            if (mandelbrot(cr, ci, LIMIT)) count++;
        }
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double, std::milli> elapsed = t1 - t0;
    double time_ms = elapsed.count();

    std::cout << "{\n";
    std::cout << "  \"runtime\": \"c++\",\n";
    std::cout << "  \"n\": " << n << ",\n";
    std::cout << "  \"checksum\": " << count << ",\n";
    std::cout << "  \"timeMs\": " << time_ms << "\n";
    std::cout << "}\n";
    return 0;
}
