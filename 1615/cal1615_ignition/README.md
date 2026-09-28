# cal1615_ignition

Ignition 8.3 Perspective project for the cal1615 line. The framework comes from `cal2016_perspective_20240522`: header, breakpoint header, left menu dock, and Large/Small breakpoint views. The content comes from the RSView screens in `../SCREEN PRINTS`.

URL on the local gateway: http://localhost:7088/data/perspective/client/cal1615_ignition

## Gateway setup

The views bind to tags in the `cal1615` tag provider. Values show `---` and lamps are magenta until a tag exists and has good quality.

1. **Tag provider:** create a Standard tag provider named `cal1615`.
2. **OPC UA connection:** use the connection named `cal1615` to the FactoryTalk Linx Gateway. This is the same connection the site export `0400 HMI/tags.json` uses.
3. **Import tags:** in the Designer Tag Browser, select provider `cal1615` and import `tags/cal1615_tags.json` at the provider root. Re-import after every regenerate; the file now holds about 1,040 tags. The format matches the site export:
   - **OPC:** server `cal1615`, item path `nsu=FTLGW_Server_Namespace;s=[PLC]<plc tag>`.
   - **Folders mirror the PLC path:**
     - `[n]` → `_n_`
     - DINT bit `.4` → `bit_4`
     - STRING member `x.name` → `x/name/name`
     - program scope → `Program_P31_WAC/...`
     - module I/O `Local:5:I.Data.3` → `Local_5_I/Data/bit_3`
   - **History:** tags used by trends have history enabled on the `mySQL` historian. To use a different historian, change `HISTORY_PROVIDER` in `tools/gen.js`.
   - **Memory tags:**
     - `HMI/shop_order`
     - `HMI/recipes`: the recipe library, as JSON.
     - `HMI/pm_tasks`: the PM schedule, as JSON, seeded with the three tasks from the old screen.

Setpoint entry and command buttons are enabled only for a logged-in user. The rule is `session.custom.canOperate` in session props.

## Screens

Every page from the RSView application is built.

- **Pages with a machine drawing** use a breakpoint at 1200px: a `- Large` percent-mode coordinate container over the drawing, and a `- Small` stack of cards for phones. These are Overview, Emergency Stops, Zone 1–3 and the three Line Drives pages.
- **Card-only pages** wrap from several columns down to one on a phone.

| Section | Pages |
|---|---|
| Main | Overview, Oven Control, Active Recipe, Recipe Editor, Emergency Stops |
| Oven Zones | Zone 1, Zone 2, Zone 3 (the cooling zone, with no burner or LFL), Advanced Cooling |
| Line Drives | Let-Off / Splice, Accumulator / Tension Stand 1, Tension Stand 2 / Poly / Windup |
| Maintenance | I/O (every I/O module, one row per point labelled with the PLC I/O comment), Zone Setup, VFD Drives, Servo Drives (jog buttons are hold-to-run), PM Schedule |
| Trends | Oven Trend (preset pens, tag browser on), Trend (ad hoc) |
| Alarms | Alarms, Warnings, History (these need alarms configured on tags) |

## PLC behaviour the screens rely on

- **Recipes:** P02 R04 copies `p02_recipe_from_hmi` into `p01_recipe_active` every scan, and there is no trigger bit.
  - Entry fields read `p01_recipe_active.*` and write `p02_recipe_from_hmi.*`.
  - "Download to PLC" writes every recipe member to `from_hmi`.
  - The recipe library lives in Ignition (script `cal1615.recipes`), as the old HMI kept its CSV files.
- **Parameters:** PID gains and zone parameters are reloaded from `p02_real_from_hmi.<section>[n]` every scan, so their entry fields write there.
- **Pushbuttons:** these are bits in `p02_dint_from_hmi`. The HMI writes 1 and resets to 0 after 0.5 s. Jog buttons stay at 1 while held.
- **Suspected PLC issues found while mapping:**
  - Oven Stop doesn't stop Zone 3.
  - Zone 2 LFL alarm uses `p12_di_sp00` where Zone 1 uses `sp1`.
  - `p12_di_recirc.ref_from_net` reads the Zone 3 drive's bit.
  - `p28_real_to_hmi[6]` (the old slitter speed) is never written.
  - Several VFD Hz scalings saturate at 60 Hz.

The field-to-tag maps, with evidence notes, are in `tools/tagmap*.json`.

## Reusable pieces

- **`Components/Common/Card`:** a titled panel. Its `rows` param holds a list of rows. Each row has a `kind`:
  - `value`, `entry`, `status`, `text`, `textentry`, `leds`, `buttons`
  - `stacked: true` puts the label above the value.
  - A card drops rows that have no tag.
- **Entry rows:** they read `tag` and write operator edits to `writeTag`.
- **`Components/Common/Command Button`:**
  - Writes `value` to `tag`, then pulses it back to 0.
  - With `hold`, it writes 1 while pressed.
  - With `page`, it navigates instead.
- **`Components/Common/Indicator` and `LED`:** bit lamps with `invert` and colours.
- **`Framework/Header`:** header bar plus section tabs. The page-config dock passes `section`.

## Regenerating

The project files are generated from these files in `tools/`:

- `gen.js`: framework, main screen and tags.
- `pages.js`: the other pages.
- `tagmap*.json`: field → PLC tag maps.
- `img/`: drawings cut from the screen prints.

To regenerate and deploy:

```
tools/deploy.sh "/overview,1920,1080,desk" "/zone-1,400,1600,phone"
```

This does the following:

1. Regenerates the project.
2. Copies `project.json`, the `com.inductiveautomation.perspective` folder and `ignition/` (the script library) into the `ignition8-3` container.
3. Restarts the gateway so it loads the project. This drops open Designer sessions.
4. Saves screenshots to `tools/shots/`.

Edits made in the Designer are overwritten by the next deploy. Once the project is maintained in the Designer, stop using the generator.
