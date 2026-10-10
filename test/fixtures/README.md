# Fixtures and their origin

Shared with the Go reference interpreter, `backend/internal/extrecipe` (the extension executor must give the same
results on the same inputs). Copies, refreshed by hand when the backend side changes; `test/drift.test.js` compares
them with the backend checkout when it sits next to this repo and fails on a difference.

| File here | Origin in the backend repo |
|---|---|
| `seeds/x-search.json` | `internal/extrecipe/seeds/x-search.json` (seed recipe, X) |
| `seeds/linkedin-search.json` | `internal/extrecipe/seeds/linkedin-search.json` (seed recipe, LinkedIn) |
| `x-search.recorded.json` | `internal/extrecipe/testdata/x-search.recorded.json` (real SearchTimeline response, recorded) |
| `linkedin-search.synthetic.json` | `internal/extrecipe/testdata/linkedin-search.synthetic.json` (synthetic Voyager sample) |
| `xct-golden.go-output.txt` | printed by the Go `xcli` transaction-id implementation (golden values for `src/xct.js`) |
| `html-sample.html` | extension only: a small page for the `expect: "html"` / CSS selector path |
