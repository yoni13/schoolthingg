# Neon Shinobi: Night of the Dead — "Rojiura" (back-alley) vertical slice

One small, dense level: a rain-soaked Tokyo back alley at night. Five waves of the dead.

## Run it
The game uses ES modules and loads textures/models, so it has to be served over http (opening index.html from disk will not work):

    cd game
    python3 -m http.server 8000      # or: npx serve
    # then open http://localhost:8000

Chrome / Edge with a dedicated GPU recommended. Esc pauses and opens the graphics settings
(LOW / MEDIUM / HIGH / ULTRA, FPS counter). Resolution scales down automatically if the frame rate drops.

## Controls
WASD move · Mouse look · Shift sprint · Space jump / double jump / wall jump · LMB katana (hold to chain 3 cuts) · Q shadow dash (ends in a cut) · Esc pause

- Wall run: jump beside a wall while moving; run straight into a wall to run up it onto the roofs
- RMB / F shuriken (wave 2) · E Blade Storm (wave 4) · R 1000 Blades, charged by kills (wave 5)
- 1 Lightning · 2 Chrono · 3 Fire Wave: rooftop scrolls under golden beams, from wave 4 (yellow diamonds on the radar)
- From wave 5 buildings collapse; spitters lob acid (a swing, dash or Blade Storm bats it back)
- 9 waves, then reach the car (orange beam) and press G

The map is a city district of about 340 x 360 m (94 blocks) around the original alley. Distant blocks drop their fine detail.

## What is in the renderer
- Photoscanned PBR materials and props (albedo / normal / AO-roughness-metal), HDRI image-based lighting
- Modular facade kit with real window and door geometry, lit interiors behind glass
- Wet asphalt shader: procedural puddles, rain ripples, planar reflections blurred by roughness
- Shadow-mapped moonlight and street lamps, volumetric light cones, neon point lights, lightning
- Light-reactive rain streaks and splashes, steam, sparks, embers
- GTAO ambient occlusion, HDR bloom, ACES tone mapping, MSAA, colour grade, grain, chromatic aberration
- Skinned characters with procedural sword poses, blade trail, cloth scarf, dissolve deaths

## Credits
- Textures, props, facade kit, katana, HDRI: Poly Haven (CC0) — polyhaven.com
- Character rigs/animations: three.js example assets (Mixamo "X Bot" and "Vanguard")
- Engine: three.js r170 (MIT)
