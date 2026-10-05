// Shared definitions of the tuning simulator: the memory tags under [cal1615]Sim/ and the two simulated loops
// (Sim Oven, Sim Tension) that the PID Tuning page and cal1615.tunerun treat like real loops.
// Used by tuning_sim.js (tags + simulator script) and pid_tuning.js (loop registry, page controls).
const c = (t) => `[cal1615]Sim/${t}`;

// [name, dataType, initial value]
const ZONE_TAGS = [
  ["pv", "Float4", 70.0], ["sp", "Float4", 165.0], ["sp_w", "Float4", 165.0], ["cv", "Float4", 0.0],
  ["status", "Int4", 2], ["faults_ok", "Boolean", true], ["auto", "Boolean", true],
  ["hl", "Float4", 250.0], ["dev", "Float4", 10.0], ["soak_to_fast", "Float4", 8.0],
  // Auto PID (near SP) and Fast PID (large error): the active value and the HMI input the PLC copies from
  ["kp", "Float4", 1.0], ["ki", "Float4", 0.005], ["kd", "Float4", 0.0], ["kp_w", "Float4", 1.0], ["ki_w", "Float4", 0.005], ["kd_w", "Float4", 0.0],
  ["kp1", "Float4", 6.0], ["ki1", "Float4", 0.03], ["kd1", "Float4", 0.0], ["kp1_w", "Float4", 6.0], ["ki1_w", "Float4", 0.03], ["kd1_w", "Float4", 0.0],
  // buttons (the simulator consumes a True and resets it)
  ["pb_start_heat", "Boolean", false], ["pb_stop_heat", "Boolean", false], ["pb_reset_cold", "Boolean", false], ["pb_reset_hot", "Boolean", false], ["pb_recipe", "Boolean", false],
  ["inject_fault", "Boolean", false],
  // the plant (an oven shrunk about 10x in time so a test takes minutes): degrees per % output, time constant, dead time, noise, ambient
  ["plant_k", "Float4", 2.4], ["plant_tau", "Float4", 60.0], ["plant_theta", "Float4", 8.0], ["plant_noise", "Float4", 0.05], ["ambient", "Float4", 70.0],
];
const TENSION_TAGS = [
  ["pv", "Float4", 15.0], ["sp", "Float4", 15.0], ["sp_w", "Float4", 15.0], ["cv", "Float4", 50.0],
  ["active", "Boolean", true], ["line_running", "Boolean", true], ["swm", "Boolean", false],
  ["kp", "Float4", 1.5], ["ki", "Float4", 1.0], ["kd", "Float4", 0.0], ["kp_w", "Float4", 1.5], ["ki_w", "Float4", 1.0], ["kd_w", "Float4", 0.0],
  ["pb_recipe", "Boolean", false],
  ["plant_k", "Float4", 0.5], ["plant_tau", "Float4", 1.0], ["plant_theta", "Float4", 0.2], ["plant_noise", "Float4", 0.04],
];

const gains = (p, a, b) => ({ [`${p}_kp`]: c(`${a}`), [`${p}_ki`]: c(`${a.replace("kp", "ki")}`), [`${p}_kd`]: c(`${a.replace("kp", "kd")}`),
  [`${p}_kp_w`]: c(`${b}`), [`${p}_ki_w`]: c(`${b.replace("kp", "ki")}`), [`${p}_kd_w`]: c(`${b.replace("kp", "kd")}`) });

const simZone = {
  label: "Simulated Oven Zone", units: "F", pv: c("Zone/pv"), sp: c("Zone/sp"), cv: c("Zone/cv"), set1: "Fast PID (heat-up)", set2: "Auto PID (control)",
  gains: { ...gains("pid1", "Zone/kp1", "Zone/kp1_w"), ...gains("pid2", "Zone/kp", "Zone/kp_w") },
  valve_view: "", valve_params: {},
  // timing is scaled to the simulated plant (about 10x faster than a real oven)
  test: { kind: "temperature", modes: ["heatup", "steady"], heat_set: "pid1", pv_min: 0.0, pv_max: 1000.0, cv_min: 0.0, cv_max: 100.0, error_pct: false,
    pv: c("Zone/pv"), sp: c("Zone/sp"), sp_w: c("Zone/sp_w"), cv: c("Zone/cv"), status: c("Zone/status"), status_ok: 10, faults_ok: c("Zone/faults_ok"), auto: c("Zone/auto"),
    hl: c("Zone/hl"), dev: c("Zone/dev"), soak_to_fast: c("Zone/soak_to_fast"),
    sample_s: 1.0, bump_default: 3.0, bump_min: 1.0, bump_max: 8.0, steady_band: 3.0, band_min: 0.4,
    base_min_s: 30.0, base_max_s: 120.0, seg_min_s: 90.0, seg_max_s: 300.0, ret_min_s: 45.0, ret_max_s: 120.0, hold_s: 20.0, sat_abort_s: 30.0, max_total_s: 3600.0,
    cold_margin: 40.0, arm_timeout_s: 300.0, reach_band: 2.0, reach_hold_s: 60.0, max_heat_s: 1800.0 },
  sim: {
    controls: [
      { label: "Start Heat", tag: c("Zone/pb_start_heat"), kind: "pulse" },
      { label: "Stop Heat", tag: c("Zone/pb_stop_heat"), kind: "pulse" },
      { label: "Reset to cold oven", tag: c("Zone/pb_reset_cold"), kind: "pulse" },
      { label: "Reset to steady at SP", tag: c("Zone/pb_reset_hot"), kind: "pulse" },
      { label: "Recipe download (SP +10)", tag: c("Zone/pb_recipe"), kind: "pulse" },
      { label: "Zone fault", tag: c("Zone/inject_fault"), kind: "toggle" },
    ],
    params: [
      { label: "Plant gain (F per % output)", tag: c("Zone/plant_k"), units: "" },
      { label: "Plant time constant", tag: c("Zone/plant_tau"), units: "s" },
      { label: "Plant dead time", tag: c("Zone/plant_theta"), units: "s" },
      { label: "PV noise", tag: c("Zone/plant_noise"), units: "F" },
    ],
  },
};
const simTension = {
  label: "Simulated Tension Loop", units: "LBS", pv: c("Tension/pv"), sp: c("Tension/sp"), cv: c("Tension/cv"), set1: "", set2: "Gains",
  gains: gains("pid2", "Tension/kp", "Tension/kp_w"),
  valve_view: "", valve_params: {},
  test: { kind: "tension", modes: ["steady"], pv_min: 0.0, pv_max: 500.0, cv_min: 0.0, cv_max: 100.0, error_pct: false,
    pv: c("Tension/pv"), sp: c("Tension/sp"), sp_w: c("Tension/sp_w"), cv: c("Tension/cv"), active: c("Tension/active"), line_running: c("Tension/line_running"), swm: c("Tension/swm"),
    sample_s: 0.1, bump_default: 2.0, bump_min: 0.5, bump_max: 5.0, steady_band: 3.0, band_min: 0.4,
    base_min_s: 15.0, base_max_s: 60.0, seg_min_s: 20.0, seg_max_s: 60.0, ret_min_s: 15.0, ret_max_s: 60.0, hold_s: 5.0, sat_abort_s: 5.0, max_total_s: 900.0 },
  sim: {
    controls: [
      { label: "Recipe download (SP +5)", tag: c("Tension/pb_recipe"), kind: "pulse" },
      { label: "Line running", tag: c("Tension/line_running"), kind: "toggle" },
      { label: "Tension loop active", tag: c("Tension/active"), kind: "toggle" },
      { label: "PID in manual", tag: c("Tension/swm"), kind: "toggle" },
    ],
    params: [
      { label: "Plant gain (lb per % output)", tag: c("Tension/plant_k"), units: "" },
      { label: "Plant time constant", tag: c("Tension/plant_tau"), units: "s" },
      { label: "Plant dead time", tag: c("Tension/plant_theta"), units: "s" },
      { label: "PV noise", tag: c("Tension/plant_noise"), units: "lb" },
    ],
  },
};
module.exports = { c, ZONE_TAGS, TENSION_TAGS, SIM_LOOPS: [["sim_zone", simZone], ["sim_tension", simTension]] };
