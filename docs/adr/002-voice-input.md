# 002. Voice input: the browser's Web Speech API

Status: Accepted, 2026-10-10

## Context
The user speaks to the companion and the reply should start within about two seconds. Speech recognition has to cost nothing per user and should not need a server of our own.

## Decision
Use the Web Speech API in the browser. Supported browsers are Chrome on desktop and Android. Other browsers get a typing fallback with a banner that explains why. Turn-taking offers three modes: auto-listen (a turn ends after about 1.5 seconds of silence), tap-to-send, and a push-to-talk toggle.

Rejected for the MVP:
- Pipecat and LiveKit: they add a Python server and a hosting cost.
- Whisper speech-to-text: needs a server or a large in-browser model; listed as a non-goal.

## Consequences
- No speech-to-text bill and no audio passing through our server.
- Voice input works only in Chrome. Chrome sends the audio to Google's speech service, which the setup page discloses.
- Transcripts often lack punctuation and contain recognition errors, so the stats code is conservative and the notes prompt tells the model not to criticise spelling or punctuation.
- The session must still work fully by typing, when the browser is unsupported or the microphone is denied.
