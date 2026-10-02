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
- **PM schedule:** in the script `cal1615.pm`. Tasks are kept in the memory tag `[cal1615]HMI/pm_tasks`.
- **Tags:** import `../cal1615_ignition/tags/cal1615_tags.json` into the `cal1615` provider. It includes the memory tags `HMI/shop_order` and `HMI/pm_tasks`.
- **Row layout inside a card:** title, then a 100px box, then a 34px units column. Status and lamp boxes are the same 100px, so the boxes line up.

## How it was made

`../cal1615_ignition/tools/build_std.js` and `build_std_pages.js` produced this project once from the cal2016 project and the tag maps (`tools/tagmap*.json`). From now on, edit the project in the Designer. Re-running the build would overwrite Designer edits.
