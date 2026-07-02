local PI = 3.141592653589793
local SOLAR_MASS = 4 * PI * PI
local DAYS_PER_YEAR = 365.24

local function Body(x, y, z, vx, vy, vz, mass)
  return {
    x = x, y = y, z = z,
    vx = vx, vy = vy, vz = vz,
    mass = mass
  }
end

local function jupiter()
  return Body(
    4.84143144246472090e+00,
    -1.16032004402742839e+00,
    -1.03622044471123109e-01,
    1.66007664274403694e-03 * DAYS_PER_YEAR,
    7.69901118419740425e-03 * DAYS_PER_YEAR,
    -6.90460016972063023e-05 * DAYS_PER_YEAR,
    9.54791938424326609e-04 * SOLAR_MASS
  )
end

local function saturn()
  return Body(
    8.34336671824457987e+00,
    4.12479856412430479e+00,
    -4.03523417114321381e-01,
    -2.76742510726862411e-03 * DAYS_PER_YEAR,
    4.99852801208914658e-03 * DAYS_PER_YEAR,
    2.30417297573763929e-05 * DAYS_PER_YEAR,
    2.85885980666130812e-04 * SOLAR_MASS
  )
end

local function uranus()
  return Body(
    1.28943695621391344e+01,
    -1.51111514016986312e+01,
    -2.23307578892655734e-01,
    2.96460137564761618e-03 * DAYS_PER_YEAR,
    2.37847173959480950e-03 * DAYS_PER_YEAR,
    -2.96589568540237556e-05 * DAYS_PER_YEAR,
    4.36624404335156298e-05 * SOLAR_MASS
  )
end

local function neptune()
  return Body(
    1.53796971148509165e+01,
    -2.59193146099879641e+01,
    1.79258772950371181e-01,
    2.68067772490389322e-03 * DAYS_PER_YEAR,
    1.62824170038242295e-03 * DAYS_PER_YEAR,
    -9.51592254519715870e-05 * DAYS_PER_YEAR,
    5.15138902046611451e-05 * SOLAR_MASS
  )
end

local function sun()
  return Body(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, SOLAR_MASS)
end

local function offset_momentum(bodies)
  local px, py, pz = 0.0, 0.0, 0.0
  for i = 1, #bodies do
    local b = bodies[i]
    px = px + b.vx * b.mass
    py = py + b.vy * b.mass
    pz = pz + b.vz * b.mass
  end
  bodies[1].vx = -px / SOLAR_MASS
  bodies[1].vy = -py / SOLAR_MASS
  bodies[1].vz = -pz / SOLAR_MASS
end

local function advance(bodies, dt)
  local size = #bodies
  for i = 1, size do
    local bi = bodies[i]
    for j = i + 1, size do
      local bj = bodies[j]
      local dx = bi.x - bj.x
      local dy = bi.y - bj.y
      local dz = bi.z - bj.z

      local distance_sq = dx * dx + dy * dy + dz * dz
      local distance = math.sqrt(distance_sq)
      local mag = dt / (distance_sq * distance)

      bi.vx = bi.vx - dx * bj.mass * mag
      bi.vy = bi.vy - dy * bj.mass * mag
      bi.vz = bi.vz - dz * bj.mass * mag

      bj.vx = bj.vx + dx * bi.mass * mag
      bj.vy = bj.vy + dy * bi.mass * mag
      bj.vz = bj.vz + dz * bi.mass * mag
    end
  end

  for i = 1, size do
    local b = bodies[i]
    b.x = b.x + dt * b.vx
    b.y = b.y + dt * b.vy
    b.z = b.z + dt * b.vz
  end
end

local function energy(bodies)
  local e = 0.0
  local size = #bodies
  for i = 1, size do
    local bi = bodies[i]
    e = e + 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz)
    for j = i + 1, size do
      local bj = bodies[j]
      local dx = bi.x - bj.x
      local dy = bi.y - bj.y
      local dz = bi.z - bj.z
      local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
      e = e - (bi.mass * bj.mass) / distance
    end
  end
  return e
end

local function main()
  local iterations = tonumber(arg[1]) or 20000000
  local runtime_name = arg[2] or "lua"
  local bodies = {
    sun(),
    jupiter(),
    saturn(),
    uranus(),
    neptune()
  }
  offset_momentum(bodies)

  local energy_start = energy(bodies)
  local start_time = os.clock()

  for i = 1, iterations do
    advance(bodies, 0.01)
  end

  local elapsed = os.clock() - start_time
  local energy_end = energy(bodies)
  local time_ms = elapsed * 1000.0

  local output = string.format([[
{
  "runtime": "%s",
  "iterations": %d,
  "energyBefore": %.9f,
  "energyAfter": %.9f,
  "timeMs": %.2f,
  "ips": %.2f
}
]], runtime_name, iterations, energy_start, energy_end, time_ms, iterations / elapsed)
  print(output)
end

main()
