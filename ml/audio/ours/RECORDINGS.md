# Our recordings

Recorded at the DurHack venue on 2026-11-14 with the demo iPhone (Voice Memos, stereo AAC), converted to
16 kHz mono WAV. Every committed clip was scanned with Apple's built-in sound classifier
(`ml/scripts/sound_windows.swift`): windows with speech confidence 0.5 or more were cut, with a 0.25 s margin,
and the output re-scanned (all clips now below 0.5). Background crowd noise remains, at low speech confidence.

| File | Source recording | Kept (s) | Length (s) | Kind | Notes |
|---|---|---|---|---|---|
| `venue_jacket_01.wav` | In coat pockets-. Bedsheet.m4a | 0 to 45.4 | 45.4 | jacket | coat pockets, bedsheet-style shuffling in the coat |
| `venue_pickup_01.wav` | Dropping phone different hardness.m4a | 0 to 8.75 | 8.8 | pickup | dropping and setting the phone down, varied force |
| `venue_pickup_02.wav` | Dropping phone different hardness.m4a | 12.25 to 31.5 | 19.2 | pickup | dropping and setting the phone down, varied force |
| `venue_pickup_03.wav` | Dropping phone 2 nick talking at end.m4a | 0 to 23.75 | 23.8 | pickup | dropping phone, take 2 (talking at the end removed) |
| `venue_pocket_01.wav` | Pocket walking.m4a | 0 to 14.75 | 14.8 | pocket | phone in pocket while walking, rustling |
| `venue_pocket_02.wav` | Pocket walking.m4a | 18.25 to 37.55 | 19.3 | pocket | phone in pocket while walking, rustling |
| `venue_sleeve_01.wav` | Sleeve 1.m4a | 0 to 14.75 | 14.8 | sleeve | coat sleeve brushing over the phone |
| `venue_sleeve_02.wav` | Sleeve 2 with some hand running on the sleeve at ens.m4a | 0 to 13.25 | 13.2 | sleeve | sleeve, hand running over the sleeve at the end |
| `venue_sleeve_03.wav` | Sleeve 2 with some hand running on the sleeve at ens.m4a | 16.75 to 20.91 | 4.2 | sleeve | sleeve, hand running over the sleeve at the end |

Total: 164 s of handling noise.

## Kept private (not committed)

These contain other people's conversations, so they live only in the git-ignored `ml/audio/private/`
on the recording Mac and are copied to the training pod by hand:

- `venue_roomtone_01.wav` (120 s, iPhone (demo phone)): venue room tone, phone untouched (contains crowd conversation)
- `venue_watch_general_01.wav` (423 s, Apple Watch): Apple Watch general audio (mostly conversation; different microphone)
