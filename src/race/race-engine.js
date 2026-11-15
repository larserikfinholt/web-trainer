//
// Race engine
//
// Pure state machine: feed it elapsed time and total distance, get back the
// race state (lap, active segment, upcoming event, ghost delta) and a list of
// events that happened since the last update. No DOM, no event bus, so it is
// fully unit testable and the UI/controller stays thin.
//

import { segmentAt, nextSegment, wrap, gradeAt, positionAt, } from './geometry.js';
import * as ghost from './ghost.js';

function createRace(args = {}) {
    const course = args.course;
    const laps = Math.max(1, args.laps ?? 1);
    const totalDistance = laps * course.lengthMeters;
    const ghostSamples = args.ghost?.samples ?? null;
    const ghostLapTimes = args.ghost?.lapTimes ?? null;

    const state = {
        courseId: course.id,
        laps,
        lap: 1,
        intensity: args.intensity ?? 100,
        status: 'ready', // ready | running | finished
        elapsed: 0,
        distance: 0,
        totalDistance,
        lapDistance: 0,
        lapStartElapsed: 0,
        lapTimes: [],
        activeSegment: null,
        segmentTimes: [],
        upcoming: null,
        ghostDelta: null,
        ghostDistance: null,
        hasGhost: Boolean(ghostSamples && ghostSamples.length > 1),
        grade: 0,
        altitude: 0,
        position: positionAt(course, 0),
    };

    let lastLapIndex = 0;

    function start() {
        state.status = 'running';
    }

    function update(input = {}) {
        const events = [];
        if(state.status === 'finished') return {state, events};
        if(state.status === 'ready') start();

        const elapsed = input.elapsed ?? state.elapsed;
        let distance = Math.max(state.distance, input.distance ?? state.distance);

        if(distance >= totalDistance) distance = totalDistance;

        state.elapsed = elapsed;
        state.distance = distance;
        state.lapDistance = wrap(distance, course.lengthMeters);

        const finished = distance >= totalDistance;
        const lapIndex = finished ? laps : Math.floor(distance / course.lengthMeters);

        // segments
        const current = finished ? undefined : segmentAt(course, state.lapDistance);
        if(state.activeSegment && (!current || current.id !== state.activeSegment.id)) {
            const done = closeSegment(elapsed);
            events.push({type: 'segment:end', segment: done});
        }
        if(current && !state.activeSegment) {
            state.activeSegment = {
                id: current.id,
                type: current.type,
                name: current.name,
                lap: lapIndex + 1,
                startElapsed: elapsed,
                length: current.length,
                gain: current.gain,
                avgGrade: current.avgGrade,
            };
            events.push({type: 'segment:start', segment: state.activeSegment});
        }

        // laps
        while(lastLapIndex < lapIndex) {
            lastLapIndex += 1;
            const lapTime = elapsed - state.lapStartElapsed;
            state.lapTimes.push(lapTime);
            state.lapStartElapsed = elapsed;
            events.push({
                type: 'lap',
                lap: lastLapIndex,
                time: lapTime,
                ghostTime: ghostLapTimes?.[lastLapIndex - 1] ?? null,
            });
        }
        state.lap = Math.min(laps, lapIndex + 1);

        // ghost
        if(state.hasGhost) {
            state.ghostDelta = ghost.delta(ghostSamples, distance, elapsed);
            state.ghostDistance = ghost.distanceAt(ghostSamples, elapsed);
        }

        // terrain at rider
        state.position = positionAt(course, state.lapDistance);
        state.grade = finished ? 0 : gradeAt(course, state.lapDistance);
        state.altitude = state.position.alt;

        state.upcoming = computeUpcoming(distance);

        if(finished) {
            state.status = 'finished';
            state.lapDistance = course.lengthMeters;
            events.push({
                type: 'finish',
                time: elapsed,
                lapTimes: state.lapTimes.slice(),
                ghostTime: ghostSamples ? ghostSamples[ghostSamples.length - 1].t : null,
            });
        }

        return {state, events};
    }

    function closeSegment(elapsed) {
        const sg = state.activeSegment;
        const done = {
            ...sg,
            time: elapsed - sg.startElapsed,
        };
        state.segmentTimes.push(done);
        state.activeSegment = null;
        return done;
    }

    function computeUpcoming(distance) {
        const toFinish = totalDistance - distance;
        const m = wrap(distance, course.lengthMeters);

        if(state.activeSegment) {
            const sg = course.segments.find(s => s.id === state.activeSegment.id);
            return {
                kind: 'in',
                type: sg.type,
                name: sg.name,
                distanceTo: Math.max(0, sg.end - m),
                avgGrade: sg.avgGrade,
                maxGrade: sg.maxGrade,
                gain: sg.gain,
            };
        }

        const next = nextSegment(course, m);
        if(!next || next.distanceTo >= toFinish) {
            return {kind: 'finish', type: 'finish', name: 'Mål', distanceTo: toFinish};
        }
        return {
            kind: 'ahead',
            type: next.segment.type,
            name: next.segment.name,
            distanceTo: next.distanceTo,
            avgGrade: next.segment.avgGrade,
            maxGrade: next.segment.maxGrade,
            gain: next.segment.gain,
            length: next.segment.length,
        };
    }

    function setIntensity(x) {
        state.intensity = x;
    }

    function getState() {
        return state;
    }

    return Object.freeze({
        course,
        start,
        update,
        setIntensity,
        getState,
    });
}

export { createRace };
