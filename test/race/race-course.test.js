import { buildCourse } from '../../src/race/geometry.js';
import { fjordrunden } from '../../src/race/courses.js';
import { createRace } from '../../src/race/race-engine.js';

describe('race engine on a real course', () => {
    const course = buildCourse(fjordrunden);

    test('every segment is recorded on every lap at high speed', () => {
        const race = createRace({course, laps: 2});
        let elapsed = 0;
        let distance = 0;
        const ends = [];
        while(race.getState().status !== 'finished' && elapsed < 1000) {
            elapsed += 1;
            distance += 70;
            const { events } = race.update({elapsed, distance});
            ends.push(...events.filter(e => e.type === 'segment:end').map(e => `${e.segment.name}-${e.segment.lap}`));
        }
        expect(ends).toEqual([
            'Neset-1', 'Fjordspurten-1', 'Kaia-1',
            'Neset-2', 'Fjordspurten-2', 'Kaia-2',
        ]);
        expect(race.getState().segmentTimes.length).toBe(6);
    });
});
