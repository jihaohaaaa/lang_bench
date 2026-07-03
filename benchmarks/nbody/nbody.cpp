#include <chrono>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

const double PI = 3.141592653589793;
const double SOLAR_MASS = 4.0 * PI * PI;
const double DAYS_PER_YEAR = 365.24;

struct Body {
    double x, y, z;
    double vx, vy, vz;
    double mass;
};

Body jupiter() {
    return {
        4.84143144246472090e+00,
        -1.16032004402742839e+00,
        -1.03622044471123109e-01,
        1.66007664274403694e-03 * DAYS_PER_YEAR,
        7.69901118419740425e-03 * DAYS_PER_YEAR,
        -6.90460016972063023e-05 * DAYS_PER_YEAR,
        9.54791938424326609e-04 * SOLAR_MASS
    };
}

Body saturn() {
    return {
        8.34336671824457987e+00,
        4.12479856412430479e+00,
        -4.03523417114321381e-01,
        -2.76742510726862411e-03 * DAYS_PER_YEAR,
        4.99852801208914658e-03 * DAYS_PER_YEAR,
        2.30417297573763929e-05 * DAYS_PER_YEAR,
        2.85885980666130812e-04 * SOLAR_MASS
    };
}

Body uranus() {
    return {
        1.28943695621391344e+01,
        -1.51111514016986312e+01,
        -2.23307578892655734e-01,
        2.96460137564761618e-03 * DAYS_PER_YEAR,
        2.37847173959480950e-03 * DAYS_PER_YEAR,
        -2.96589568540237556e-05 * DAYS_PER_YEAR,
        4.36624404335156298e-05 * SOLAR_MASS
    };
}

Body neptune() {
    return {
        1.53796971148509165e+01,
        -2.59193146099879641e+01,
        1.79258772950371181e-01,
        2.68067772490389322e-03 * DAYS_PER_YEAR,
        1.62824170038242295e-03 * DAYS_PER_YEAR,
        -9.51592254519715870e-05 * DAYS_PER_YEAR,
        5.15138902046611451e-05 * SOLAR_MASS
    };
}

Body sun() {
    return { 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, SOLAR_MASS };
}

class NBodySystem {
private:
    std::vector<Body> bodies;

public:
    NBodySystem(std::vector<Body> b) : bodies(b) {
        double px = 0.0;
        double py = 0.0;
        double pz = 0.0;
        for (const auto& body : bodies) {
            px += body.vx * body.mass;
            py += body.vy * body.mass;
            pz += body.vz * body.mass;
        }
        bodies[0].vx = -px / SOLAR_MASS;
        bodies[0].vy = -py / SOLAR_MASS;
        bodies[0].vz = -pz / SOLAR_MASS;
    }

    void advance(double dt) {
        size_t size = bodies.size();
        for (size_t i = 0; i < size; ++i) {
            Body& bi = bodies[i];
            for (size_t j = i + 1; j < size; ++j) {
                Body& bj = bodies[j];
                double dx = bi.x - bj.x;
                double dy = bi.y - bj.y;
                double dz = bi.z - bj.z;

                double distance_sq = dx * dx + dy * dy + dz * dz;
                double distance = std::sqrt(distance_sq);
                double mag = dt / (distance_sq * distance);

                bi.vx -= dx * bj.mass * mag;
                bi.vy -= dy * bj.mass * mag;
                bi.vz -= dz * bj.mass * mag;

                bj.vx += dx * bi.mass * mag;
                bj.vy += dy * bi.mass * mag;
                bj.vz += dz * bi.mass * mag;
            }
        }

        for (auto& b : bodies) {
            b.x += dt * b.vx;
            b.y += dt * b.vy;
            b.z += dt * b.vz;
        }
    }

    double energy() const {
        double e = 0.0;
        size_t size = bodies.size();
        for (size_t i = 0; i < size; ++i) {
            const Body& bi = bodies[i];
            e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz);
            for (size_t j = i + 1; j < size; ++j) {
                const Body& bj = bodies[j];
                double dx = bi.x - bj.x;
                double dy = bi.y - bj.y;
                double dz = bi.z - bj.z;
                double distance = std::sqrt(dx * dx + dy * dy + dz * dz);
                e -= (bi.mass * bj.mass) / distance;
            }
        }
        return e;
    }
};

int main(int argc, char* argv[]) {
    std::string compiler = (argc > 1) ? argv[1] : "unknown";
    NBodySystem system({
        sun(),
        jupiter(),
        saturn(),
        uranus(),
        neptune()
    });

    int iterations = 20000000;
    double energy_start = system.energy();
    
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < iterations; ++i) {
        system.advance(0.01);
    }
    auto end = std::chrono::high_resolution_clock::now();
    
    double energy_end = system.energy();
    std::chrono::duration<double, std::milli> elapsed = end - start;
    double time_ms = elapsed.count();

    std::cout << std::fixed << std::setprecision(9);
    std::cout << "{\n";
    std::cout << "  \"runtime\": \"c++ (" << compiler << ")\",\n";
    std::cout << "  \"iterations\": " << iterations << ",\n";
    std::cout << "  \"energyBefore\": " << energy_start << ",\n";
    std::cout << "  \"energyAfter\": " << energy_end << ",\n";
    std::cout << "  \"timeMs\": " << std::fixed << std::setprecision(2) << time_ms << ",\n";
    std::cout << "  \"ips\": " << (iterations / (time_ms / 1000.0)) << "\n";
    std::cout << "}\n";

    return 0;
}
