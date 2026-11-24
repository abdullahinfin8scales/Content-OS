# 020 · Drag could only reorder tasks that shared a time

- **Date:** 2026-11-24
- **Area:** personal / tasks

## What happened
The user asked for a holder (handle) to put tasks in order, "to bring it up and give it priority first". The first version only let tasks swap places when they had exactly the same time (or no time), and told the user to change a task's time by hand to move it anywhere else. The user pushed back: "why change it manually when we can just drag it … it should automatically adjust the timing."

## Why
Treated "order" as the data field and stopped there, instead of asking what the screen shows: a timeline where a task's place and its time are the same thing. A drag that cannot go where the eye says it can is a half-feature, and sending the user to a form to finish the job defeats the point of dragging.

## Rule
A drag must be a real drag: the task lands exactly where it is dropped, and whatever data that implies (its time, its order) is set for the user, never left for them to edit by hand. Show the result before the drop (the landing line and the time it will get). Drop rules live in one place (`PersonalRepo.placeTask`, `timeForDrop`) and are tested.

## Where
`src/lib/personalRepo.ts` (`placeTask`, `moveTask`, `timeForDrop`), `src/views/personal/taskSort.ts`, `src/views/personal/DayView.tsx`
