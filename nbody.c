#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <time.h>

#define PI 3.141592653589793
#define SOLAR_MASS (4.0 * PI * PI)
#define DAYS_PER_YEAR 365.24

typedef struct {
    double x, y, z;
    double vx, vy, vz;
    double mass;
} Body;

Body jupiter() {
    Body b = {
        4.84143144246472090e+00,
        -1.16032004402742839e+00,
        -1.03622044471123109e-01,
        1.66007664274403694e-03 * DAYS_PER_YEAR,
        7.69901118419740425e-03 * DAYS_PER_YEAR,
        -6.90460016972063023e-05 * DAYS_PER_YEAR,
        9.54791938424326609e-04 * SOLAR_MASS
    };
    return b;
}

Body saturn() {
    Body b = {
        8.34336671824457987e+00,
        4.12479856412430479e+00,
        -4.03523417114321381e-01,
        -2.76742510726862411e-03 * DAYS_PER_YEAR,
        4.99852801208914658e-03 * DAYS_PER_YEAR,
        2.30417297573763929e-05 * DAYS_PER_YEAR,
        2.85885980666130812e-04 * SOLAR_MASS
    };
    return b;
}

Body uranus() {
    Body b = {
        1.28943695621391344e+01,
        -1.51111514016986312e+01,
        -2.23307578892655734e-01,
        2.96460137564761618e-03 * DAYS_PER_YEAR,
        2.37847173959480950e-03 * DAYS_PER_YEAR,
        -2.96589568540237556e-05 * DAYS_PER_YEAR,
        4.36624404335156298e-05 * SOLAR_MASS
    };
    return b;
}

Body neptune() {
    Body b = {
        1.53796971148509165e+01,
        -2.59193146099879641e+01,
        1.79258772950371181e-01,
        2.68067772490389322e-03 * DAYS_PER_YEAR,
        1.62824170038242295e-03 * DAYS_PER_YEAR,
        -9.51592254519715870e-05 * DAYS_PER_YEAR,
        5.15138902046611451e-05 * SOLAR_MASS
    };
    return b;
}

Body sun() {
    Body b = { 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, SOLAR_MASS };
    return b;
}

void offset_momentum(Body bodies[], int size) {
    double px = 0.0;
    double py = 0.0;
    double pz = 0.0;
    for (int i = 0; i < size; ++i) {
        px += bodies[i].vx * bodies[i].mass;
        py += bodies[i].vy * bodies[i].mass;
        pz += bodies[i].vz * bodies[i].mass;
    }
    bodies[0].vx = -px / SOLAR_MASS;
    bodies[0].vy = -py / SOLAR_MASS;
    bodies[0].vz = -pz / SOLAR_MASS;
}

void advance(Body bodies[], int size, double dt) {
    for (int i = 0; i < size; ++i) {
        Body *bi = &bodies[i];
        for (int j = i + 1; j < size; ++j) {
            Body *bj = &bodies[j];
            double dx = bi->x - bj->x;
            double dy = bi->y - bj->y;
            double dz = bi->z - bj->z;

            double distance_sq = dx * dx + dy * dy + dz * dz;
            double distance = sqrt(distance_sq);
            double mag = dt / (distance_sq * distance);

            bi->vx -= dx * bj->mass * mag;
            bi->vy -= dy * bj->mass * mag;
            bi->vz -= dz * bj->mass * mag;

            bj->vx += dx * bi->mass * mag;
            bj->vy += dy * bi->mass * mag;
            bj->vz += dz * bi->mass * mag;
        }
    }

    for (int i = 0; i < size; ++i) {
        bodies[i].x += dt * bodies[i].vx;
        bodies[i].y += dt * bodies[i].vy;
        bodies[i].z += dt * bodies[i].vz;
    }
}

double energy(Body bodies[], int size) {
    double e = 0.0;
    for (int i = 0; i < size; ++i) {
        Body *bi = &bodies[i];
        e += 0.5 * bi->mass * (bi->vx * bi->vx + bi->vy * bi->vy + bi->vz * bi->vz);
        for (int j = i + 1; j < size; ++j) {
            Body *bj = &bodies[j];
            double dx = bi->x - bj->x;
            double dy = bi->y - bj->y;
            double dz = bi->z - bj->z;
            double distance = sqrt(dx * dx + dy * dy + dz * dz);
            e -= (bi->mass * bj->mass) / distance;
        }
    }
    return e;
}

int main(int argc, char* argv[]) {
    int iterations = 20000000;
    if (argc > 1) {
        iterations = atoi(argv[1]);
    }

    Body bodies[5] = {
        sun(),
        jupiter(),
        saturn(),
        uranus(),
        neptune()
    };
    offset_momentum(bodies, 5);

    double energy_start = energy(bodies, 5);

    clock_t start = clock();
    for (int i = 0; i < iterations; ++i) {
        advance(bodies, 5, 0.01);
    }
    clock_t end = clock();

    double energy_end = energy(bodies, 5);
    double elapsed_s = (double)(end - start) / CLOCKS_PER_SEC;
    double time_ms = elapsed_s * 1000.0;

    printf("{\n");
    printf("  \"runtime\": \"c\",\n");
    printf("  \"iterations\": %d,\n", iterations);
    printf("  \"energyBefore\": %.9f,\n", energy_start);
    printf("  \"energyAfter\": %.9f,\n", energy_end);
    printf("  \"timeMs\": %.2f,\n", time_ms);
    printf("  \"ips\": %.2f\n", iterations / elapsed_s);
    printf("}\n");

    return 0;
}
