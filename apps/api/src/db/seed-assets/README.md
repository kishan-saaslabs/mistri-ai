# Seed audio assets

Drop sample recordings in this folder, then run `pnpm db:seed` — each file
listed below gets uploaded to object storage and attached to the matching
demo deal as a sample call. Filenames must match exactly (case-sensitive):

| Filename                                                              | Attached to deal | Label                        |
| ---------------------------------------------------------------------- | ----------------- | ----------------------------- |
| `8x8 Call 1 with AE 24 Feb 2024 Saturday, February 241 30 2 00am 4k [_06n44rT3so].mp3` | Diego Herrera      | 8x8 Call — AE (24 Feb 2024)   |
| `Sample sales call.mp3`                                                 | Acme Corp          | Sample Sales Call             |

Duration is read from the file itself (via `music-metadata`), not hardcoded.

A sample entry can also carry a `transcriptionFile` and `insightsFile` — JSON
files in this folder inserted into the `transcriptions` and `call_insights`
tables once the call exists. See `8x8-call-transcription.json` and
`8x8-call-insights.json` for the shape.

A sample whose file isn't present yet is skipped (with a console message)
rather than failing the whole seed run, so it's safe to add these one at a
time. To add more samples, edit the `sampleCalls` list in `../seed.ts` — the
filename there must match what you drop in this folder exactly.
