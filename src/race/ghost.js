//
// Ghost: replay of a previous ride on the same course.
//
// A ride stores samples [{t: seconds, d: meters}] once per second. The ghost
// needs two lookups: where was it at time t, and when did it pass distance d.
//

function distanceAt(samples, t) {
    if(!samples || samples.length === 0) return 0;
    if(t <= samples[0].t) return samples[0].d;
    const last = samples[samples.length - 1];
    if(t >= last.t) return last.d;

    let lo = 0;
    let hi = samples.length - 1;
    while(hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if(samples[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const span = b.t - a.t;
    if(span <= 0) return a.d;
    return a.d + (b.d - a.d) * ((t - a.t) / span);
}

// Inverse lookup. Distances are non-decreasing; for flat stretches (paused)
// the earliest time is returned.
function timeAt(samples, d) {
    if(!samples || samples.length === 0) return 0;
    if(d <= samples[0].d) return samples[0].t;
    const last = samples[samples.length - 1];
    if(d >= last.d) return last.t;

    // hi = first sample at or beyond d, so a paused stretch resolves to the
    // moment the ghost first reached d
    let lo = 0;
    let hi = samples.length - 1;
    while(hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if(samples[mid].d < d) lo = mid; else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const span = b.d - a.d;
    if(span <= 0) return b.t;
    return a.t + (b.t - a.t) * ((d - a.d) / span);
}

// Seconds the rider is ahead (+) or behind (-) the ghost at the rider's
// current distance.
function delta(samples, riderDistance, riderElapsed) {
    if(!samples || samples.length < 2) return null;
    const last = samples[samples.length - 1];
    if(riderDistance > last.d) {
        // rider has gone further than the ghost ever did
        return last.t - riderElapsed;
    }
    return timeAt(samples, riderDistance) - riderElapsed;
}

// Pick the ghost for a given setup: the most recent completed ride on the
// same course with the same number of laps.
function pickGhost(rides, courseId, laps) {
    const candidates = (rides ?? []).filter(r =>
        r.courseId === courseId &&
        r.laps === laps &&
        r.completed === true &&
        ((Array.isArray(r.samples) && r.samples.length > 1) || (r.sampleCount ?? 0) > 1)
    );
    candidates.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    return candidates[0];
}

export {
    distanceAt,
    timeAt,
    delta,
    pickGhost,
};
