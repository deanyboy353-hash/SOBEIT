# s0beit sp

A **single-player** trainer for GTA: San Andreas (`gta_sa.exe` v1.0 US), modelled on the look and
controls of m0d_s0beit_sa 0.3: an in-game D3D9 menu, a top status bar, hotkeys and an `.ini` config
with saved teleports.

It is single-player only. It won't load on any exe except v1.0 US. It switches itself off if it finds a
multiplayer client: `samp.dll`, `omp-client.dll`, MTA, SAMPFUNCS, or the `-h <host> -p <port>` launch
arguments that SA-MP uses.

## Features

| Menu | Contents |
|---|---|
| Player | Godmode (all proofs + health lock), Airbreak (fly/noclip, camera-relative), infinite ammo, never wanted / clear wanted, refill health & armour, +$1,000,000 |
| Vehicle | Vehicle godmode, repair, unflip, speed boost and brake settings |
| Teleports | Map-marker teleport, save current position, every entry from the ini (with interiors) |
| World | Weather (all 23 IDs), set hour/minute, freeze time, game speed |
| Visuals | Ped outlines: NPC skeletons drawn through walls, coloured by type (cops blue, Grove green, other gangs orange, dealers/criminals red, civilians white), with optional distance/health labels |
| Settings | Status HUD on/off |

Status bar: FPS, health, armour, position, interior, vehicle health/speed and the active cheats.

## Default keys

| Key | Action |
|---|---|
| Insert | Open / close menu (Up/Down select, Enter/Right use, Left/Backspace back) |
| Right Shift | Airbreak: W/A/S/D move, Space up, Left Ctrl down, Left Shift fast |
| Delete | Player godmode |
| Home | Teleport to map marker |
| End | Repair vehicle |
| Page Down | Unflip vehicle |
| Left Alt (hold) | Vehicle speed boost |
| Backspace (hold) | Vehicle brake |
| F9 | Toggle ped outlines |
| F11 | Toggle status bar |

You can change all of these in `s0beit_sp.ini`.

## Building

You need a **32-bit** build because the game is a 32-bit process.

Visual Studio 2019/2022 (Windows SDK provides `d3d9.h`):

```
cmake -S . -B build -A Win32
cmake --build build --config Release
```

MinGW cross-compile (Linux):

```
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=cmake/mingw-i686.cmake -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

The output is `s0beit_sp.asi` plus `s0beit_sp.ini`.

## Installing

1. Use the `gta_sa.exe` v1.0 US (compact or Hoodlum) exe.
2. Install an ASI loader (e.g. Silent's ASI Loader / Ultimate ASI Loader).
3. Copy `s0beit_sp.asi` and `s0beit_sp.ini` into the game folder (or `scripts\`).

## Layout

```
src/game.h      gta_sa 1.0 US addresses, struct offsets, helpers
src/cheats.*    cheat logic (runs once per frame on the game thread)
src/menu.*      menu tree, navigation and drawing
src/render.*    D3D9 2D renderer: rects + GDI-baked texture font (CD3DFont-style)
src/esp.*       ped outlines (bone skeletons projected to screen)
src/config.*    ini loading, key names, saving teleports
src/main.cpp    DllMain, version/multiplayer guard, Present/Reset vtable hooks, status bar
```

## Notes

- All addresses are for the 1.0 US exe only. To support another version you need to port `src/game.h`.
- "Repair" only restores vehicle health. It doesn't fix visible damage.
- If you leave a vehicle while vehicle godmode is on, that vehicle stays damage-proof.
