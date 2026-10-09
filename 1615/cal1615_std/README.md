# cal1615_std

The cal1615 line HMI (Ignition 8.3 Perspective), built from the cal2016 project as its template. Maintain it in the Designer.

- Gateway project: `cal1615_std`
- URL: http://localhost:7088/data/perspective/client/cal1615_std
- Login: required (cal2016's session permission "Authenticated").

## Project settings

| Setting | Value |
|---|---|
| Default tag provider | `cal1615` (the OPC UA connection `cal1615` to the FactoryTalk Linx Gateway) |
| Identity provider | Gateway default (`default`, internal users). The project's IdP is left empty, as in cal2016. |
| Default database | `myOracle` (Oracle XE 21c, XEPDB1, schema EB, via host.docker.internal:1521). Tag history uses the `myOracle` historian; alarms go to the journal `AlarmJournal` on `myOracle`. |
| Screen size | 1920×1080. Pages are laid out for 1680×1024, the space left beside a pinned 240px menu and below the 56px header. |

## Kept from cal2016

- **Navigation and header:** the header, with the top nav underlining the current section; the sidebar accordion (with a pin button to keep it open). The docks are shared docks. (cal2016's right-side phone menu, `Framework/Dock Main Nav`, is not used: the left menu covers phones too.)
- **Pages:** Alarms / Warnings / History, and AdHocTrends (the Trend page).
- **Other resources:** data-entry popups, style classes, the stylesheet, session props and scripts, and the alarm pipeline.

## 1615 screens

All screens use standard components:

- **Labels:** with a tag binding and a Format or Map transform (status text and colour).
- **Numeric Entry Fields:** for setpoints, with a bidirectional binding. Where the PLC reads the value back from a different tag, a one-way binding plus an `onActionPerformed` script writes the input tag.
- **Buttons:** with `onActionPerformed`, which writes 1 and resets to 0 after 0.5 s. Jog buttons write 1 on mouse down and 0 on mouse up.
- **Embedded views:** used for repeated equipment.

Folders follow cal2016's structure:

| Path | Contents |
|---|---|
| `MainViews/Feature Views/<Section>/<Page> - Main / - Large / - Small` | Pages with a drawing. `- Main` is the breakpoint (1200px); `- Large` is a fixed coordinate container over the drawing (from Image Management, `Custom/cal1615/`); `- Small` is the phone layout. |
| `MainViews/Feature Views/...` (single views) | Card pages that wrap: Oven Control, recipes, Maintenance pages, Oven Trend. (Advanced Cooling uses the `- Main / - Large / - Small` set like Zone, without a drawing.) |
| `Components/<Area>/...` | One view per card. |
| `Components/Oven/Zone/*` | Shared by Zone 1–3 through the `zone` parameter. |
| `Components/Common/Indicator` | Label and lamp template for the drawings. |
| `Components/Drives/VFD Row` | Row template for the VFD page. |
| `Framework/Carousel Arrow` | Previous/next arrows for Oven Zones and Line Drives. |

## Where to fix things

- **Zone tag paths:** in the project script `cal1615.zones`, as `PATHS[zone][field]`. The PLC tag names are not symmetric between zones. Keys ending in `_w` are where setpoints are written.
- **Recipes:** stored in Oracle table `rcp_cal1615` on `myOracle` (DDL in `../cal1615_ignition/sql/rcp_cal1615_oracle.sql`).
  - **Named queries:** in the `cal1615 Recipe/` folder.
  - **Script:** in `cal1615.recipes`.
  - **Download to PLC:** writes every member to `p02_recipe_from_hmi.*`. The PLC copies that into the active recipe each scan.
- **Alarms:** tags `Alarms/<area>/Axx` (priority High, Alarms page) and `Warnings/<area>/Wxx` (priority Low, Warnings page). There is one Boolean tag per PLC alarm bit (`pNN_dint_to_hmi[n].b`, accumulator `Program:P31_WAC.hmi_dint[n].b`), with the PLC comment as the alarm name. The alarm journal `AlarmJournal` writes to `myOracle`. Fault Reset writes `p02_dint_from_hmi.global[6].0`, which the PLC unlatches.
- **Tag history (`myOracle` historian):**
  - Process values and active recipe values (`p01_recipe_active`): sampled every 10 s (periodic, and at least every 10 s even when steady).
  - Other setpoints, PID/zone parameters and status words: stored on change, and at least once a minute.
  - Not logged: raw I/O, the `p02_*` HMI write buffers and single bits.
- **RTO (oxidizer):** shown on the RTO card on the main screen and on the page `Ovens/RTO - Main` (route `/rto`). Status bits come from `p01_int_from_oxidizer[0..1]`; temperatures and mass flow from `p01_real_to_hmi[11..19]`. The mode text is the expression tag `[cal1615]HMI/rto_mode`; it reads "No Comm" when `p01r14_oxidizer_heart_beat_ok` is false.
- **Drawings and theme:** the drawing PNGs have transparent backgrounds, and the style class `cal1615/drawing` is transparent. Every drawing image binds `props.style.filter` to `session.props.theme`, so the dark themes show it inverted.
- **Trend page and templates (`/trend`):** the template bar: **Template** [list] **Load** / **Update** / **Delete**, and [name] **Store New**. Store, Update and Delete need a logged-in user. Trends are stored in the `myOracle` table `AD_HOC_TRENDS_CONFIG`, in Ad Hoc Trends format, and are shared with everyone. The logic is in the project script `cal1615.trends`; the bar is built by `../cal1615_ignition/tools/trend_bar.js`. Ad Hoc Trends’ own Load/Save-to-DB panels are hidden. The 16 built-in templates can be updated but not deleted. To change them, edit `../cal1615_ignition/tools/trend_templates.js`, raise `VERSION`, run it and deploy. That replaces only templates nobody has re-saved.
- **PID tuning (`/pid-tuning`, Maintenance menu):**
  - Covers the four oven loops: Zones 1-3 and Advanced Cooling. Each loop shows a PV/SP and output trend, live PV/SP/error/output, its gain sets and its control-valve card.
  - Gains are written to `p02_real_from_hmi.<section>[44..51]`, which the PLC loads into the PID.
  - The loops are defined in the project script `cal1615.pid`, built by `../cal1615_ignition/tools/pid_tuning.js`.
  - cal2016’s PIDE autotune faceplates are imported as `Components/PID/PID Control` and `PIDE_Tuning`. They are not used: the cal1615 PLC runs classic PID and has no PIDE_AUTOTUNE tags.
- **PID gain units and scaling:** the cal1615 PID loops use the independent-gains equation (control-word bit `PE` = 0): Kp is unitless, **Ki is 1/s, Kd is s**. They work on error in **engineering units** (the PID data shows `ERR = SP - PV`, e.g. -0.2 for PV 195.2 and SP 195.0), so Kp is "% of output per degree (or per lb)". Output limits are 0-100 %; for the tension loops 50 % is the neutral speed trim (the "-50 to +50 = 100 %" range).
- **PID Tuning page (`/pid-tuning`, Maintenance menu).** Loop buttons: Zone 1, 2, 3, Advanced Cooling, Let-Off, TS1, TS2, Winder A, Winder B. Each loop shows a PV/SP and output trend, live values, its editable gains and (zones, cooling) the control-valve card. The loops are defined in one place, `cal1615.pid.LOOPS`, generated by `../cal1615_ignition/tools/pid_tuning.js`. Zones and the tension loops also have a tuning test; Advanced Cooling does not.
- **Tuning test (the column between the trend and the gains).** Two kinds, chosen with the buttons at the top of the column:
  - **Heat-up from cold (zones only, passive).** This is the Siemens-pretuning style. Nothing is ever written to the PLC. Procedure: oven empty and cold, then press **Arm heat-up capture**, then press Start Heat on the zone page as usual. The runner records PV, SP and CV every second from before the burner lights until PV has been at SP for 3 minutes (**Finish now** ends it early). It then fits a process model to the whole climb (the PLC's own PID usually pins the valve at 100 % at first, which is a real step test) and also finds the steepest rise and the apparent dead time (the tangent at the inflection point). The result tunes the **Fast PID** (zone 3 only has the Auto PID, so it tunes that). Why cold: an oven's gain and lag change with temperature, so a model fitted at steady state does not describe the heat-up.
  - **SP bumps at steady state (zones and tension loops, active).** The loop stays in auto control; the test bumps the SP up, back, down and back and restores it. Zones take about 25 minutes at 1 s sampling and tune the **Auto PID**; tension loops take about 2 minutes at 0.1 s and tune the loop's single gain set. The SP is written through the same HMI input a recipe download writes.
  - **Readiness checklist:** the page lists the conditions with green / red / grey lights (grey = the operator confirms, e.g. empty oven). The same checks decide whether Start is refused.
  - **Safety:** an active test stops and restores the SP on Abort, a fault, the loop leaving its normal state (zone not in Control to SP, valve in manual, line stopped, tension loop inactive, PID in manual, winder indexing), a PV runaway, CV stuck at a limit, bad tag quality, or an SP write the PLC does not take. If someone **else** changes the SP while the test runs (for example a recipe download), the test stops and does **not** put the old value back over their change.
  - **Apply suggested / Revert:** Apply writes only Kp and Ki (the suggestion is PI; Kd is left alone) to the HMI inputs the PLC loads the PID from, for the gain set the test measured, and waits for the PLC to report them. It is refused after a poor fit, saturated CV (steady tests), an unstable result, a PID error form that differs from the configured one, a PV tag that updates too slowly, gains changed since the test, or a suggestion more than 5 times away from the current value. Revert puts the previous Kp and Ki back.
  - **Tables in myOracle** (created and extended automatically): `PID_TUNE_RUN` (every test: mode, the captured SP/PV/CV, the analysis, a heartbeat) and `PID_TUNE_APPLY` (every apply and revert: who, which gain set, old and new gains).
  - **Watchdog:** before each SP write the runner stores the value it is about to command, with a heartbeat. The expression tag `[cal1615]HMI/tune_watchdog` (changes once a minute; built by `tools/tune_watchdog.js`) runs a self-contained gateway script that cleans up a test whose heartbeat is older than 60 s: an SP bump is put back unless the SP is no longer the value the test commanded; a heat-up capture is marked lost (nothing had been written). This also covers a gateway restart mid-test with no page open. Opening the page and every test start run the same check.
  - **Engine and tests:** the model fit, heat-up analysis and gain search are `cal1615.tuning` (percent of span and of output, so one engine serves the temperature and tension loops, with a profile for each); the runner is `cal1615.tunerun`. They are tested under Jython against simulated plants: `tools/tuning_test.py` (engine) and `tools/tunerun_test.py` (runner, tension loop, watchdog script; 59 checks) and `tools/sim_test.py` (runner against the live simulator script). The commands are in those files.
- **One-time setup for the tuning tools**
  1. **Re-import `tags/cal1615_tags.json`** (Overwrite). It adds the watchdog tag and, for the tension loops, the PID members (`PV`, `SP`, `OUT`, `ERR`, `SWM`) of the five tension PIDs, the TS2 gain inputs, the loop-active flags, the line-running bit and the winder index bit. Built by `tools/tension_tags.js`.
  2. **Create a tag group `Fast` in the `cal1615` tag provider** (Config > Tags > Tag Groups): mode Direct, rate 100 ms. The tension PID tags above are assigned to it. Until it exists they run on the 1 s Default group, the tension test measures the real PV update interval before it touches the SP, and it refuses to start with a message saying so. Note that a tag that does not change does not get a new timestamp, so a load cell reading that is perfectly constant for several seconds can look slow; load cells are noisy, so this is not expected.
  3. **Heat-up capture needs no setup.** The SP bumps and apply/revert need a logged-in user.
- **Tuning simulator (try the tuner without the oven).** Import `../cal1615_ignition/tags/cal1615_sim_tags.json` into the `cal1615` provider (it creates only the folder `Sim`; it is not part of the plant tag file). `Sim/tick` (an expression tag, `now(100)`) runs `tools/sim_tick.py` ten times a second and advances two simulated plants that answer the PID output: an oven zone (`Sim/Zone/*`, about 10x faster than a real oven: gain 2.4 F per %, time constant 60 s, dead time 8 s, with a Fast PID, an Auto PID, status codes, a 20 s burner delay) and a tension loop (`Sim/Tension/*`, 0..100 % output, 50 % neutral). The page shows them as the loops **Sim Oven** and **Sim Tension**, with a Simulator card: reset to a cold oven, reset to steady at SP, Start/Stop Heat, a recipe download (changes the SP from the HMI side, to test the external-change stop), a zone fault, line running / loop active / PID in manual for the tension loop, and the plant parameters, which can be changed live. Try: Sim Oven, Reset to cold oven, mode Heat-up, Arm, press Start Heat on the card. Set `Sim/enable` to false to stop it. The SIM_5 PLC program has its own process simulator, but its temperatures and tensions only follow the SP and ignore the PID output, so they cannot be tuned. Tests: `tools/sim_test.py` runs the real runner against the real plant script (22 checks; the commands are in that file). Generator: `tools/tuning_sim.js`; definitions: `tools/sim_defs.js`.
- **Limits of the tuning tools:** everything has been run only against simulated plants so far. The PID error form (engineering units) is taken from the PLC data and verified by every steady-state test; a heat-up cannot measure it, so a wrong assumption would show as a suggestion about 10-50 times off, which the 5x guard refuses. The Letoff PID uses a second gain set (`p20_param_high_*`) in one state and the winder uses index gains while indexing; neither is tuned. The Winder A and B PIDs share the HMI gain inputs (`wdr[40..42]`). The winder torque PID and Advanced Cooling are not covered. A neural-net comparison against the model has not been built.
- **Roll logging (Maintenance > Rolls, route `/rolls`).** A gateway tag script, `[cal1615]HMI/roll_tick` (expression `now(500)`, source `../cal1615_ignition/tools/roll_tick.py`, tags added by `roll_logging.js`), cuts the production into rolls and logs every process value per roll into myOracle. The tables (`ROLL`, `ROLL_STAT`, `ROLL_LOG`, `ROLL_EVENT`, `ROLL_STATE`, `ROLL_CFG`, `ROLL_TAGSET`) are created by the script. The real PLC does not count rolls (`P29r02_roll_count` is only used by the SIM_5 simulator), so this is all gateway-side.
  - **Production** starts when the impregnation tank is up (`p23_di_impreg_tank_up`) and the RTO is ready (`p01r13_permissive_oxidizer`) with a winder winding, or with the **Production start** button (the operator override, for example when a coater-closed signal is missing). It ends when the gates have been down for 60 s, or with **Production stop**; a short drop does not end it.
  - **Rolls** are cut from the winder length counters (`p29r13_ai_wa/wb_footage_ft`): a new roll starts when the OTHER winder starts winding after both winders were stopped and its counter reads below 5 ft. The turret index is not a cut. A winder winding with a counter that was not reset is flagged NOCLEAR and not counted. The same winder starting again with a reset counter after at least 100 ft is also a new roll. A winder is winding when its request-run bit is set (speed control `p29r10/r11`, torque control `p29r15/r16`). The first roll of a run is the **leader** (roll 0); good rolls are 1, 2, ... The length of a roll is the highest value its counter reached. Flags: LEADER, SHORT (under 100 ft), PARTIAL (production ended mid-roll), NOCLEAR, GAP (the gateway restarted mid-roll), NOPATH (the fabric path is not set), NOSTATS.
  - **Data per roll.** Every 10 s while producing, one snapshot of all 253 logged analog values goes to `ROLL_LOG`, keyed by where the fabric is: `W` = feet wound since production started, `stored` = path + accumulator capacity x accumulator % (`p00_wac_position_pct`), `G` = W + stored = the winder-footage position of the fabric that is at the coater now. A roll wound over [w_start, w_end] is described by the snapshots with G in that range, because that fabric passed the coater (and the oven) earlier, by `stored` feet. When a roll closes, `ROLL_STAT` gets the average, min, max, standard deviation and sample count per tag. A roll shorter than the stored fabric has few or no snapshots, which is normal for the leader. The snapshot log is kept 90 days; rolls and statistics are kept forever.
  - **Settings** (on the page, table `ROLL_CFG`, read once a minute): fabric path coater to winder, accumulator capacity (the stored fabric when the accumulator is 100 %), counter limit (5 ft), short-roll limit (100 ft), snapshot interval, gate-down delay. **The path and the capacity are not known yet and default to 0**, so until they are entered the statistics are not shifted back to the coater and rolls are flagged NOPATH.
  - **Restart and database outage:** the open roll is saved in `ROLL_STATE` and resumed after a gateway restart (flagged GAP). If Oracle is down the script keeps cutting rolls in memory, queues the closed ones and saves them when the database is back; errors are logged at most once a minute.
  - **Tests:** `tools/roll_test.py` runs the real script against fake tags, a fake clock and a fake Oracle (39 checks: cut rules, the fabric-offset mapping, buttons, restart, outage). The commands are in that file.
- **Drawings (SVG).** The six line drawings (Overview line, Zone, Let-Off / splice press, Accumulator / impregnation, Winder, Emergency Stops strip) are vector images, `cal1615_std_images/cal1615/<name>.svg` plus a `<name>_dark.svg`; each view picks one from the theme (`session.props.theme`), so they stay sharp at any size and no longer use an invert filter. They are generated, not drawn by hand: `../cal1615_ignition/tools/drawings/` (`lib.js` = the machine parts, `overview.js`, `zone.js`, `letoff.js`, `accum.js`, `winder.js`, `estop.js`; `node build.js [name]` writes both themes). Every drawing keeps the pixel size and the machine positions of the PNG it replaced, so the overlay cards still line up. The red status circles in the old Zone picture were static art and are not redrawn; the live lamps are overlays. Logos stay PNG.
- **Overview panels.** *Line State* (top left) is the four-state panel: RUNNING / IDLE / SETUP / DOWN with the time in the state and the share of the last 8 hours. Rules, in order: line running = RUNNING; else a PLC fault (`p01r02_fault_exists`) = DOWN; else a zone heating or cooling (status 3..9, 11, 12) = SETUP; else IDLE. A new state must hold 3 s. It is computed by the gateway tag script `[cal1615]HMI/line_tick` (`tools/line_tick.py`, test `tools/line_state_test.py`, 17 checks), which logs every change in `LINE_STATE_LOG` (myOracle). *Job Panel* (top centre) shows the shop order, recipe, line speed, the current roll (leader or good, winder, feet), rolls and feet done against targets that are typed into the panel (`[cal1615]HMI/Job/target_rolls`, `target_ft`), the job elapsed time and the last three rolls with their flags. The job counters (`rolls_done`, `ft_done`, `session_start`) come from the roll logging. Both are in `tools/overview_panels.js`; tags in `tools/line_state.js`; the text helpers are the script `cal1615.overview`.
- **Checking pages by screenshot.** `tools/check_copy.sh` deploys the project plus a temporary no-login copy `cal1615_std_check` (`--demo` fills not-yet-imported tags with demo values, `--dark` starts in the dark theme), then `node --experimental-websocket tools/shot.js http://localhost:7088/data/perspective/client/cal1615_std_check/overview 1920 1080 out.png 28000`. Delete the copy afterwards: `tools/check_copy.sh --delete`. Pull the gateway project first (see the Designer sync note).
- **PM schedule:** in the script `cal1615.pm`. Tasks are kept in the memory tag `[cal1615]HMI/pm_tasks`.
- **Tags:** import `../cal1615_ignition/tags/cal1615_tags.json` into the `cal1615` provider. It includes the memory tags `HMI/shop_order` and `HMI/pm_tasks`.
- **Row layout inside a card:** title, then a 100px box, then a 34px units column. Status and lamp boxes are the same 100px, so the boxes line up.

## How it was made

`../cal1615_ignition/tools/build_std.js` and `build_std_pages.js` produced this project once from the cal2016 project and the tag maps (`tools/tagmap*.json`). From now on, edit the project in the Designer. Re-running the build would overwrite Designer edits.

## MQTT link to AWS IoT Core

The gateway publishes the process values to AWS IoT Core and listens on the same topic (default `CUST09/LOC00/MACH00`). No Cirrus Link module is used: the
open-source Paho client runs in a gateway tag script.

- **Script:** `tools/mqtt_tick.py` (tag `[cal1615]HMI/mqtt_tick`, every second, generated into the tag file by `node tools/mqtt_logging.js`). One TLS connection with the
  device certificate, reconnect with a growing pause, publish every `publish_s` seconds, subscribe to the topic.
- **Message:** `{"src": client_id, "topic", "ts", "seq", "metrics": [{"name": "p01r12_master_ramped_speed", "value": 21.0}, ...]}`, the same name/value metrics as the
  Raspberry Pi bridge (`ebaars/mqtt-iot-bridge`). Default list: every logged process value plus line state, shop order, recipe, rolls.
- **Incoming:** a message with name/value metrics writes those tags, but only tags listed in the setting `write_tags` (empty = nothing); the rest is counted as refused.
  The gateway's own messages coming back (`src` = client id) are ignored.
- **Page:** Maintenance > MQTT (`/mqtt`): state, counters, last messages, Publish now, settings (stored in Oracle `MQTT_CFG`).
- **Setup:** `tools/mqtt_setup.sh` puts the Paho jar in `data/mqtt/lib` of the gateway container. The certificate files (`certificate.pem.crt`, `private.pem.key`,
  `AmazonRootCA1.pem`) are copied there by hand and never go into git (`.gitignore` blocks `*.key`, `*.pem`, `*.crt`). The AWS IoT policy must allow connect, publish,
  subscribe and receive for the client id and the topic.
- **Test:** `tools/mqtt_test.sh` starts a throw-away Mosquitto with TLS and client certificates and runs `mqtt_test.py` (27 checks: connect with the PKCS#1 key AWS hands out,
  publish, publish now, allowed and refused writes, echo ignored, switch off, unreachable broker, PKCS#8 key).
