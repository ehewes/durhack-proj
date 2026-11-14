# Integrations

One client per external API, used by feature services: `gemini.ts`, `elevenlabs.ts`, `solana.ts`,
`observatory.ts`, `overpass.ts`, `street-manager.ts`. Only the API process calls Gemini,
ElevenLabs and Solana. Adding a new file here is fine in a feature issue; changing an existing one
needs a `platform` issue.
