package main

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

/* Binary Trees benchmark in Go.
   Idiomatic Go: struct pointers, GC handles deallocation. */

type Node struct {
	left, right *Node
}

func makeTree(depth int) *Node {
	if depth == 0 {
		return &Node{}
	}
	return &Node{left: makeTree(depth - 1), right: makeTree(depth - 1)}
}

func checkTree(n *Node) int64 {
	if n.left == nil {
		return 1
	}
	return 1 + checkTree(n.left) + checkTree(n.right)
}

func main() {
	maxDepth := 21
	if len(os.Args) > 1 {
		if v, err := strconv.Atoi(os.Args[1]); err == nil {
			maxDepth = v
		}
	}

	minDepth    := 4
	stretchDepth := maxDepth + 1

	t0 := time.Now()

	// Stretch tree
	{
		t := makeTree(stretchDepth)
		c := checkTree(t)
		fmt.Printf("stretch tree of depth %d\t check: %d\n", stretchDepth, c)
	}

	// Long-lived tree
	longLived := makeTree(maxDepth)

	var totalCheck int64
	for d := minDepth; d <= maxDepth; d += 2 {
		iterations := 1 << (maxDepth - d + minDepth)
		var c int64
		for i := 0; i < iterations; i++ {
			c += checkTree(makeTree(d))
		}
		totalCheck += c
	}

	llCheck := checkTree(longLived)
	elapsed := time.Since(t0)
	timeMs := float64(elapsed.Nanoseconds()) / 1e6

	fmt.Printf("{\n")
	fmt.Printf("  \"runtime\": \"go\",\n")
	fmt.Printf("  \"maxDepth\": %d,\n", maxDepth)
	fmt.Printf("  \"checksum\": %d,\n", totalCheck+llCheck)
	fmt.Printf("  \"timeMs\": %.2f\n", timeMs)
	fmt.Printf("}\n")
}
