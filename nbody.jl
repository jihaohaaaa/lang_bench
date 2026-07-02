using Printf

const SOLAR_MASS = 4.0 * pi * pi
const DAYS_PER_YEAR = 365.24

mutable struct Body
    x::Float64
    y::Float64
    z::Float64
    vx::Float64
    vy::Float64
    vz::Float64
    mass::Float64
end

function offset_momentum!(bodies)
    px = 0.0
    py = 0.0
    pz = 0.0
    for b in bodies
        px += b.vx * b.mass
        py += b.vy * b.mass
        pz += b.vz * b.mass
    end
    sun = bodies[1]
    sun.vx = -px / SOLAR_MASS
    sun.vy = -py / SOLAR_MASS
    sun.vz = -pz / SOLAR_MASS
end

function energy(bodies)
    e = 0.0
    for i in 1:length(bodies)
        b = bodies[i]
        e += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz)
        for j in (i+1):length(bodies)
            b2 = bodies[j]
            dx = b.x - b2.x
            dy = b.y - b2.y
            dz = b.z - b2.z
            distance = sqrt(dx*dx + dy*dy + dz*dz)
            e -= (b.mass * b2.mass) / distance
        end
    end
    return e
end

function advance!(bodies, dt)
    @inbounds @fastmath for i in 1:length(bodies)
        b = bodies[i]
        for j in (i+1):length(bodies)
            b2 = bodies[j]
            dx = b.x - b2.x
            dy = b.y - b2.y
            dz = b.z - b2.z
            distance_sq = dx*dx + dy*dy + dz*dz
            distance = sqrt(distance_sq)
            mag = dt / (distance_sq * distance)
            
            b.vx -= dx * b2.mass * mag
            b.vy -= dy * b2.mass * mag
            b.vz -= dz * b2.mass * mag
            
            b2.vx += dx * b.mass * mag
            b2.vy += dy * b.mass * mag
            b2.vz += dz * b.mass * mag
        end
    end
    
    @inbounds @fastmath for b in bodies
        b.x += dt * b.vx
        b.y += dt * b.vy
        b.z += dt * b.vz
    end
end

function main()
    iterations = 20000000
    if length(ARGS) > 0
        iterations = parse(Int, ARGS[1])
    end

    bodies = [
        # Sun
        Body(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, SOLAR_MASS),
        # Jupiter
        Body(
            4.84143144246472090e+00,
            -1.16032004402742839e+00,
            -1.03622044471123109e-01,
            1.66007664274403694e-03 * DAYS_PER_YEAR,
            7.69901118419740425e-03 * DAYS_PER_YEAR,
            -6.90460016972061240e-05 * DAYS_PER_YEAR,
            9.54791938424326609e-04 * SOLAR_MASS
        ),
        # Saturn
        Body(
            8.34336671824457987e+00,
            4.12479856412430479e+00,
            -4.03523417114321381e-01,
            -2.76742510726862411e-03 * DAYS_PER_YEAR,
            4.99852801234917238e-03 * DAYS_PER_YEAR,
            2.30417297573763929e-05 * DAYS_PER_YEAR,
            2.85885980666130812e-04 * SOLAR_MASS
        ),
        # Uranus
        Body(
            1.28943695621391310e+01,
            -1.51111514016986312e+01,
            -2.23307578892655734e-01,
            2.96460137564761618e-03 * DAYS_PER_YEAR,
            2.37847173959480950e-03 * DAYS_PER_YEAR,
            -2.96589568540237556e-05 * DAYS_PER_YEAR,
            4.36624404335156298e-05 * SOLAR_MASS
        ),
        # Neptune
        Body(
            1.53796971148509165e+01,
            -2.59193146099879641e+01,
            1.79258772950371181e-01,
            2.68067772490389322e-03 * DAYS_PER_YEAR,
            1.62824170038242295e-03 * DAYS_PER_YEAR,
            -9.51592254519715870e-05 * DAYS_PER_YEAR,
            5.15138902046611451e-05 * SOLAR_MASS
        )
    ]

    offset_momentum!(bodies)
    energyBefore = energy(bodies)
    
    start_time = time_ns()
    
    dt = 0.01
    for _ in 1:iterations
        advance!(bodies, dt)
    end
    
    end_time = time_ns()
    duration_ms = (end_time - start_time) / 1_000_000.0
    energyAfter = energy(bodies)
    ips = iterations / (duration_ms / 1000.0)

    println("{")
    println("  \"runtime\": \"julia\",")
    println("  \"iterations\": ", iterations, ",")
    @printf("  \"energyBefore\": %.9f,\n", energyBefore)
    @printf("  \"energyAfter\": %.9f,\n", energyAfter)
    @printf("  \"timeMs\": %.2f,\n", duration_ms)
    @printf("  \"ips\": %.2f\n", ips)
    println("}")
end

main()
