# Companion orbs

Each companion is shown as a voice-reactive orb: a pastel pearl sphere of slowly flowing colour, with no face and
no lines. The idea is focus. In a real interview you look at the interviewer, so the session screen gives you one
thing to look at.

## How an orb behaves
- **Silent:** the colour drifts very slowly.
- **Speaking:** the colour flows faster, ripples spread through it, the sphere swells a little and small rounded
  bumps push out of the rim, all following the level of the AI's own audio (never the microphone). When the voice
  pauses, it settles back to a circle.
- **Listening:** even calmer, with a faint ring breathing around it.
- **Thinking:** a faster swirl and one soft bump circling the rim.
- **Mood:** changes the energy and warms or cools the colours slightly.
- **Reduced motion, portraits:** one still frame.

## Files
- `orb/specs.ts`: one entry per companion: five colours, flow speed, ripple size, swirl direction and the
  "harmonics" that shape its rim bumps. `BUMP` turns the bumps up or down for all orbs.
- `orb/renderer.ts`: the shader and the drawing loop. One WebGL2 context is shared by every orb on the page
  (browsers only allow a few), and each orb is a plain canvas the picture is copied into. Orbs off screen are skipped.
- `orb/VoiceOrb.tsx`: the component. It shows a CSS gradient circle until the first frame, and for good where
  WebGL2 is not available.
- `index.tsx`: the registry that maps companion ids to orbs, and `StillOrb` for portraits.

## Changing or adding an orb
Edit or add an entry in `orb/specs.ts`. Preview all orbs at `/design/orbs` while developing.

## Where the voice level comes from
`components/avatar/Rig.tsx` passes each orb a smoothed level (0 to 1) as `mouthOpen`. In a session that level comes
from `lib/voice/tts.ts`: the real audio signal for the natural voice, and an estimate for the browser's built-in
voice, which exposes no audio stream.
