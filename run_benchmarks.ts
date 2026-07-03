import * as colors from "jsr:@std/fmt/colors";
import * as path from "jsr:@std/path";
import { existsSync } from "jsr:@std/fs/exists";
import Table from "npm:cli-table3";
import * as p from "npm:@clack/prompts";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const HF_RUNS      = 5;
const HF_WARMUP    = 1;

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
// 1. Interactive TUI / Arguments Selection
// ─────────────────────────────────────────────────────────────────────────────
const validSuites = ["nbody", "mandelbrot", "binary_trees"];
let suitesToRun: string[] = [];

// Parse command line args
const args = Deno.args;
if (args.length > 0) {
    if (args.includes("--all")) {
        suitesToRun = [...validSuites];
    } else {
        // Look for comma-separated or space-separated list of suites
        const joined = args.join(",").toLowerCase();
        suitesToRun = validSuites.filter(s => joined.includes(s));
    }
}

// If no arguments and stdout is a terminal, use TUI
if (suitesToRun.length === 0) {
    if (Deno.stdin.isTerminal()) {
        p.intro(colors.bold(colors.green("Language Benchmarks Runner")));
        const selected = await p.multiselect({
            message: "Select benchmarks to run (Space to select, Enter to confirm)",
            options: [
                { value: "nbody", label: "N-Body Simulation", hint: "Float numerical loops (20M steps)" },
                { value: "mandelbrot", label: "Mandelbrot Set", hint: "Float math & SIMD (4k x 4k)" },
                { value: "binary_trees", label: "Binary Trees", hint: "GC & allocator stress (Depth 21)" }
            ],
            initialValues: ["nbody", "mandelbrot", "binary_trees"],
            required: true
        });
        if (p.isCancel(selected)) {
            p.cancel("Operation cancelled.");
            Deno.exit(0);
        }
        suitesToRun = selected as string[];
    } else {
        // Non-interactive fallback: run all
        suitesToRun = [...validSuites];
    }
}

if (suitesToRun.length === 0) {
    console.log(colors.red("No valid benchmarks selected to run. Exiting."));
    Deno.exit(1);
}

console.log(colors.green(`Selected benchmarks: ${suitesToRun.join(", ")}`));

// ─────────────────────────────────────────────────────────────────────────────
// 2. Environment detection
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

const powerPlan: string | null = (() => {
    if (!isWindows) return null;
    const out = getCmdOutput("wmic", ["path", "win32_powerplan", "get", "ElementName,IsActive"]);
    const line = out.split("\n").map(l => l.trim()).find(l => /TRUE|True/i.test(l));
    if (!line) return null;
    const plan = line.replace(/\s*(TRUE|True)\s*$/i, "").trim();
    return plan || null;
})();

const now       = new Date();
const runDate   = now.toLocaleString("en-CA", { hour12: false });

// ─────────────────────────────────────────────────────────────────────────────
// 3. Toolchain versions
// ─────────────────────────────────────────────────────────────────────────────
console.log("Detecting toolchain versions...");

const gccVer  = (() => { const m = getCmdOutput("gcc", ["--version"]).match(/(\d+\.\d+\.\d+)/); return m ? `GCC ${m[1]}` : "N/A"; })();
const gppVer  = (() => { const m = getCmdOutput("g++", ["--version"]).match(/(\d+\.\d+\.\d+)/); return m ? `G++ ${m[1]}` : "N/A"; })();
const rustVer = (() => { const m = getCmdOutput("rustc", ["--version"]).match(/rustc (\d+\.\d+\.\d+)/); return m ? `rustc ${m[1]}` : "N/A"; })();
const zigVer  = (() => { const v = getCmdOutput("zig", ["version"]); return v !== "N/A" ? `zig ${v}` : "N/A"; })();
const goVer   = (() => { const m = getCmdOutput("go", ["version"]).match(/go(\d+\.\d+\.\d+)/); return m ? `go ${m[1]}` : "N/A"; })();
const nodeVer = (() => { const v = getCmdOutput("node", ["--version"]); return v !== "N/A" ? `node ${v}` : "N/A"; })();
const denoVer = (() => { const m = getCmdOutput("deno", ["--version"]).match(/deno (\d+\.\d+\.\d+)/); return m ? `deno ${m[1]}` : "N/A"; })();
const bunVer  = (() => { const v = getCmdOutput("bun", ["--version"]); return v !== "N/A" ? `bun ${v}` : "N/A"; })();
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
// 4. Compile
// ─────────────────────────────────────────────────────────────────────────────
console.log(colors.yellow("\n═══ 2. Compilation (Release) ═══"));
Deno.mkdirSync("target", { recursive: true });

const C_FLAGS   = ["-O3", "-march=native", "-ffast-math"];
const CXX_FLAGS = ["-O3", "-march=native", "-ffast-math"];
const RUST_FLAGS = ["-C", "opt-level=3", "-C", "codegen-units=1", "-C", "panic=abort", "-C", "target-cpu=native", "-C", "lto=thin"];

for (const suite of suitesToRun) {
    console.log(colors.blue(`\n--- Compiling ${suite} ---`));
    
    // GCC C
    runCmd("gcc", [...C_FLAGS, "-o", `target/${suite}_c${exeSuffix}`, `benchmarks/${suite}/${suite}.c`]);
    
    // GCC C++
    runCmd("g++", [...CXX_FLAGS, "-o", `target/${suite}_cpp${exeSuffix}`, `benchmarks/${suite}/${suite}.cpp`]);

    // MSVC C++
    if (isWindows) {
        console.log(colors.cyan(`> cl.exe /std:c++17 /O2 /fp:fast /arch:AVX2 /GL ... /link /LTCG`));
        const msvcCmd = new Deno.Command("cmd.exe", {
            args: ["/c", `call "F:\\Program Files\\Microsoft Visual Studio\\18\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat" && cl /std:c++17 /O2 /fp:fast /arch:AVX2 /GL /Fo:target/${suite}.obj /Fe:target/${suite}_msvc.exe benchmarks/${suite}/${suite}.cpp /link /LTCG`],
            stdout: "inherit", stderr: "inherit", windowsRawArguments: true
        });
        const { code } = msvcCmd.outputSync();
        if (code !== 0) console.log(colors.yellow(`Warning: MSVC compilation failed for ${suite}.`));
        else { try { Deno.removeSync(`target/${suite}.obj`); } catch { /**/ } }
    }

    // Go
    runCmd("go", ["build", "-ldflags", "-s -w", "-o", `target/${suite}_go${exeSuffix}`, `benchmarks/${suite}/${suite}.go`]);
    
    // Rust
    runCmd("rustc", [...RUST_FLAGS, "-o", `target/${suite}_rust${exeSuffix}`, `benchmarks/${suite}/${suite}.rs`]);

    // Zig
    runCmd("zig", ["build-exe", "-O", "ReleaseFast", `-femit-bin=target/${suite}_zig`, `benchmarks/${suite}/${suite}.zig`]);
    if (isWindows && existsSync(`target/${suite}_zig`)) {
        Deno.renameSync(`target/${suite}_zig`, `target/${suite}_zig.exe`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Correctness verification
// ─────────────────────────────────────────────────────────────────────────────
console.log(colors.yellow("\n═══ 3. Correctness Verification ═══"));

interface CorrectnessResult {
    name: string;
    passed: boolean;
    output: string;
    details: string;
}

const REF_ENERGY_BEFORE = -0.169075164;
const ENERGY_TOL = 1e-6;
const REF_MANDEL_CHECKSUM = 397380;
const REF_TREES_CHECKSUM = 131759;

function verifyImplementation(
    suite: string,
    name: string,
    cmd: string,
    args: string[]
): CorrectnessResult {
    try {
        const proc = new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" });
        const { stdout, stderr, code } = proc.outputSync();
        const dec = new TextDecoder();
        
        // Output JSON is strictly expected on stdout. Stderr can contain general logging (like stretch tree messages)
        const stdoutText = dec.decode(stdout).trim();
        const stderrText = dec.decode(stderr).trim();
        
        if (code !== 0) {
            return { name, passed: false, output: stdoutText, details: `non-zero exit code ${code}. Stderr: ${stderrText}` };
        }
        
        const jsonStart = stdoutText.indexOf("{");
        if (jsonStart === -1) {
            return { name, passed: false, output: stdoutText, details: "no JSON found in stdout" };
        }
        
        const sanitized = stdoutText.slice(jsonStart)
            .replace(/:\s*[+-]?[Ii]nf(inity)?/g, ": 1e308")
            .replace(/:\s*[Nn]a[Nn]/g, ": 0");
            
        const data = JSON.parse(sanitized);
        
        if (suite === "nbody") {
            const eb = data.energyBefore;
            const ea = data.energyAfter;
            if (eb == null || ea == null) {
                return { name, passed: false, output: sanitized, details: "missing energy fields" };
            }
            const diff = Math.abs(eb - REF_ENERGY_BEFORE);
            const passed = diff < ENERGY_TOL;
            return {
                name,
                passed,
                output: `Before: ${eb.toFixed(9)}, After: ${ea.toFixed(9)}`,
                details: passed ? "PASS" : `energyBefore delta = ${diff.toExponential(2)}`
            };
        } else if (suite === "mandelbrot") {
            const cs = data.checksum;
            if (cs == null) {
                return { name, passed: false, output: sanitized, details: "missing checksum field" };
            }
            const passed = cs === REF_MANDEL_CHECKSUM;
            return {
                name,
                passed,
                output: `Checksum: ${cs}`,
                details: passed ? "PASS" : `expected ${REF_MANDEL_CHECKSUM}, got ${cs}`
            };
        } else { // binary_trees
            const cs = data.checksum;
            if (cs == null) {
                return { name, passed: false, output: sanitized, details: "missing checksum field" };
            }
            const passed = cs === REF_TREES_CHECKSUM;
            return {
                name,
                passed,
                output: `Checksum: ${cs}`,
                details: passed ? "PASS" : `expected ${REF_TREES_CHECKSUM}, got ${cs}`
            };
        }
    } catch (e) {
        return { name, passed: false, output: "", details: String(e) };
    }
}

const correctnessMap: Record<string, CorrectnessResult[]> = {};

for (const suite of suitesToRun) {
    console.log(colors.blue(`\nVerifying correctness of ${suite}...`));
    
    const sizeArg = suite === "binary_trees" ? "10" : "1000";
    
    const targets = [
        { name: "C (GCC)", cmd: `target/${suite}_c${exeSuffix}`, args: [sizeArg] },
        { name: "C++ (GCC)", cmd: `target/${suite}_cpp${exeSuffix}`, args: [sizeArg] },
        { name: "Rust", cmd: `target/${suite}_rust${exeSuffix}`, args: [sizeArg] },
        { name: "Zig", cmd: `target/${suite}_zig${exeSuffix}`, args: [sizeArg] },
        { name: "Go", cmd: `target/${suite}_go${exeSuffix}`, args: [sizeArg] },
        { name: "Node.js", cmd: "node", args: [`benchmarks/${suite}/${suite}.mjs`, "node", sizeArg] },
        { name: "Deno", cmd: "deno", args: ["run", "-A", `benchmarks/${suite}/${suite}.mjs`, "deno", sizeArg] },
        { name: "Bun", cmd: "bun", args: [`benchmarks/${suite}/${suite}.mjs`, "bun", sizeArg] },
    ];
    
    if (isWindows && existsSync(`target/${suite}_msvc.exe`)) {
        targets.push({ name: "C++ (MSVC)", cmd: `target/${suite}_msvc.exe`, args: [sizeArg] });
    }
    
    const suiteResults: CorrectnessResult[] = [];
    
    const table = new Table({
        head: [colors.bold("Runtime"), colors.bold("Output Summary"), colors.bold("Status")],
        style: { head: ["cyan"], border: ["gray"] }
    });
    
    for (const tgt of targets) {
        const res = verifyImplementation(suite, tgt.name, tgt.cmd, tgt.args);
        suiteResults.push(res);
        
        const status = res.passed
            ? colors.green("✓ PASS")
            : colors.red(`✗ FAIL  (${res.details})`);
        table.push([tgt.name, res.output, status]);
    }
    
    console.log(table.toString());
    correctnessMap[suite] = suiteResults;
    
    const allPass = suiteResults.every(r => r.passed);
    if (!allPass) {
        console.log(colors.red(`WARNING: Some correctness checks failed for ${suite}!`));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Benchmark (Hyperfine)
// ─────────────────────────────────────────────────────────────────────────────
console.log(colors.yellow("\n═══ 4. Hyperfine Benchmarks ═══"));

const suiteConfigs = {
    nbody: {
        args: ["20000000"],
        jsonOut: "target/results_nbody.json",
        title: "N-Body (5-body Solar System)",
        desc: "20M steps. Floating-point numerical loop."
    },
    mandelbrot: {
        args: ["8000"],
        jsonOut: "target/results_mandelbrot.json",
        title: "Mandelbrot",
        desc: "8k x 8k complex plane. Floats & SIMD efficiency."
    },
    binary_trees: {
        args: ["18"],
        jsonOut: "target/results_binary_trees.json",
        title: "Binary Trees",
        desc: "Max Depth 18. Dynamic allocations and GC stress."
    }
};

for (const suite of suitesToRun) {
    console.log(colors.blue(`\nRunning Hyperfine for ${suite}...`));
    const config = suiteConfigs[suite as keyof typeof suiteConfigs];
    
    if (existsSync(config.jsonOut)) {
        Deno.removeSync(config.jsonOut);
    }
    
    const runArgs = config.args[0];
    
    const targets = [
        `${pathPrefix}${suite}_c${exeSuffix} ${runArgs}`,
        `${pathPrefix}${suite}_cpp${exeSuffix} ${runArgs}`,
        `${pathPrefix}${suite}_rust${exeSuffix} ${runArgs}`,
        `${pathPrefix}${suite}_zig${exeSuffix} ${runArgs}`,
        `${pathPrefix}${suite}_go${exeSuffix} ${runArgs}`,
        `node benchmarks/${suite}/${suite}.mjs node ${runArgs}`,
        `deno run -A benchmarks/${suite}/${suite}.mjs deno ${runArgs}`,
        `bun benchmarks/${suite}/${suite}.mjs bun ${runArgs}`,
    ];
    
    if (isWindows && existsSync(`target/${suite}_msvc.exe`)) {
        targets.push(`${pathPrefix}${suite}_msvc.exe ${runArgs}`);
    }
    
    runCmd("hyperfine", [
        "--runs", String(HF_RUNS),
        "--warmup", String(HF_WARMUP),
        "--export-json", config.jsonOut,
        ...targets
    ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Report Generation (Separated Reports)
// ─────────────────────────────────────────────────────────────────────────────
console.log(colors.yellow("\n═══ 5. Generating Separated Reports ═══"));

interface BenchResult {
    command: string;
    mean: number;
    stddev: number;
    median: number;
    min: number;
    max: number;
}

function getDisplayInfo(cmd: string, suite: string) {
    if (cmd.includes(`${suite}_zig`)) return { display: "Zig", compiler: zigVer, flags: "-O ReleaseFast" };
    if (cmd.includes(`${suite}_rust`)) return { display: "Rust", compiler: rustVer, flags: "-C opt-level=3 ... lto=thin" };
    if (cmd.includes(`${suite}_msvc`)) return { display: "C++ (MSVC)", compiler: msvcVer, flags: "/O2 /fp:fast /arch:AVX2 /GL /LTCG" };
    if (cmd.includes(`${suite}_cpp`)) return { display: "C++ (GCC)", compiler: gppVer, flags: "-O3 -march=native -ffast-math" };
    if (cmd.includes(`${suite}_c`)) return { display: "C (GCC)", compiler: gccVer, flags: "-O3 -march=native -ffast-math" };
    if (cmd.includes(`${suite}_go`)) return { display: "Go", compiler: goVer, flags: "-ldflags \"-s -w\"" };
    if (cmd.includes("node")) return { display: "Node.js", compiler: nodeVer, flags: "V8 JIT" };
    if (cmd.includes("deno")) return { display: "Deno", compiler: denoVer, flags: "V8 JIT" };
    if (cmd.includes("bun")) return { display: "Bun", compiler: bunVer, flags: "JSC JIT" };
    return { display: cmd, compiler: "N/A", flags: "N/A" };
}

function buildSVG(suite: string, title: string, items: Array<{ name: string; mean: number }>): string {
    const W = 640, barH = 24, gap = 12, lPad = 130, rPad = 90, topPad = 55, botPad = 20;
    const totalH = topPad + botPad + items.length * (barH + gap) - gap;
    const maxMean = Math.max(...items.map(r => r.mean));
    const avail = W - lPad - rPad;
    
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="100%" style="background:#1a1a22;font-family:system-ui,sans-serif;border-radius:10px;">\n`;
    s += `  <text x="16" y="34" fill="#f1f3f5" font-size="14" font-weight="700">${title} · ${HF_RUNS} runs · Lower is better</text>\n`;
    items.forEach((it, i) => {
        const y = topPad + i * (barH + gap);
        const w = (it.mean / maxMean) * avail;
        const hue = Math.round((1 - it.mean / maxMean) * 120);
        const color = `hsl(${hue},68%,52%)`;
        const label = fmt(it.mean);
        s += `  <text x="${lPad - 8}" y="${y + barH - 6}" fill="#dee2e6" font-size="12" font-weight="500" text-anchor="end">${it.name}</text>\n`;
        s += `  <rect x="${lPad}" y="${y}" width="${avail}" height="${barH}" rx="5" fill="#2d2d3a"/>\n`;
        s += `  <rect x="${lPad}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="5" fill="${color}"/>\n`;
        s += `  <text x="${lPad + w + 7}" y="${y + barH - 6}" fill="#f8f9fa" font-size="11" font-weight="700">${label}</text>\n`;
    });
    s += `</svg>`;
    return s;
}

// Generate base name for this run
const YYYY = now.getFullYear(), MM = String(now.getMonth()+1).padStart(2,"0"), DD = String(now.getDate()).padStart(2,"0");
const dateStr   = `${YYYY}-${MM}-${DD}`;
const systemStr = `${Deno.build.os}_${Deno.build.arch}`;
await Deno.mkdir("report", { recursive: true });

let runNumber = 1;
for await (const e of Deno.readDir("report")) {
    if (e.isFile && e.name.startsWith(`${dateStr}_${systemStr}_run`) && e.name.endsWith(".md")) {
        const m = e.name.match(/_run(\d+)(?:_\w+)?\.md$/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n >= runNumber) runNumber = n + 1;
        }
    }
}

const baseRunName = `${dateStr}_${systemStr}_run${runNumber}`;

// Generate a separate report for each suite
for (const suite of suitesToRun) {
    const config = suiteConfigs[suite as keyof typeof suiteConfigs];
    const resultsFile = config.jsonOut;
    
    if (!existsSync(resultsFile)) {
        throw new Error(`${resultsFile} missing`);
    }
    
    const data = JSON.parse(Deno.readTextFileSync(resultsFile));
    const sorted: BenchResult[] = [...data.results].sort((a, b) => a.mean - b.mean);
    const fastest = sorted[0].mean;
    
    // Save SVG Chart for this specific benchmark
    const svgFileName = `${baseRunName}_${suite}.svg`;
    const svgPath = `report/${svgFileName}`;
    const svgContent = buildSVG(
        suite,
        config.title,
        sorted.map(r => ({ name: getDisplayInfo(r.command, suite).display, mean: r.mean }))
    );
    Deno.writeTextFileSync(svgPath, svgContent);
    console.log(colors.green(`✓ Chart Generated: ${svgPath}`));

    // Generate Markdown report for this specific benchmark
    const reportFileName = `${baseRunName}_${suite}.md`;
    const reportPath = `report/${reportFileName}`;
    
    let md = `# Benchmark Report: ${config.title} — ${baseRunName}\n\n`;
    md += `> **Benchmark Variant:** ${config.desc}\n\n`;

    // 🖥️ System Environment Section
    md += `## 🖥️ System Environment\n\n`;
    md += `| Field | Value |\n| :--- | :--- |\n`;
    md += `| Date | ${runDate} |\n`;
    md += `| OS | ${osVersion} |\n`;
    md += `| CPU | ${cpuModel} |\n`;
    md += `| Cores / Threads | ${cpuCores} cores, ${cpuThreads} threads |\n`;
    md += `| RAM | ${ramGB} @ ${ramMHz} |\n`;
    if (powerPlan) md += `| Power Plan | ${powerPlan} |\n`;
    md += `\n`;

    // 🛠️ Compiler & Runtime Configuration Section
    md += `## 🛠️ Compiler / Runtime Configuration\n\n`;
    md += `| Language | Runtime / Compiler | Optimization Flags | Notes |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    md += `| C | ${gccVer} | \`-O3 -march=native -ffast-math\` | |\n`;
    md += `| C++ (GCC) | ${gppVer} | \`-O3 -march=native -ffast-math\` | |\n`;
    if (isWindows && msvcVer !== "N/A") {
        md += `| C++ (MSVC) | ${msvcVer} | \`/O2 /std:c++17 /fp:fast /arch:AVX2 /GL /LTCG\` | Global optimization + Link-time code gen |\n`;
    }
    md += `| Rust | ${rustVer} | \`opt-level=3, codegen-units=1, panic=abort, target-cpu=native, lto=thin\` | |\n`;
    md += `| Zig | ${zigVer} | \`-O ReleaseFast\` | |\n`;
    md += `| Go | ${goVer} | \`-ldflags "-s -w"\` | |\n`;
    md += `| JavaScript (Node) | ${nodeVer} | — | V8 engine JIT |\n`;
    md += `| JavaScript (Deno) | ${denoVer} | — | Deno V8 engine JIT |\n`;
    md += `| JavaScript (Bun)  | ${bunVer}  | — | JSC engine JIT |\n`;
    md += `\n`;
    
    // Correctness Section
    md += `## ✅ Correctness Verification\n\n`;
    const rapidArg = suite === "binary_trees" ? "10" : "1000";
    md += `Checked with a rapid workload size of \`${rapidArg}\`:\n\n`;
    md += `| Runtime | Check Value / Output | Result |\n`;
    md += `| :--- | :--- | :---: |\n`;
    for (const r of correctnessMap[suite]) {
        md += `| ${r.name} | \`${r.output}\` | ${r.passed ? "✅ PASS" : "❌ FAIL"} |\n`;
    }
    md += `\n`;

    // Chart Section
    md += `## 📊 Performance Chart\n\n`;
    md += `![${config.title} performance chart](${svgFileName})\n\n`;

    // Results Section
    md += `## 📈 Results (sorted by mean time)\n\n`;
    md += `| # | Runtime | Version [Flags] | Min | Median | Mean | Max | StdDev | CV | Relative Runtime |\n`;
    md += `| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    
    sorted.forEach((r, i) => {
        const m = getDisplayInfo(r.command, suite);
        const rel = (r.mean / fastest).toFixed(2);
        const relStr = i === 0 ? "1.00× _(fastest)_ 🏆" : `${rel}×`;
        md += `| ${i+1} | **${m.display}** | ${m.compiler} \`[${m.flags}]\` | ${fmt(r.min)} | ${fmt(r.median)} | ${fmt(r.mean)} | ${fmt(r.max)} | ${fmt(r.stddev)} | ${cv(r.mean, r.stddev)} | ${relStr} |\n`;
    });
    md += `\n`;

    // Methodology/Notes Section for this suite
    md += `## 📝 Methodology & Notes\n\n`;
    if (suite === "nbody") {
        md += `- Measures pure floating point loop arithmetic and CPU pipeline scheduling.\n`;
        md += `- All implementations use standard double precision floats and identical initial conditions.\n`;
    } else if (suite === "mandelbrot") {
        md += `- Calculates the Mandelbrot set for a complex plane. Extremely floating-point intensive.\n`;
        md += `- Tested on a single thread to evaluate raw CPU vector operations and mathematical execution speed.\n`;
    } else if (suite === "binary_trees") {
        md += `- Tests pointer chasing, heap allocation, and garbage collection pressure.\n`;
        md += `- Zig and Rust use custom memory arena pools to achieve zero-allocation times, while JavaScript engines and Go rely on standard runtime garbage collectors.\n`;
    }
    md += `- Hyperfine includes a warmup iteration to eliminate JIT startup overhead.\n`;

    Deno.writeTextFileSync(reportPath, md);
    console.log(colors.green(`✓ Report Written: ${reportPath}`));
}

console.log(colors.bold(colors.green("\n✓ All selected benchmark reports successfully generated!")));
