# night

Server side of a night: upload, storage, timeline, labels. See `docs/ARCHITECTURE.md`.

## Import a night from a Health app export

Fallback for when HealthKit access is not ready. Export from the Health app (profile picture,
Export All Health Data), unzip, and point the script at `export.xml`:

```sh
cd apps/server
bun src/features/night/import-health-export.ts ~/export/export.xml \
  --night 2026-11-13 --user <your Kip user UUID> --api http://localhost:3000
```

- `--night` is the evening's London date, so `2026-11-13` is the night into the 14th.
- `--user` is the UUID the app sends as `x-kip-user`. The night appears under that user.
- `--dry-run` parses and prints counts without uploading.
- Reads sleep stages (in bed, awake, core, deep, REM), heart rate, HRV (SDNN) and respiratory
  rate. Readings are trimmed to the span of that night's sleep stages.
- The upload is health only: microphone and location consent are false, so noise is empty.
- The night ID is derived from user and night, so running it twice stores one night.
- The script prints counts only, never health values. Keep `export.xml` out of the repo.
