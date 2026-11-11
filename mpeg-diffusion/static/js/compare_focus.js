// Default magnifier spot per comparison clip: fx, fy are fractions of the tile, t is the time (s) the video jumps to before playing on.
// A clip with `track` ([t, fx, fy] keyframes) starts at `start` and keeps playing; the magnifier holds each spot and glides between them.
// In Artifacts mode only the part from the start to `end` (default: the clip end) loops.
// Record new ones by opening the page with ?record and clicking a spot on each example.
window.COMPARE_FOCUS = {
  // the wheel on the baseline's robot: pops in half-formed at ~0.5 s and smears at ~1.5 s, then shrinks lower down
  lot_robot: { start: 0.533, end: 3.0, track: [[0, 0.49, 0.15], [2.2, 0.49, 0.15], [2.8, 0.50, 0.27], [5.4, 0.50, 0.27]] },
  // the track in the bottom right glitches
  lot_train: { fx: 0.82, fy: 0.68, t: 3.333 },
  // the old man's head (top left) and the man in black
  lot_raft: { fx: 0.42, fy: 0.30, t: 4.2 },
  // the runner's head, then his body smears as he falls and slides along the ground
  lot_runner: { start: 3.4, track: [[0, 0.50, 0.30], [3.9, 0.50, 0.30], [4.3, 0.56, 0.62], [4.6, 0.58, 0.76], [5.4, 0.65, 0.68]] },
};
