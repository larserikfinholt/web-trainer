import { courseDefinitions } from '../../src/race/courses.js';
import {
    buildCourse, positionAt, gradeAt, altitudeAt, elevationProfile,
    segmentAt, nextSegment,
} from '../../src/race/geometry.js';

function segmentsIntersect(p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if(Math.abs(d) < 1e-9) return false;
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
}

function selfIntersections(samples) {
    const n = samples.length;
    let hits = 0;
    for(let i = 0; i < n; i++) {
        for(let j = i + 2; j < n; j++) {
            if(i === 0 && j === n - 1) continue;
            if(segmentsIntersect(samples[i], samples[(i + 1) % n], samples[j], samples[(j + 1) % n])) hits++;
        }
    }
    return hits;
}

const square = {
    id: 'sq', name: 'Square', lengthMeters: 1000,
    points: [{x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}, {x: 0, y: 100}],
    elevation: [{at: 0, alt: 10}, {at: 250, alt: 30}, {at: 500, alt: 10}],
    segments: [{type: 'climb', name: 'Up', start: 0, end: 250}, {type: 'sprint', name: 'Go', start: 600, end: 800}],
};

describe('altitudeAt', () => {
    const knots = [{at: 0, alt: 10}, {at: 250, alt: 30}, {at: 500, alt: 10}];
    test('interpolates linearly between knots', () => {
        expect(altitudeAt(knots, 1000, 125)).toBeCloseTo(20);
        expect(altitudeAt(knots, 1000, 375)).toBeCloseTo(20);
    });
    test('is flat after the last knot when it matches the first', () => {
        expect(altitudeAt(knots, 1000, 750)).toBeCloseTo(10);
    });
    test('wraps distance beyond one lap', () => {
        expect(altitudeAt(knots, 1000, 1125)).toBeCloseTo(20);
    });
});

describe('buildCourse', () => {
    const c = buildCourse(square);

    test('samples cover the whole course at a fixed step', () => {
        expect(c.samples.length).toBe(200);
        expect(c.samples[0].s).toBe(0);
        expect(c.samples[199].s).toBe(995);
    });
    test('computes ascent, descent and max grade from the elevation knots', () => {
        expect(c.ascent).toBe(20);
        expect(c.descent).toBe(20);
        expect(c.maxGrade).toBeCloseTo(8, 0);
        expect(c.minGrade).toBeCloseTo(-8, 0);
    });
    test('position at 0 and at a full lap coincide', () => {
        const a = positionAt(c, 0);
        const b = positionAt(c, 1000);
        expect(b.x).toBeCloseTo(a.x, 5);
        expect(b.y).toBeCloseTo(a.y, 5);
    });
    test('positions progress monotonically along the path', () => {
        const a = positionAt(c, 100);
        const b = positionAt(c, 150);
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0);
    });
    test('segment stats are derived from the elevation profile', () => {
        const climb = c.segments[0];
        expect(climb.gain).toBe(20);
        expect(climb.avgGrade).toBeCloseTo(8, 0);
        expect(c.segments[1].gain).toBe(0);
    });
    test('segmentAt and nextSegment wrap around the lap', () => {
        expect(segmentAt(c, 100).name).toBe('Up');
        expect(segmentAt(c, 300)).toBeUndefined();
        expect(nextSegment(c, 300)).toEqual(expect.objectContaining({distanceTo: 300}));
        expect(nextSegment(c, 900).segment.name).toBe('Up');
        expect(nextSegment(c, 900).distanceTo).toBe(100);
    });
    test('elevationProfile matches gradeAt/altitude at sample points', () => {
        const profile = elevationProfile(c, 8);
        expect(profile.length).toBe(9);
        expect(profile[2].alt).toBeCloseTo(30);
        expect(profile[2].s).toBe(250);
    });
    test('svg path is a closed cubic bezier path', () => {
        expect(c.path.startsWith('M 0 0 C')).toBe(true);
        expect(c.path.endsWith('Z')).toBe(true);
    });
});

describe('built-in courses', () => {
    const courses = courseDefinitions.map(d => buildCourse(d));

    test.each(courses.map(c => [c.name, c]))('%s: loop closes on the start altitude', (_, c) => {
        expect(Math.abs(c.ascent - c.descent)).toBeLessThanOrEqual(1);
    });
    test.each(courses.map(c => [c.name, c]))('%s: never steeper than the trainer can simulate at 100 %%', (_, c) => {
        expect(c.maxGrade).toBeLessThanOrEqual(12);
    });
    test.each(courses.map(c => [c.name, c]))('%s: road does not cross itself', (_, c) => {
        expect(selfIntersections(c.samples)).toBe(0);
    });
    test.each(courses.map(c => [c.name, c]))('%s: climbs climb, sprints are flat', (_, c) => {
        for(const sg of c.segments) {
            if(sg.type === 'climb') expect(sg.avgGrade).toBeGreaterThanOrEqual(3);
            if(sg.type === 'sprint') expect(Math.abs(sg.avgGrade)).toBeLessThan(2);
            expect(sg.end).toBeGreaterThan(sg.start);
            expect(sg.end).toBeLessThanOrEqual(c.lengthMeters);
        }
    });
    test.each(courses.map(c => [c.name, c]))('%s: segments do not overlap', (_, c) => {
        const sorted = [...c.segments].sort((a, b) => a.start - b.start);
        for(let i = 1; i < sorted.length; i++) {
            expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
        }
    });

    test('difficulty ordering matches the descriptions', () => {
        const [fjord, skog, fjell] = courses;
        expect(fjord.ascent).toBeLessThan(skog.ascent);
        expect(skog.ascent).toBeLessThan(fjell.ascent);
        expect(fjord.lengthMeters).toBeLessThan(fjell.lengthMeters);
    });
});
