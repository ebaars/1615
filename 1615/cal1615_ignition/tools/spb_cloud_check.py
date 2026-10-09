"""Decodes the Sparkplug messages the test dumped with the CLOUD's own decoder (machineiq SparkplugIngest/sparkplug_decode.py, protobuf 6.x) and checks them.
Run by mqtt_test.sh in a python container:  python spb_cloud_check.py /dump /ingest"""
import glob, os, sys
dump, ingest = sys.argv[1], sys.argv[2]
sys.path.insert(0, ingest)
import sparkplug_decode as d

bad = 0
def check(name, ok, extra=""):
    global bad
    print("   %s  %s %s" % ("PASS" if ok else "FAIL", name, "" if ok else extra))
    bad += 0 if ok else 1

msgs = []
for f in sorted(glob.glob(os.path.join(dump, "*.bin"))):
    kind = os.path.basename(f).split("_")[1].split(".")[0]
    msgs.append((kind, d.decode_payload(open(f, "rb").read())))
check("cloud decoder reads every message", len(msgs) >= 6, str(len(msgs)))
births = [p for k, p in msgs if k == "DBIRTH"]
check("DBIRTH decodes with its metric names", births and {m["name"] for m in births[0]["metrics"]} >= {"p01r12_master_ramped_speed", "p01_recipe_active_name", "p25_ai_speed"})
m = {x["name"]: x for x in births[0]["metrics"]}
check("float, bool, int, string values as the cloud reads them", m["p01r12_master_ramped_speed"]["value"] == 21.0 and m["p23_di_impreg_tank_up"]["value"] is True
      and m["p01r13_status"]["value"] == 5 and m["p01_recipe_active_name"]["value"] == "KEVLAR_285_PHEN", str(m))
check("datatypes: Float 9, Boolean 11, Int32 3, String 12", [m[n]["datatype"] for n in ("p01r12_master_ramped_speed", "p23_di_impreg_tank_up", "p01r13_status", "p01_recipe_active_name")] == [9, 11, 3, 12])
check("a metric with no good value is null, not missing", m["p25_ai_speed"]["value"] is None)
check("every metric has a timestamp", all(x["timestamp"] > 0 for x in births[0]["metrics"]))
seqs = [p["seq"] for k, p in msgs]
check("seq 0, 1, 2, ... from the first NBIRTH", seqs[:5] == [0, 1, 2, 3, 4], str(seqs[:6]))
nb = [p for k, p in msgs if k == "NBIRTH"][0]
check("NBIRTH metric bdSeq is a number", {x["name"]: x["value"] for x in nb["metrics"]}["bdSeq"] in range(256))
sys.exit(1 if bad else 0)
