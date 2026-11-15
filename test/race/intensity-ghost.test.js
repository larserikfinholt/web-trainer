import { trainerGrade, smoothGrade, clampIntensity, INTENSITY } from '../../src/race/intensity.js';
import { distanceAt, timeAt, delta, pickGhost } from '../../src/race/ghost.js';
import { formatRaceTime, formatDelta, formatDistance, formatGrade } from '../../src/race/format.js';

describe('intensity', () => {
    test('100 % sends the course grade unchanged', () => {
        expect(trainerGrade(6, 100)).toEqual({grade: 6, clipped: false});
    });
    test('scales the grade linearly', () => {
        expect(trainerGrade(6, 50).grade).toBe(3);
        expect(trainerGrade(6, 150).grade).toBe(9);
        expect(trainerGrade(-4, 50).grade).toBe(-2);
    });
    test('clips to what the trainer can simulate and reports it', () => {
        expect(trainerGrade(10, 150)).toEqual({grade: 12, clipped: true});
        expect(trainerGrade(-11, 100)).toEqual({grade: -8, clipped: true});
    });
    test('intensity is clamped and stepped', () => {
        expect(clampIntensity(0)).toBe(INTENSITY.min);
        expect(clampIntensity(999)).toBe(INTENSITY.max);
        expect(clampIntensity(102)).toBe(100);
        expect(clampIntensity(103)).toBe(105);
        expect(clampIntensity(NaN)).toBe(INTENSITY.default);
    });
    test('smoothGrade limits the rate of change', () => {
        expect(smoothGrade(0, 6, 1, 2)).toBe(2);
        expect(smoothGrade(5, 6, 1, 2)).toBe(6);
        expect(smoothGrade(6, 0, 0.5, 2)).toBe(5);
        expect(smoothGrade(undefined, 4, 1)).toBe(4);
    });
});

describe('ghost', () => {
    const samples = [
        {t: 0, d: 0}, {t: 10, d: 100}, {t: 20, d: 200}, {t: 30, d: 200}, {t: 40, d: 300},
    ];

    test('distanceAt interpolates and clamps', () => {
        expect(distanceAt(samples, 5)).toBe(50);
        expect(distanceAt(samples, 25)).toBe(200);
        expect(distanceAt(samples, 99)).toBe(300);
        expect(distanceAt(samples, -1)).toBe(0);
    });
    test('timeAt is the inverse and handles paused stretches', () => {
        expect(timeAt(samples, 50)).toBe(5);
        expect(timeAt(samples, 200)).toBe(20);
        expect(timeAt(samples, 250)).toBe(35);
        expect(timeAt(samples, 999)).toBe(40);
    });
    test('delta is positive when the rider is ahead', () => {
        expect(delta(samples, 100, 8)).toBe(2);
        expect(delta(samples, 100, 12)).toBe(-2);
        expect(delta(samples, 400, 50)).toBe(-10);
        expect(delta(null, 100, 8)).toBeNull();
    });
    test('pickGhost takes the latest completed ride with same course and laps', () => {
        const rides = [
            {id: 'a', courseId: 'x', laps: 2, completed: true, finishedAt: 100, samples},
            {id: 'b', courseId: 'x', laps: 2, completed: true, finishedAt: 300, samples},
            {id: 'c', courseId: 'x', laps: 2, completed: false, finishedAt: 400, samples},
            {id: 'd', courseId: 'x', laps: 3, completed: true, finishedAt: 500, samples},
            {id: 'e', courseId: 'y', laps: 2, completed: true, finishedAt: 600, samples},
        ];
        expect(pickGhost(rides, 'x', 2).id).toBe('b');
        expect(pickGhost(rides, 'x', 4)).toBeUndefined();
        expect(pickGhost([], 'x', 2)).toBeUndefined();
    });
});

describe('format', () => {
    test('race time', () => {
        expect(formatRaceTime(65)).toBe('1:05');
        expect(formatRaceTime(3725)).toBe('1:02:05');
        expect(formatRaceTime(0)).toBe('0:00');
    });
    test('delta', () => {
        expect(formatDelta(8)).toBe('+8 s');
        expect(formatDelta(-12.4)).toBe('−12 s');
        expect(formatDelta(65)).toBe('+1:05');
        expect(formatDelta(null)).toBe('–');
    });
    test('distance and grade', () => {
        expect(formatDistance(4800)).toBe('4,8 km');
        expect(formatDistance(180)).toBe('180 m');
        expect(formatGrade(4.53)).toBe('+4,5 %');
        expect(formatGrade(-3)).toBe('-3,0 %');
    });
});
