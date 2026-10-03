"""Rebuild the MeteorSmall Iron Man remake timeline inside DaVinci Resolve.

Run from Resolve:  Workspace > Scripts > build_in_resolve   (put this file in
  macOS:   ~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Edit
  Windows: %APPDATA%\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Edit
  Linux:   ~/.local/share/DaVinciResolve/Fusion/Scripts/Edit)
or from a terminal with external scripting enabled (Preferences > General > External scripting using = Local).

Set SOURCE below to the original screen recording (the "Recording_..._120434.mp4" file, i.e. the old edit).
It builds a 1080x1728 / 30 fps timeline with one clip per beat cut from cutlist.json, sets the flips and
framing from the cut list, and drops a marker on every beat of the track (97.98 BPM).

Not covered here (rendered by src/render.py instead): speed ramps / slow-mo, the MeteorSmall overlays and the
flash / whip / glitch / card-flip transitions. They are listed per cut in cutlist.json ("transitions", "note").
This script is untested inside Resolve in the environment it was written in; the calls follow the documented
Resolve scripting API (README.txt shipped with Resolve) - adjust property names if your version differs.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.environ.get("METEOR_SOURCE", "/path/to/Recording_2026-10-06_120434.mp4")
PROJECT = "MeteorSmall_IronMan_Remake"

try:
    import DaVinciResolveScript as dvr  # provided by Resolve
except ImportError:
    sys.exit("DaVinciResolveScript not found - run this from inside Resolve (Workspace > Scripts).")

data = json.load(open(os.path.join(HERE, "cutlist.json")))
FPS = data["fps"]

resolve = dvr.scriptapp("Resolve")
pm = resolve.GetProjectManager()
project = pm.CreateProject(PROJECT) or pm.LoadProject(PROJECT)
project.SetSetting("timelineResolutionWidth", "1080")
project.SetSetting("timelineResolutionHeight", "1728")
project.SetSetting("timelineFrameRate", str(FPS))
project.SetSetting("timelinePlaybackFrameRate", str(FPS))

pool = project.GetMediaPool()
clips = pool.ImportMedia([SOURCE])
if not clips:
    sys.exit(f"Could not import {SOURCE}")
clip = clips[0]
timeline = pool.CreateEmptyTimeline("MeteorSmall remake (beat cuts)")
project.SetCurrentTimeline(timeline)

# 1) lay the cuts on V1 at their beat-aligned record frames
start_tc_frames = timeline.GetStartFrame()
items = []
for c in data["cuts"]:
    info = {
        "mediaPoolItem": clip,
        "startFrame": c["source_in"],
        "endFrame": c["source_out"] - 1,
        "mediaType": 1,
        "trackIndex": 1,
        "recordFrame": start_tc_frames + c["record_in"],
    }
    # un-retimed clips: trim the source so the clip fills its beat exactly
    n_rec = c["record_out"] - c["record_in"]
    if abs(abs(c["speed"]) - 1.0) > 0.03 or c["speed"] < 0:
        mid = (c["source_in"] + c["source_out"]) // 2
        info["startFrame"] = max(0, mid - n_rec // 2)
        info["endFrame"] = info["startFrame"] + n_rec - 1
    placed = pool.AppendToTimeline([info])
    items.append((c, placed[0] if placed else None))

# 2) per-clip flips / framing (zoom < 1.0 means 'less zoomed in' than the recording; Resolve scales to fit width)
for c, item in items:
    if item is None:
        continue
    item.SetProperty("FlipX", "h" in c["flip"])
    item.SetProperty("FlipY", "v" in c["flip"])
    z = (c["zoom"][0] + c["zoom"][1]) / 2
    item.SetProperty("ZoomX", z)
    item.SetProperty("ZoomY", z)
    if c["roll"][0] or c["roll"][1]:
        item.SetProperty("RotationAngle", (c["roll"][0] + c["roll"][1]) / 2)

# 3) beat markers (blue every beat, red on the downbeat of each bar)
for b in range(0, 67):
    frame = start_tc_frames + round((data["first_beat_s"] + data["beat_period_s"] * b) * FPS)
    colour = "Red" if b % 4 == 0 else "Blue"
    timeline.AddMarker(frame, colour, f"beat {b}", "", 1)

print(f"Built {len(items)} clips and 67 beat markers in project {PROJECT}.")
print("Add the original track on A1 (the old edit's audio) and the overlays/transitions listed in cutlist.json.")
