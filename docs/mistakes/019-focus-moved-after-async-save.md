# 019 · Moved focus only after a save finished, so typing landed in the wrong box

- **Date:** 2026-11-20
- **Area:** personal / forms

## What happened
The first version of "Add a loss" saved the loss, waited for it to appear, and then moved focus to its lesson box. Typing the lesson right after Enter put the first letters into "Add a loss" (and glued them to the old text, because the box was cleared only after the save) and the rest into the lesson: "Skipped lunchEat before 2pm, even on bus" / "y days". Caught by a browser test before it was committed.

## Why
Focus and clearing waited on an IndexedDB write plus a live-query refresh (tens of milliseconds). Earlier browser tests paused between steps, which hid it.

## Rule
Clear an add box and move focus synchronously, in the key handler, before any `await`; restore the text if the save fails. Test add flows by typing at full speed with no pauses between Enter and the next keys.

## Where
`AddLoss` and `AddDayItem` in `src/views/personal/DayView.tsx`
