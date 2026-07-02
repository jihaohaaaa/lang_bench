import * as colors from "jsr:@std/fmt/colors";
import * as path from "jsr:@std/path";
import { existsSync } from "jsr:@std/fs/exists";
import Table from "npm:cli-table3";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const STEPS        = 20_000_000;
const DT           = 0.01;
const BODIES       = 5;
const HF_RUNS      = 30;
const HF_WARMUP    = 1;
const REF_ENERGY_BEFORE = -0.169075164; // Expected initial system energy
const ENERGY_TOL   = 1e-6;

const isWindows  = Deno.build.os === "windows";
const exeSuffix  = isWindows ? ".exe" : "";
const pathPrefix = isWindows ? "target\\" : "./target/";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getCmdOutput(cmd: string, args: string[], opts: Deno.CommandOptions = {}): string {
    try {
        const result = new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped", ...opts }).outputSync();
        const dec = new TextDecoder();
        return (result.code === 0 ? dec.decode(result.stdout) : dec.decode(result.stderr)).trim();
    } catch {
        return "N/A";
    }
}

function runCmd(cmd: string, args: string[], opts: Deno.CommandOptions = {}): void {
    console.log(colors.cyan(`> ${cmd} ${args.join(" ")}`));
    const result = new Deno.Command(cmd, { args, stdout: "inherit", stderr: "inherit", ...opts }).outputSync();
    if (result.code !== 0) throw new Error(`Exit ${result.code}: ${cmd}`);
}

function fmt(secs: number): string {
    return secs < 1 ? `${(secs * 1000).toFixed(1)} ms` : `${secs.toFixed(3)} s`;
}

function cv(mean: number, stddev: number): string {
    return `${((stddev / mean) * 100).toFixed(1)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Environment detection
// ─────────────────────────────────────────────────────────────────────────────
console.log(colors.yellow("\n═══ 1. Environment Detection ═══"));

function wmicGet(cls: string, field: string): string {
    return getCmdOutput("wmic", [cls, "get", field])
        .split("\n").map(l => l.trim()).filter(l => l && l !== field)[0] ?? "N/A";
}

const osVersion  = isWindows
    ? getCmdOutput("cmd.exe", ["/c", "ver"])
    : getCmdOutput("uname", ["-sr"]);

const cpuModel   = isWindows
    ? wmicGet("cpu", "Name")
    : Deno.build.os === "darwin"
        ? getCmdOutput("sysctl", ["-n", "machdep.cpu.brand_string"])
        : (() => {
            try { return Deno.readTextFileSync("/proc/cpuinfo").split("\n").find(l => l.startsWith("model name"))?.split(":")[1]?.trim() ?? "N/A"; }
            catch { return "N/A"; }
          })();

const cpuCores   = isWindows ? wmicGet("cpu", "NumberOfCores") : "N/A";
const cpuThreads = isWindows ? wmicGet("cpu", "NumberOfLogicalProcessors") : "N/A";

const ramGB: string = (() => {
    if (!isWindows) return "N/A";
    const raw = wmicGet("ComputerSystem", "TotalPhysicalMemory");
    const n = parseInt(raw, 10);
    return isNaN(n) ? "N/A" : `${(n / (1024 ** 3)).toFixed(0)} GB`;
})();

const ramMHz: string = (() => {
    if (!isWindows) return "N/A";
    const raw = wmicGet("MemoryChip", "Speed");
    return raw !== "N/A" ? `${raw} MHz` : "N/A";
})();

// Only show power plan if readable
const powerPlan: string | null = (() => {
    if (!isWindows) return null;
    const out = getCmdOutput("wmic", ["path", "win32_powerplan", "get", "ElementName,IsActive"]);
    const line = out.split("\n").map(l => l.trim()).find(l => /TRUE|True/i.test(l));
    if (!line) return null;
    const plan = line.replace(/\s*(TRUE|True)\s*$/i, "").trim();
    return plan || null;
})();

const now       = new Date();
const runDate   = now.toLocaleString("en-CA", { hour12: false }); // ISO-ish locale

// ─────────────────────────────────────────────────────────────────────────────
// 2. Toolchain versions
// ─────────────────────────────────────────────────────────────────────────────
console.log("Detecting toolchain versions...");

const gccVer  = (() => { const m = getCmdOutput("gcc", ["--version"]).match(/(\d+\.\d+\.\d+)/); return m ? `GCC ${m[1]}` : "N/A"; })();
const gppVer  = (() => { const m = getCmdOutput("g++", ["--version"]).match(/(\d+\.\d+\.\d+)/); return m ? `G++ ${m[1]}` : "N/A"; })();
const rustVer = (() => { const m = getCmdOutput("rustc", ["--version"]).match(/rustc (\d+\.\d+\.\d+)/); return m ? `rustc ${m[1]}` : "N/A"; })();
const zigVer  = (() => { const v = getCmdOutput("zig", ["version"]); return v !== "N/A" ? `zig ${v}` : "N/A"; })();
const goVer   = (() => { const m = getCmdOutput("go", ["version"]).match(/go(\d+\.\d+\.\d+)/); return m ? `go ${m[1]}` : "N/A"; })();
const juliaVer= (() => { const m = getCmdOutput("julia", ["--version"]).match(/(\d+\.\d+\.\d+)/); return m ? `julia ${m[1]}` : "N/A"; })();
const nodeVer = (() => { const v = getCmdOutput("node", ["--version"]); return v !== "N/A" ? `node ${v}` : "N/A"; })();
const denoVer = (() => { const m = getCmdOutput("deno", ["--version"]).match(/deno (\d+\.\d+\.\d+)/); return m ? `deno ${m[1]}` : "N/A"; })();
const bunVer  = (() => { const v = getCmdOutput("bun", ["--version"]); return v !== "N/A" ? `bun ${v}` : "N/A"; })();
const luajitVer = (() => { const m = getCmdOutput("luajit", ["-v"]).match(/LuaJIT (\d+\.\d+\.\d+[-\w]*)/); return m ? `luajit ${m[1]}` : "N/A"; })();
const hfVer   = (() => { const m = getCmdOutput("hyperfine", ["--version"]).match(/(\d+\.\d+\.\d+)/); return m ? `hyperfine ${m[1]}` : "N/A"; })();

let msvcVer = "N/A";
if (isWindows) {
    const command = new Deno.Command("cmd.exe", {
        args: ["/c", 'call "F:\\Program Files\\Microsoft Visual Studio\\18\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat" && cl'],
        stdout: "piped", stderr: "piped", windowsRawArguments: true
    });
    const { stdout, stderr } = command.outputSync();
    const dec = new TextDecoder();
    const out = dec.decode(stdout) + "\n" + dec.decode(stderr);
    const m = out.split("\n").find(l => l.includes("Optimizing Compiler"))?.match(/Version (\d+\.\d+\.\d+)/);
    if (m) msvcVer = `cl ${m[1]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Compile
// ─────────────────────────────────────────────────────────────────────────────
console.log(colors.yellow("\n═══ 2. Compilation (Release) ═══"));
Deno.mkdirSync("target", { recursive: true });

// C flags
const C_FLAGS   = ["-O3", "-march=native", "-ffast-math"];
const CXX_FLAGS = ["-O3", "-march=native", "-ffast-math"];
// Rust: lto=thin is effective on single-file; fat caused ~35% regression in testing
const RUST_FLAGS = ["-C", "opt-level=3", "-C", "codegen-units=1", "-C", "panic=abort", "-C", "target-cpu=native", "-C", "lto=thin"];

try {
    runCmd("gcc", [...C_FLAGS,   "-o", `target/nbody_c${exeSuffix}`,   "nbody.c"]);
    runCmd("g++", [...CXX_FLAGS, "-o", `target/nbody_cpp${exeSuffix}`, "nbody.cpp"]);

    if (isWindows) {
        console.log(colors.cyan('> cl.exe /O2 /fp:fast /arch:AVX2 /GL ... /link /LTCG'));
        const msvcCmd = new Deno.Command("cmd.exe", {
            args: ["/c", 'call "F:\\Program Files\\Microsoft Visual Studio\\18\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat" && cl /O2 /fp:fast /arch:AVX2 /GL /Fo:target/nbody.obj /Fe:target/nbody_msvc.exe nbody.cpp /link /LTCG'],
            stdout: "inherit", stderr: "inherit", windowsRawArguments: true
        });
        const { code } = msvcCmd.outputSync();
        if (code !== 0) console.log(colors.yellow("Warning: MSVC compilation failed."));
        else { try { Deno.removeSync("target/nbody.obj"); } catch { /**/ } }
    }

    runCmd("go",  ["build", "-ldflags", "-s -w", "-o", `target/nbody_go${exeSuffix}`, "nbody.go"]);
    runCmd("rustc", [...RUST_FLAGS, "-o", `target/nbody_rust${exeSuffix}`, "nbody.rs"]);

    runCmd("zig", ["build-exe", "-O", "ReleaseFast", "-femit-bin=target/nbody_zig", "nbody.zig"]);
    if (isWindows && existsSync("target/nbody_zig")) {
        Deno.renameSync("target/nbody_zig", "target/nbody_zig.exe");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Correctness verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log(colors.yellow("\n═══ 3. Correctness Verification ═══"));

    interface CorrectnessResult { name: string; energyBefore: number | null; energyAfter: number | null; pass: boolean; note: string; }

    function verifyBinary(name: string, cmd: string, args: string[]): CorrectnessResult {
        try {
            const proc = new Deno.Command(cmd, { args: [...args, "1000"], stdout: "piped", stderr: "piped" });
            const { stdout, stderr, code } = proc.outputSync();
            if (code !== 0) return { name, energyBefore: null, energyAfter: null, pass: false, note: "non-zero exit" };
            const dec = new TextDecoder();
            // Zig writes to stderr (std.debug.print), others to stdout — try both
            const combined = dec.decode(stdout) + dec.decode(stderr);
            const jsonStart = combined.indexOf("{");
            if (jsonStart === -1) return { name, energyBefore: null, energyAfter: null, pass: false, note: "no JSON in output" };
            // Sanitize non-standard JSON numeric tokens: inf, +Inf, -Inf, nan
            const sanitized = combined.slice(jsonStart)
                .replace(/:\s*[+-]?[Ii]nf(inity)?/g, ": 1e308")
                .replace(/:\s*[Nn]a[Nn]/g, ": 0");
            const json = JSON.parse(sanitized);
            const eb: number = json.energyBefore;
            const ea: number = json.energyAfter;
            const pass = Math.abs(eb - REF_ENERGY_BEFORE) < ENERGY_TOL;
            return { name, energyBefore: eb, energyAfter: ea, pass, note: pass ? "PASS" : `energyBefore delta=${(eb - REF_ENERGY_BEFORE).toExponential(2)}` };
        } catch (e) {
            return { name, energyBefore: null, energyAfter: null, pass: false, note: String(e) };
        }
    }

    const correctnessChecks: CorrectnessResult[] = [
        verifyBinary("C (GCC)",    `target/nbody_c${exeSuffix}`,    []),
        verifyBinary("C++ (GCC)",  `target/nbody_cpp${exeSuffix}`,  []),
        verifyBinary("Rust",       `target/nbody_rust${exeSuffix}`, []),
        verifyBinary("Zig",        `target/nbody_zig${exeSuffix}`,  []),
        verifyBinary("Go",         `target/nbody_go${exeSuffix}`,   []),
        verifyBinary("Julia",      "julia",  ["nbody.jl"]),
        verifyBinary("Node.js",    "node",   ["nbody_benchmark.mjs", "node"]),
        verifyBinary("Deno",       "deno",   ["run", "-A", "nbody_benchmark.mjs", "deno"]),
        verifyBinary("Bun",        "bun",    ["nbody_benchmark.mjs", "bun"]),
        verifyBinary("LuaJIT",     "luajit", ["nbody_benchmark.lua", "1000", "luajit"]),
    ];
    if (isWindows && existsSync("target/nbody_msvc.exe")) {
        correctnessChecks.push(verifyBinary("C++ (MSVC)", "target/nbody_msvc.exe", []));
    }

    const corTable = new Table({
        head: [colors.bold("Runtime"), colors.bold("energyBefore"), colors.bold("energyAfter (1k steps)"), colors.bold("Status")],
        style: { head: ["cyan"], border: ["gray"] }
    });
    for (const r of correctnessChecks) {
        const status = r.pass ? colors.green("✓ PASS") : colors.red(`✗ FAIL  ${r.note}`);
        corTable.push([r.name, r.energyBefore?.toFixed(9) ?? "N/A", r.energyAfter?.toFixed(9) ?? "N/A", status]);
    }
    console.log(corTable.toString());
    const allPass = correctnessChecks.every(r => r.pass);
    if (!allPass) console.log(colors.red("WARNING: Some correctness checks failed – results may not be comparable!"));

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Benchmark
    // ─────────────────────────────────────────────────────────────────────────
    console.log(colors.yellow("\n═══ 4. Hyperfine Benchmark ═══"));
    if (existsSync("target/results.json")) Deno.removeSync("target/results.json");

    const targets: string[] = [
        `${pathPrefix}nbody_c${exeSuffix}`,
        `${pathPrefix}nbody_cpp${exeSuffix} gcc`,
        `${pathPrefix}nbody_rust${exeSuffix}`,
        `${pathPrefix}nbody_zig${exeSuffix}`,
        `${pathPrefix}nbody_go${exeSuffix}`,
        "julia nbody.jl 20000000",
        "node nbody_benchmark.mjs node",
        "deno run -A nbody_benchmark.mjs deno",
        "bun nbody_benchmark.mjs bun",
        "luajit nbody_benchmark.lua 20000000 luajit",
    ];
    if (isWindows && existsSync("target/nbody_msvc.exe")) {
        targets.push(`${pathPrefix}nbody_msvc.exe msvc`);
    }

    runCmd("hyperfine", [
        "--runs",   String(HF_RUNS),
        "--warmup", String(HF_WARMUP),
        "--export-json", "target/results.json",
        ...targets
    ]);

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Report generation
    // ─────────────────────────────────────────────────────────────────────────
    console.log(colors.yellow("\n═══ 5. Generating Report ═══"));
    if (!existsSync("target/results.json")) throw new Error("results.json missing");

    interface BenchResult { command: string; mean: number; stddev: number; median: number; min: number; max: number; }
    const data = JSON.parse(Deno.readTextFileSync("target/results.json"));
    const sorted: BenchResult[] = [...data.results].sort((a, b) => a.mean - b.mean);
    const fastest = sorted[0].mean;

    // ── Runtime metadata ──
    interface RuntimeMeta { display: string; compiler: string; flags: string; lang: string; notes: string; }
    function getMeta(cmd: string): RuntimeMeta {
        if (cmd.includes("nbody_zig"))                        return { display: "Zig",        compiler: zigVer,   flags: "-O ReleaseFast",                              lang: "Zig",      notes: "Stack-allocated [5]Body array, compile-time bounds" };
        if (cmd.includes("nbody_rust"))                       return { display: "Rust",       compiler: rustVer,  flags: "opt-level=3, target-cpu=native, lto=thin",   lang: "Rust",     notes: "Vec<Body> heap-allocated; unsafe inner loop" };
        if (cmd.includes("nbody_msvc"))                       return { display: "C++ (MSVC)", compiler: msvcVer,  flags: "/O2 /fp:fast /arch:AVX2 /GL /LTCG",          lang: "C++",      notes: "" };
        if (cmd.includes("nbody_cpp"))                        return { display: "C++ (GCC)",  compiler: gppVer,   flags: "-O3 -march=native -ffast-math",               lang: "C++",      notes: "" };
        if (cmd.includes("nbody_c"))                          return { display: "C (GCC)",    compiler: gccVer,   flags: "-O3 -march=native -ffast-math",               lang: "C",        notes: "" };
        if (cmd.includes("nbody_go"))                         return { display: "Go",         compiler: goVer,    flags: "-ldflags \"-s -w\"",                          lang: "Go",       notes: "No explicit SIMD control; GC may affect variance" };
        if (cmd.includes("julia"))                            return { display: "Julia",      compiler: juliaVer, flags: "@fastmath + @inbounds",                       lang: "Julia",    notes: "LLVM JIT; includes JIT compilation overhead despite warmup" };
        if (cmd.includes("node"))                             return { display: "Node.js",    compiler: nodeVer,  flags: "V8 TurboFan JIT",                            lang: "JS",       notes: "TypedArray (Float64Array)" };
        if (cmd.includes("deno"))                             return { display: "Deno",       compiler: denoVer,  flags: "V8 TurboFan JIT",                            lang: "JS",       notes: "TypedArray (Float64Array)" };
        if (cmd.includes("bun"))                              return { display: "Bun",        compiler: bunVer,   flags: "JSC JIT",                                     lang: "JS",       notes: "TypedArray (Float64Array)" };
        if (cmd.includes("luajit"))                           return { display: "LuaJIT",     compiler: luajitVer,flags: "JIT (DYJIT)",                                 lang: "Lua",      notes: "Plain Lua tables; no FFI" };
        return { display: cmd, compiler: "N/A", flags: "N/A", lang: "N/A", notes: "" };
    }

    // ── Console table ──
    const consoleTable = new Table({
        head: [
            colors.bold("#"),
            colors.bold("Runtime"),
            colors.bold("Compiler / Version"),
            colors.bold("Min"),
            colors.bold("Median"),
            colors.bold("Mean"),
            colors.bold("Max"),
            colors.bold("StdDev"),
            colors.bold("CV"),
            colors.bold("Relative Runtime"),
        ],
        style: { head: ["cyan"], border: ["gray"] }
    });

    sorted.forEach((r, i) => {
        const m = getMeta(r.command);
        const rel = r.mean / fastest;
        const relStr = i === 0 ? colors.green("1.00× (fastest) 🏆") : colors.yellow(`${rel.toFixed(2)}×`);
        consoleTable.push([
            String(i + 1),
            i === 0 ? colors.green(colors.bold(m.display)) : m.display,
            m.compiler,
            fmt(r.min), fmt(r.median), fmt(r.mean), fmt(r.max), fmt(r.stddev),
            cv(r.mean, r.stddev),
            relStr
        ]);
    });

    console.log("\n" + colors.bold(colors.green("═══ Performance Results (sorted by mean time) ═══")));
    console.log(consoleTable.toString());

    // ── SVG chart ──
    function buildSVG(items: Array<{ name: string; mean: number }>): string {
        const W = 640, barH = 24, gap = 12, lPad = 130, rPad = 90, topPad = 55, botPad = 20;
        const totalH = topPad + botPad + items.length * (barH + gap) - gap;
        const maxMean = Math.max(...items.map(r => r.mean));
        const avail = W - lPad - rPad;
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="100%" style="background:#1a1a22;font-family:system-ui,sans-serif;border-radius:10px;">\n`;
        s += `  <text x="16" y="34" fill="#f1f3f5" font-size="14" font-weight="700">N-Body (5-body Solar System) · ${HF_RUNS} runs · Lower is better</text>\n`;
        items.forEach((it, i) => {
            const y = topPad + i * (barH + gap);
            const w = (it.mean / maxMean) * avail;
            const hue = Math.round((1 - it.mean / maxMean) * 120);
            const color = `hsl(${hue},68%,52%)`;
            const label = it.mean < 1 ? `${(it.mean * 1000).toFixed(0)} ms` : `${it.mean.toFixed(3)} s`;
            s += `  <text x="${lPad - 8}" y="${y + barH - 6}" fill="#dee2e6" font-size="12" font-weight="500" text-anchor="end">${it.name}</text>\n`;
            s += `  <rect x="${lPad}" y="${y}" width="${avail}" height="${barH}" rx="5" fill="#2d2d3a"/>\n`;
            s += `  <rect x="${lPad}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="5" fill="${color}"/>\n`;
            s += `  <text x="${lPad + w + 7}" y="${y + barH - 6}" fill="#f8f9fa" font-size="11" font-weight="700">${label}</text>\n`;
        });
        s += `</svg>`;
        return s;
    }

    // ── Naming / folders ──
    const YYYY = now.getFullYear(), MM = String(now.getMonth()+1).padStart(2,"0"), DD = String(now.getDate()).padStart(2,"0");
    const dateStr   = `${YYYY}-${MM}-${DD}`;
    const systemStr = `${Deno.build.os}_${Deno.build.arch}`;
    await Deno.mkdir("report", { recursive: true });

    let runNumber = 1;
    for await (const e of Deno.readDir("report")) {
        if (e.isFile && e.name.startsWith(`${dateStr}_${systemStr}_run`) && e.name.endsWith(".md")) {
            const m = e.name.match(/_run(\d+)\.md$/);
            if (m) { const n = parseInt(m[1], 10); if (n >= runNumber) runNumber = n + 1; }
        }
    }

    const baseName     = `${dateStr}_${systemStr}_run${runNumber}`;
    const reportPath   = `report/${baseName}.md`;
    const chartPath    = `report/${baseName}.svg`;

    // ── Build SVG ──
    Deno.writeTextFileSync(chartPath, buildSVG(sorted.map(r => ({ name: getMeta(r.command).display, mean: r.mean }))));

    // ── Build Markdown ──
    const hasMsvc = isWindows && existsSync("target/nbody_msvc.exe");
    const correctnessMap = new Map(correctnessChecks.map(r => [r.name, r]));

    let md = `# N-Body Benchmark Report — ${baseName}\n\n`;
    md += `> **Benchmark Variant:** Computer Language Benchmarks Game · 5-body Solar System\n\n`;

    // System Environment
    md += `## 🖥️ System Environment\n\n`;
    md += `| Field | Value |\n| :--- | :--- |\n`;
    md += `| Date | ${runDate} |\n`;
    md += `| OS | ${osVersion} |\n`;
    md += `| CPU | ${cpuModel} |\n`;
    md += `| Cores / Threads | ${cpuCores} cores, ${cpuThreads} threads |\n`;
    md += `| RAM | ${ramGB} @ ${ramMHz} |\n`;
    if (powerPlan) md += `| Power Plan | ${powerPlan} |\n`;
    md += `\n`;

    // Benchmark Specifications
    md += `## 🔬 Benchmark Specifications\n\n`;
    md += `| Parameter | Value |\n| :--- | :--- |\n`;
    md += `| Benchmark variant | Computer Language Benchmarks Game — 5-body Solar System |\n`;
    md += `| Bodies | ${BODIES} (Sun, Jupiter, Saturn, Uranus, Neptune) |\n`;
    md += `| Steps | ${STEPS.toLocaleString()} |\n`;
    md += `| dt | ${DT} |\n`;
    md += `| Threading | Single-threaded |\n`;
    md += `| Output (inside loop) | None — only final energy value printed as correctness checksum |\n`;
    md += `| Native ISA optimization | \`-march=native\` / \`/arch:AVX2\` enabled for compiled languages; automatic vectorization depends on each compiler's optimizer |\n`;
    md += `| Benchmark tool | ${hfVer} |\n`;
    md += `| Runs | ${HF_RUNS} (+ ${HF_WARMUP} warmup to allow JIT stabilisation) |\n`;
    md += `| Statistics | Mean, Median, Min, Max, StdDev, CV |\n`;
    md += `\n`;

    // Compiler Configuration table
    md += `## 🛠️ Compiler / Runtime Configuration\n\n`;
    md += `| Language | Runtime / Compiler | Optimization Flags | Notes |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    md += `| C | ${gccVer} | \`-O3 -march=native -ffast-math\` | |\n`;
    md += `| C++ | ${gppVer} | \`-O3 -march=native -ffast-math\` | |\n`;
    if (hasMsvc) md += `| C++ | ${msvcVer} | \`/O2 /fp:fast /arch:AVX2 /GL /LTCG\` | Global optimization + Link-time code gen |\n`;
    md += `| Rust | ${rustVer} | \`opt-level=3, codegen-units=1, panic=abort, target-cpu=native, lto=thin\` | \`Vec<Body>\` (heap); \`unsafe\` inner loop |\n`;
    md += `| Zig | ${zigVer} | \`-O ReleaseFast\` | \`[5]Body\` stack array; compile-time bounds |\n`;
    md += `| Go | ${goVer} | \`-ldflags "-s -w"\` | No explicit SIMD; GC pauses may affect variance |\n`;
    md += `| Julia | ${juliaVer} | \`@fastmath\` + \`@inbounds\` | LLVM JIT; JIT overhead present even after warmup |\n`;
    md += `| JavaScript | ${nodeVer} (V8 TurboFan) | — | \`Float64Array\` typed arrays |\n`;
    md += `| JavaScript | ${denoVer} (V8 TurboFan) | — | \`Float64Array\` typed arrays |\n`;
    md += `| JavaScript | ${bunVer} (JSC JIT) | — | \`Float64Array\` typed arrays |\n`;
    md += `| Lua | ${luajitVer} (DynASM JIT) | — | Plain Lua tables; no FFI |\n`;
    md += `\n`;

    // Correctness
    md += `## ✅ Correctness Verification\n\n`;
    md += `All implementations run with **1,000 steps** and their initial system energy is compared against the reference value.\n\n`;
    md += `> **Reference energyBefore** = \`${REF_ENERGY_BEFORE}\` (tolerance ± ${ENERGY_TOL})\n\n`;
    md += `| Runtime | energyBefore | energyAfter (1k steps) | Result |\n`;
    md += `| :--- | :---: | :---: | :---: |\n`;
    for (const r of correctnessChecks) {
        const status = r.pass ? "✅ PASS" : `❌ FAIL (${r.note})`;
        md += `| ${r.name} | \`${r.energyBefore?.toFixed(9) ?? "N/A"}\` | \`${r.energyAfter?.toFixed(9) ?? "N/A"}\` | ${status} |\n`;
    }
    md += `\n`;

    // Chart
    md += `## 📊 Performance Chart\n\n`;
    md += `![Performance chart](${baseName}.svg)\n\n`;

    // Results table
    md += `## 📈 Results (sorted by mean time)\n\n`;
    md += `| # | Runtime | Compiler / Version | Min | Median | Mean | Max | StdDev | CV | Relative Runtime |\n`;
    md += `| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

    sorted.forEach((r, i) => {
        const m   = getMeta(r.command);
        const rel = (r.mean / fastest).toFixed(2);
        const relStr = i === 0 ? "1.00× _(fastest)_" : `${rel}×`;
        md += `| ${i+1} | **${m.display}** | ${m.compiler} \`[${m.flags}]\` | ${fmt(r.min)} | ${fmt(r.median)} | ${fmt(r.mean)} | ${fmt(r.max)} | ${fmt(r.stddev)} | ${cv(r.mean, r.stddev)} | ${relStr} |\n`;
    });
    md += `\n`;

    // Implementation notes
    md += `## 📝 Implementation Notes & Fairness\n\n`;
    md += `- **Algorithm**: All implementations use the same O(n²) pairwise force calculation with identical initial conditions.\n`;
    md += `- **Zig vs Rust gap**: Zig uses a compile-time \`[5]Body\` stack array enabling full inlining and bound elimination; Rust uses \`Vec<Body>\` (heap) with \`unsafe\` raw-pointer inner loop. This structural difference, not compiler quality, explains the gap.\n`;
    md += `- **MSVC vs GCC**: With \`/arch:AVX2 /GL /LTCG\` enabled, the gap narrows compared to \`/O2\` alone.\n`;
    md += `- **JIT runtimes** (Julia, Node, Deno, Bun, LuaJIT): 1 warmup run included before timing; true JIT steady-state may require more iterations to fully optimise.\n`;
    md += `- **Go GC**: Go's garbage collector may introduce occasional pauses visible in max/StdDev spread.\n`;
    md += `- **LuaJIT**: Uses standard Lua tables (no FFI). FFI-based implementations can be several times faster.\n`;
    md += `\n`;

    Deno.writeTextFileSync(reportPath, md);
    console.log(colors.green(`\n✓ Report → ${path.resolve(reportPath)}`));
    console.log(colors.green(`✓ Chart  → ${path.resolve(chartPath)}`));

} catch (err) {
    console.error(colors.red("Error:"), err);
    Deno.exit(1);
}
