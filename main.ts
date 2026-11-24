// Neon Tides — the hand-in program for make.fun's gta6-01 bounty.
//
// It takes the finished game (game/) and the screenshots (screenshots/)
// sitting next to this file and hands them over: everything is copied into
// the output folder, and a dossier.json is written there from those exact
// files with the vendored make.fun library, so the judge reads the same
// bytes that were graded.
//
// Run it outside the grader like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Inside the grader MAKEFUN_OUTPUT_DIR is unset and /output is used.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const dest = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(dest, { recursive: true });
cpSync(join(repoRoot, 'game'), join(dest, 'game'), { recursive: true });
mkdirSync(join(dest, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(dest, 'screenshots'), { recursive: true });
}

// The scorer's caps, matching the gate: the text budget is the only one
// that shapes bytes; the rest refuse anything the scorer would refuse
// (too many or too heavy screenshots, too many game files, a game path
// that is too long), so a bad bundle fails here instead of at the gate.
writeFileSync(
  join(dest, 'dossier.json'),
  buildDossier(dest, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
