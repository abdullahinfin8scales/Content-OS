# 018 · Used the browser's native time input

- **Date:** 2026-11-20
- **Area:** personal / design

## What happened
Times for tasks and non-negotiables were set with `<input type="time">` ("--:-- --"). Typing into its separate hour/minute/AM-PM segments is fiddly: the user's gym slot was saved as 12:02 AM, and they asked for something "simpler, like Google Calendar". In the same release, the hover "+ Add at…" button on a busy hour sat on top of the task's options button.

## Why
Picked the built-in control without trying it the way a person types. Placed an absolutely-positioned hover button without checking what it covers.

## Rule
Times are chosen with `TimePicker` (`src/components/ui/TimePicker.tsx`): a 15-minute list centred on the current or suggested time, plus type-to-jump. Don't use `<input type="time">` for user-facing times. Before adding a hover button, check it doesn't cover another control in the same row.

## Where
`src/components/ui/TimePicker.tsx`, `src/views/personal/DayView.tsx`, `src/views/personal/NonNegotiablesView.tsx`
