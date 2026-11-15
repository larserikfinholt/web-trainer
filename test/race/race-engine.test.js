import { buildCourse } from '../../src/race/geometry.js';
import { createRace } from '../../src/race/race-engine.js';
import { messageFor } from '../../src/race/messages.js';

const square = {
    id: 'sq', name: 'Square', lengthMeters: 1000,
    points: [{x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}, {x: 0, y: 100}],
    elevation: [{at: 0, alt: 10}, {at: 250, alt: 30}, {at: 500, alt: 10}],
    segments: [
        {type: 'climb', name: 'Up', start: 0, end: 250},
        {type: 'sprint', name: 'Go', start: 600, end: 800},
    ],
};
const course = buildCourse(square);

// drive the race at a constant speed, one update per second
function run(race, mps, seconds, from = {elapsed: 0, distance: 0}) {
    const all = [];
    let elapsed = from.elapsed;
    let distance = from.distance;
    for(let i = 0; i < seconds; i++) {
        elapsed += 1;
        distance += mps;
        const { events } = race.update({elapsed, distance});
        all.push(...events);
    }
    return all;
}

describe('race engine', () => {
    test('starts ready, runs on first update', () => {
        const race = createRace({course, laps: 2});
        expect(race.getState().status).toBe('ready');
        race.update({elapsed: 1, distance: 5});
        expect(race.getState().status).toBe('running');
    });

    test('detects segment start and end with timing', () => {
        const race = createRace({course, laps: 1});
        const events = run(race, 10, 30);
        const starts = events.filter(e => e.type === 'segment:start');
        const ends = events.filter(e => e.type === 'segment:end');
        // first update is at d=10, already inside "Up" (0..250)
        expect(starts[0].segment.name).toBe('Up');
        expect(ends[0].segment.name).toBe('Up');
        // entered at t=1, left at t=25 (d=250)
        expect(ends[0].segment.time).toBe(24);
    });

    test('counts laps, records lap times and finishes after the last lap', () => {
        const race = createRace({course, laps: 2});
        const events = run(race, 20, 100);
        const laps = events.filter(e => e.type === 'lap');
        const finish = events.find(e => e.type === 'finish');

        expect(laps.map(l => l.lap)).toEqual([1, 2]);
        expect(laps[0].time).toBe(50);
        expect(laps[1].time).toBe(50);
        expect(finish.time).toBe(100);
        expect(finish.lapTimes).toEqual([50, 50]);
        expect(race.getState().status).toBe('finished');
        expect(race.getState().distance).toBe(2000);
        expect(race.getState().lap).toBe(2);
    });

    test('ignores updates after finish and never moves backwards', () => {
        const race = createRace({course, laps: 1});
        run(race, 100, 10);
        const { events } = race.update({elapsed: 20, distance: 5000});
        expect(events).toEqual([]);
        expect(race.getState().distance).toBe(1000);

        const race2 = createRace({course, laps: 1});
        race2.update({elapsed: 1, distance: 100});
        race2.update({elapsed: 2, distance: 50});
        expect(race2.getState().distance).toBe(100);
    });

    test('upcoming points to the next segment, then to the finish on the last lap', () => {
        const race = createRace({course, laps: 1});
        race.update({elapsed: 1, distance: 300});
        let up = race.getState().upcoming;
        expect(up.kind).toBe('ahead');
        expect(up.name).toBe('Go');
        expect(up.distanceTo).toBe(300);

        race.update({elapsed: 2, distance: 650});
        up = race.getState().upcoming;
        expect(up.kind).toBe('in');
        expect(up.distanceTo).toBe(150);

        race.update({elapsed: 3, distance: 850});
        up = race.getState().upcoming;
        expect(up.kind).toBe('finish');
        expect(up.distanceTo).toBe(150);
    });

    test('upcoming wraps to the next lap when more laps remain', () => {
        const race = createRace({course, laps: 2});
        race.update({elapsed: 1, distance: 850});
        const up = race.getState().upcoming;
        expect(up.kind).toBe('ahead');
        expect(up.name).toBe('Up');
        expect(up.distanceTo).toBe(150);
    });

    test('exposes grade and position at the rider', () => {
        const race = createRace({course, laps: 1});
        race.update({elapsed: 1, distance: 125});
        const s = race.getState();
        expect(s.grade).toBeCloseTo(8, 0);
        expect(s.altitude).toBeCloseTo(20, 0);
        expect(s.position.x).toBeGreaterThan(0);
    });

    test('ghost delta and distance follow the previous ride', () => {
        const ghost = {
            samples: Array.from({length: 101}, (_, t) => ({t, d: t * 10})),
            lapTimes: [100],
        };
        const race = createRace({course, laps: 1, ghost});
        expect(race.getState().hasGhost).toBe(true);

        race.update({elapsed: 10, distance: 150});
        expect(race.getState().ghostDelta).toBe(5);
        expect(race.getState().ghostDistance).toBe(100);

        const events = run(race, 20, 50, {elapsed: 10, distance: 150});
        const lap = events.find(e => e.type === 'lap');
        expect(lap.ghostTime).toBe(100);
    });

    test('no ghost means no delta', () => {
        const race = createRace({course, laps: 1});
        race.update({elapsed: 10, distance: 150});
        expect(race.getState().hasGhost).toBe(false);
        expect(race.getState().ghostDelta).toBeNull();
    });
});

describe('messages', () => {
    test('segment end message includes name and time', () => {
        const m = messageFor({type: 'segment:end', segment: {type: 'climb', name: 'Up', time: 95}}, 0);
        expect(m.tone).toBe('climb');
        expect(m.detail).toBe('Up · 1:35');
    });
    test('lap message compares with ghost when available', () => {
        const m = messageFor({type: 'lap', lap: 2, time: 300, ghostTime: 310}, 1);
        expect(m.title).toContain('2');
        expect(m.detail).toBe('5:00 · +10 s mot forrige');
    });
    test('unknown events give no message', () => {
        expect(messageFor({type: 'segment:start'})).toBeNull();
    });
});
