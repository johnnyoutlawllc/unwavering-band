# Google Timeline export format

Source of truth for parsing: Brad Wheeler sample at

`C:\AI Projects\Internal Files\Google Data\Brad Wheeler\location-history.json`

(~1.4 MB, 1104 top-level segments, observed 2026-09-03.)

## Shape

Root is a **JSON array**, not `{ "locations": [...] }` (that is the older
Records.json format). Each element has `startTime` and `endTime` (ISO-8601
with offset or `Z`), plus exactly one of:

| Key | Meaning | Count in sample |
|---|---|---|
| `visit` | Stayed at a place | 367 |
| `activity` | Moved between places | 297 |
| `timelinePath` | Breadcrumb points for a window | 440 |

## Visit

```json
{
  "startTime": "2026-01-28T18:45:02.641-06:00",
  "endTime": "2026-01-28T19:49:35.960-06:00",
  "visit": {
    "hierarchyLevel": "0",
    "probability": "0.835065",
    "topCandidate": {
      "probability": "0.253839",
      "semanticType": "Unknown",
      "placeID": "ChIJm_l4j_3oS4YR0P1_9DpzQMo",
      "placeLocation": "geo:33.153662,-96.118800"
    }
  }
}
```

`placeLocation` is `geo:lat,lng`. Observed `semanticType` values: `Unknown`,
`Home`, `Aliased Location`, `Searched Address`.

## Activity

```json
{
  "startTime": "...",
  "endTime": "...",
  "activity": {
    "probability": "0.981911",
    "start": "geo:33.094883,-96.112828",
    "end": "geo:33.154522,-96.116802",
    "distanceMeters": "11249.888672",
    "topCandidate": {
      "type": "in passenger vehicle",
      "probability": "0.921921"
    }
  }
}
```

Observed `type` values in sample: `in passenger vehicle`, `walking`.

## Timeline path

```json
{
  "startTime": "2026-01-28T00:00:00.000Z",
  "endTime": "2026-01-28T02:00:00.000Z",
  "timelinePath": [
    {
      "point": "geo:32.871677,-96.403821",
      "durationMinutesOffsetFromStartTime": "20"
    }
  ]
}
```

Point time ≈ `startTime + offset minutes`. Sample totals ~9333 points; longest
path in sample had 121 points.

## Parser contract

`src/lib/location-history.ts` must:

1. Accept only a root array
2. Parse `geo:lat,lng` into numbers
3. Ignore unknown segment keys rather than fail the whole file
4. Return counts for the import summary UI
