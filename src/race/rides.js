//
// Ride history (IndexedDB store 'rides').
//
// One record per race, with per-second samples so a later ride can replay it
// as a ghost. Unlike Auuki's activity list there is no cap on the number of
// rides kept. Summaries (without samples) are kept in memory for lists;
// samples are loaded on demand.
//

import { idb } from '../storage/idb.js';
import { uuid } from '../storage/uuid.js';

const STORE = 'rides';

function toSummary(ride) {
    const { samples, ...summary } = ride;
    summary.sampleCount = samples?.length ?? 0;
    return summary;
}

async function restore() {
    const all = (await idb.getAll(STORE)) ?? [];
    return all.map(toSummary).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
}

async function save(ride) {
    if(!ride.id) ride.id = uuid();
    await idb.put(STORE, ride);
    return toSummary(ride);
}

async function get(id) {
    return idb.get(STORE, id);
}

async function remove(id) {
    return idb.remove(STORE, id);
}

function newRide(args = {}) {
    return {
        id: uuid(),
        courseId: args.courseId,
        courseName: args.courseName,
        laps: args.laps,
        intensity: args.intensity,
        startedAt: Date.now(),
        finishedAt: null,
        completed: false,
        totalTime: 0,
        distance: 0,
        ascent: 0,
        lapTimes: [],
        segmentTimes: [],
        ghostRideId: args.ghostRideId ?? null,
        activityId: null,
        avgPower: 0,
        avgHeartRate: 0,
        avgCadence: 0,
        maxPower: 0,
        samples: [],
    };
}

// Averages are computed over samples while riding (speed > 0 or power > 0).
function summarize(ride) {
    const s = ride.samples;
    let n = 0, p = 0, h = 0, hn = 0, c = 0, cn = 0, maxP = 0;
    for(const x of s) {
        n++;
        p += x.p ?? 0;
        if(x.p > maxP) maxP = x.p;
        if(x.h > 0) { h += x.h; hn++; }
        if(x.c > 0) { c += x.c; cn++; }
    }
    ride.avgPower = n ? Math.round(p / n) : 0;
    ride.maxPower = maxP;
    ride.avgHeartRate = hn ? Math.round(h / hn) : 0;
    ride.avgCadence = cn ? Math.round(c / cn) : 0;
    const last = s[s.length - 1];
    ride.totalTime = last?.t ?? 0;
    ride.distance = last?.d ?? 0;
    return ride;
}

const rides = {
    restore,
    save,
    get,
    remove,
    newRide,
    summarize,
    toSummary,
};

export { rides };
