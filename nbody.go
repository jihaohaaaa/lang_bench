package main

import (
	"fmt"
	"math"
	"os"
	"strconv"
	"time"
)

const (
	PI            = 3.141592653589793
	SOLAR_MASS    = 4.0 * PI * PI
	DAYS_PER_YEAR = 365.24
)

type Body struct {
	x, y, z    float64
	vx, vy, vz float64
	mass       float64
}

func jupiter() Body {
	return Body{
		x:    4.84143144246472090e+00,
		y:    -1.16032004402742839e+00,
		z:    -1.03622044471123109e-01,
		vx:   1.66007664274403694e-03 * DAYS_PER_YEAR,
		vy:   7.69901118419740425e-03 * DAYS_PER_YEAR,
		vz:   -6.90460016972063023e-05 * DAYS_PER_YEAR,
		mass: 9.54791938424326609e-04 * SOLAR_MASS,
	}
}

func saturn() Body {
	return Body{
		x:    8.34336671824457987e+00,
		y:    4.12479856412430479e+00,
		z:    -4.03523417114321381e-01,
		vx:   -2.76742510726862411e-03 * DAYS_PER_YEAR,
		vy:   4.99852801208914658e-03 * DAYS_PER_YEAR,
		vz:   2.30417297573763929e-05 * DAYS_PER_YEAR,
		mass: 2.85885980666130812e-04 * SOLAR_MASS,
	}
}

func uranus() Body {
	return Body{
		x:    1.28943695621391344e+01,
		y:    -1.51111514016986312e+01,
		z:    -2.23307578892655734e-01,
		vx:   2.96460137564761618e-03 * DAYS_PER_YEAR,
		vy:   2.37847173959480950e-03 * DAYS_PER_YEAR,
		vz:   -2.96589568540237556e-05 * DAYS_PER_YEAR,
		mass: 4.36624404335156298e-05 * SOLAR_MASS,
	}
}

func neptune() Body {
	return Body{
		x:    1.53796971148509165e+01,
		y:    -2.59193146099879641e+01,
		z:    1.79258772950371181e-01,
		vx:   2.68067772490389322e-03 * DAYS_PER_YEAR,
		vy:   1.62824170038242295e-03 * DAYS_PER_YEAR,
		vz:   -9.51592254519715870e-05 * DAYS_PER_YEAR,
		mass: 5.15138902046611451e-05 * SOLAR_MASS,
	}
}

func sun() Body {
	return Body{mass: SOLAR_MASS}
}

type NBodySystem struct {
	bodies []Body
}

func newNBodySystem(bodies []Body) *NBodySystem {
	var px, py, pz float64
	for i := range bodies {
		px += bodies[i].vx * bodies[i].mass
		py += bodies[i].vy * bodies[i].mass
		pz += bodies[i].vz * bodies[i].mass
	}
	bodies[0].vx = -px / SOLAR_MASS
	bodies[0].vy = -py / SOLAR_MASS
	bodies[0].vz = -pz / SOLAR_MASS
	return &NBodySystem{bodies: bodies}
}

func (system *NBodySystem) advance(dt float64) {
	bodies := system.bodies
	size := len(bodies)
	for i := 0; i < size; i++ {
		for j := i + 1; j < size; j++ {
			dx := bodies[i].x - bodies[j].x
			dy := bodies[i].y - bodies[j].y
			dz := bodies[i].z - bodies[j].z

			distanceSq := dx*dx + dy*dy + dz*dz
			distance := math.Sqrt(distanceSq)
			mag := dt / (distanceSq * distance)

			bodies[i].vx -= dx * bodies[j].mass * mag
			bodies[i].vy -= dy * bodies[j].mass * mag
			bodies[i].vz -= dz * bodies[j].mass * mag

			bodies[j].vx += dx * bodies[i].mass * mag
			bodies[j].vy += dy * bodies[i].mass * mag
			bodies[j].vz += dz * bodies[i].mass * mag
		}
	}
	for i := range bodies {
		bodies[i].x += dt * bodies[i].vx
		bodies[i].y += dt * bodies[i].vy
		bodies[i].z += dt * bodies[i].vz
	}
}

func (system *NBodySystem) energy() float64 {
	var e float64
	bodies := system.bodies
	size := len(bodies)
	for i := 0; i < size; i++ {
		bi := &bodies[i]
		e += 0.5 * bi.mass * (bi.vx*bi.vx + bi.vy*bi.vy + bi.vz*bi.vz)
		for j := i + 1; j < size; j++ {
			bj := &bodies[j]
			dx := bi.x - bj.x
			dy := bi.y - bj.y
			dz := bi.z - bj.z
			distance := math.Sqrt(dx*dx + dy*dy + dz*dz)
			e -= (bi.mass * bj.mass) / distance
		}
	}
	return e
}

func main() {
	iterations := 20000000
	if len(os.Args) > 1 {
		if val, err := strconv.Atoi(os.Args[1]); err == nil {
			iterations = val
		}
	}

	system := newNBodySystem([]Body{
		sun(),
		jupiter(),
		saturn(),
		uranus(),
		neptune(),
	})

	energyStart := system.energy()
	start := time.Now()

	for i := 0; i < iterations; i++ {
		system.advance(0.01)
	}

	elapsed := time.Since(start)
	energyEnd := system.energy()
	timeMs := float64(elapsed.Nanoseconds()) / 1e6

	fmt.Printf("{\n")
	fmt.Printf("  \"runtime\": \"go\",\n")
	fmt.Printf("  \"iterations\": %d,\n", iterations)
	fmt.Printf("  \"energyBefore\": %.9f,\n", energyStart)
	fmt.Printf("  \"energyAfter\": %.9f,\n", energyEnd)
	fmt.Printf("  \"timeMs\": %.2f,\n", timeMs)
	fmt.Printf("  \"ips\": %.2f\n", float64(iterations)/(float64(elapsed.Nanoseconds())/1e9))
	fmt.Printf("}\n")
}
