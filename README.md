# gta6-entry
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sinker234/gta6-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sinker234/gta6-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Tides is an original top-down 2D open-world crime game set in Port Azure, a pastel-and-neon coastal city of palm trees, beach roads and glowing signs. You play Kai Mercer, a runner newly arrived in town, taking jobs from fixer Mara Voss: fetch a package across the city, work fares in a yellow taxi, lift a marked sports car, smash crates against the clock, and finally outrun a three-star heat wave to the hideout. Between story jobs the city stays alive — traffic follows the road grid in lanes, pedestrians stroll the sidewalks and flee danger, and every crime feeds a heat system that brings police cruisers down on you. Get busted and you wake up fined outside the police station; get wasted and the hospital takes its fee instead.

Everything is simulated in the browser with no assets and no network: the whole city is generated from a seed and pre-rendered to one canvas, cars use arcade physics with handbrake slides and skid marks, and all sound — engine pitch, sirens, gunshots and a soft synthwave pad — is synthesized live with WebAudio. A five-star wanted system, a bust meter, a repaint garage that clears your heat, a minimap with police and objective blips, and a localStorage save round out the package.

Controls: WASD or arrows move, Shift sprints, the mouse aims, click or F punches, Q toggles fists and pistol, E enters or exits the nearest car, Space is the handbrake while driving, Esc or P pauses, and M mutes. On foot, walk into gold markers to advance missions; in a car, drive onto them. The Shine Shop garage clears wanted stars and repairs your ride for $150.

## Run it
```sh
node serve.ts   (then open http://localhost:8080) — and the hand-in: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```
---
<sub>Entered on [make.fun](https://make.fun/?ref=1c94brae&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
