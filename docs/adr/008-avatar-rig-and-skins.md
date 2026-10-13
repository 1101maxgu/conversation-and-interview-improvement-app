# 008. Avatar: one animation rig, six swappable character skins

Status: Accepted, 2026-10-10

## Context
Each companion is a cartoon animal (fox, owl, otter, robot, panda, bear) that should look alive while listening, thinking and speaking. The first artwork is a placeholder: the owner plans to replace it with their own drawings.

## Decision
Split animation from artwork. One shared rig holds all the animation logic: breathing, blinking, mouth opening driven by the audio level, poses for each state and mood expressions. Each character is a skin: an SVG component with named anchor points (eyes, mouth, head, body) that implements the skin contract in `lib/types.ts`. The rig animates any skin through those anchors.

A realistic avatar is a non-goal for the MVP; the rig accepts `style="realistic"` as a documented slot but draws the cartoon.

## Consequences
- New art is a drop-in: replace one skin file and the animation keeps working, with no rig changes. `components/characters/README.md` explains how.
- Six characters cost one set of animation code instead of six.
- Skins are limited to what the anchors can express; a character that needs a new kind of motion means extending the contract for all skins.
- Lip-sync is driven by loudness, not by speech sounds, so the mouth movement is approximate.
