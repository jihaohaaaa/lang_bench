package main

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

func mandelbrot(cr, ci float64, limit int) bool {
	var zr, zi float64
	for i := 0; i < limit; i++ {
		zr2 := zr * zr
		zi2 := zi * zi
		if zr2+zi2 > 4.0 {
			return false
		}
		zi = 2.0*zr*zi + ci
		zr = zr2 - zi2 + cr
	}
	return true
}

func main() {
	n := 16000
	if len(os.Args) > 1 {
		if v, err := strconv.Atoi(os.Args[1]); err == nil {
			n = v
		}
	}

	const limit = 50
	var count int64

	t0 := time.Now()

	for y := 0; y < n; y++ {
		ci := 2.0*float64(y)/float64(n) - 1.0
		for x := 0; x < n; x++ {
			cr := 2.0*float64(x)/float64(n) - 1.5
			if mandelbrot(cr, ci, limit) {
				count++
			}
		}
	}

	elapsed := time.Since(t0)
	timeMs := float64(elapsed.Nanoseconds()) / 1e6

	fmt.Printf("{\n")
	fmt.Printf("  \"runtime\": \"go\",\n")
	fmt.Printf("  \"n\": %d,\n", n)
	fmt.Printf("  \"checksum\": %d,\n", count)
	fmt.Printf("  \"timeMs\": %.2f\n", timeMs)
	fmt.Printf("}\n")
}
