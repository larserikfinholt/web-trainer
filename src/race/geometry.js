//
// Course geometry
//
// A course is defined once as data (see courses.js) and everything else is
// derived from it here: the SVG path used for drawing, the lookup table used
// to place riders on the road, and the elevation profile used both for the
// preview graph and for the grade sent to the trainer. Because all three come
// from the same sampled table they can never disagree with each other.
//

// Catmull-Rom spline through closed control points, sampled at `perSegment`
// points per control-point interval. Returns {x, y} samples (not closed).
function sampleClosedSpline(points, perSegment = 24) {
    const n = points.length;
    const samples = [];

    for(let i = 0; i < n; i++) {
        const p0 = points[(i - 1 + n) % n];
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        const p3 = points[(i + 2) % n];

        for(let j = 0; j < perSegment; j++) {
            samples.push(catmullRom(p0, p1, p2, p3, j / perSegment));
        }
    }

    return samples;
}

function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
        x: 0.5 * ((2 * p1.x) +
                  (-p0.x + p2.x) * t +
                  (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                  (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) +
                  (-p0.y + p2.y) * t +
                  (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                  (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
}

// Closed Catmull-Rom converted to cubic beziers, as an SVG path string.
// This is the exact same curve that sampleClosedSpline() walks.
function closedSplinePath(points, precision = 1) {
    const n = points.length;
    const f = (v) => Number(v.toFixed(precision));
    let d = `M ${f(points[0].x)} ${f(points[0].y)}`;

    for(let i = 0; i < n; i++) {
        const p0 = points[(i - 1 + n) % n];
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        const p3 = points[(i + 2) % n];

        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(p2.x)} ${f(p2.y)}`;
    }

    return d + ' Z';
}

function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function wrap(s, length) {
    const m = s % length;
    return m < 0 ? m + length : m;
}

// Piecewise linear altitude from knots [{at: meters, alt: meters}], sorted by
// `at` with the first knot at 0. The profile wraps: after the last knot the
// altitude runs back to the first knot's altitude at `lengthMeters`.
function altitudeAt(knots, lengthMeters, s) {
    const m = wrap(s, lengthMeters);
    const n = knots.length;

    for(let i = 0; i < n; i++) {
        const a = knots[i];
        const last = (i + 1 === n);
        const bAt = last ? lengthMeters : knots[i + 1].at;
        const bAlt = last ? knots[0].alt : knots[i + 1].alt;

        if(m >= a.at && m < bAt) {
            const span = bAt - a.at;
            if(span <= 0) return a.alt;
            return a.alt + (bAlt - a.alt) * ((m - a.at) / span);
        }
    }
    return knots[0].alt;
}

function normalizeKnots(knots) {
    const sorted = [...knots].sort((a, b) => a.at - b.at);
    if(sorted[0].at !== 0) {
        sorted.unshift({at: 0, alt: sorted[sorted.length - 1].alt});
    }
    return sorted;
}

// def: {id, name, lengthMeters, points: [{x, y}], elevation: [{at, alt}], segments: [{type, start, end, name}]}
function buildCourse(def, options = {}) {
    const perSegment = options.perSegment ?? 24;
    const step = options.stepMeters ?? 5;

    const raw = sampleClosedSpline(def.points, perSegment);

    // cumulative path length in SVG units, closing back to the first sample
    const cum = [0];
    for(let i = 1; i <= raw.length; i++) {
        cum.push(cum[i - 1] + dist(raw[i - 1], raw[i % raw.length]));
    }
    const pathUnits = cum[raw.length];
    const metersPerUnit = def.lengthMeters / pathUnits;

    const knots = normalizeKnots(def.elevation);

    // Resample at a fixed distance step so lookups are O(1).
    const samples = [];
    let seg = 0;
    for(let s = 0; s < def.lengthMeters; s += step) {
        const u = s / metersPerUnit;
        while(seg < raw.length - 1 && cum[seg + 1] < u) seg++;
        const a = raw[seg];
        const b = raw[(seg + 1) % raw.length];
        const span = cum[seg + 1] - cum[seg];
        const t = span > 0 ? (u - cum[seg]) / span : 0;
        samples.push({
            s,
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            heading: Math.atan2(b.y - a.y, b.x - a.x),
            alt: altitudeAt(knots, def.lengthMeters, s),
        });
    }

    // grade in percent from central differences on altitude
    const n = samples.length;
    for(let i = 0; i < n; i++) {
        const prev = samples[(i - 1 + n) % n];
        const next = samples[(i + 1) % n];
        samples[i].grade = 100 * (next.alt - prev.alt) / (2 * step);
    }

    let ascent = 0;
    let descent = 0;
    let maxGrade = 0;
    let minGrade = 0;
    let minAlt = Infinity;
    let maxAlt = -Infinity;
    for(let i = 0; i < n; i++) {
        const d = samples[(i + 1) % n].alt - samples[i].alt;
        if(d > 0) ascent += d; else descent -= d;
        maxGrade = Math.max(maxGrade, samples[i].grade);
        minGrade = Math.min(minGrade, samples[i].grade);
        minAlt = Math.min(minAlt, samples[i].alt);
        maxAlt = Math.max(maxAlt, samples[i].alt);
    }

    const course = {
        id: def.id,
        name: def.name,
        tagline: def.tagline ?? '',
        description: def.description ?? '',
        theme: def.theme ?? {},
        lengthMeters: def.lengthMeters,
        points: def.points,
        path: closedSplinePath(def.points),
        bounds: bounds(raw),
        metersPerUnit,
        step,
        samples,
        ascent: Math.round(ascent),
        descent: Math.round(descent),
        maxGrade: round1(maxGrade),
        minGrade: round1(minGrade),
        minAlt,
        maxAlt,
        segments: [],
        scenery: def.scenery ?? [],
    };

    course.segments = (def.segments ?? []).map((sg, i) => segmentStats(course, sg, i));

    return course;
}

function segmentStats(course, sg, index) {
    const length = sg.end - sg.start;
    const altStart = altitudeAtCourse(course, sg.start);
    const altEnd = altitudeAtCourse(course, sg.end);
    const gain = altEnd - altStart;
    const avgGrade = length > 0 ? 100 * gain / length : 0;

    let maxGrade = -Infinity;
    for(let s = sg.start; s <= sg.end; s += course.step) {
        maxGrade = Math.max(maxGrade, gradeAt(course, s));
    }

    return {
        id: sg.id ?? `${sg.type}-${index}`,
        type: sg.type,
        name: sg.name ?? (sg.type === 'climb' ? 'Bakke' : 'Spurt'),
        start: sg.start,
        end: sg.end,
        length,
        gain: Math.round(gain),
        avgGrade: round1(avgGrade),
        maxGrade: round1(maxGrade),
    };
}

function bounds(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const p of points) {
        if(p.x < minX) minX = p.x;
        if(p.y < minY) minY = p.y;
        if(p.x > maxX) maxX = p.x;
        if(p.y > maxY) maxY = p.y;
    }
    return {minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY};
}

function round1(x) {
    return Math.round(x * 10) / 10;
}

function sampleIndex(course, s) {
    const m = wrap(s, course.lengthMeters);
    return Math.min(course.samples.length - 1, Math.floor(m / course.step));
}

// Interpolated position on the road for a distance along the course.
function positionAt(course, s) {
    const m = wrap(s, course.lengthMeters);
    const i = sampleIndex(course, m);
    const a = course.samples[i];
    const isLast = (i + 1) === course.samples.length;
    const b = isLast ? course.samples[0] : course.samples[i + 1];
    const span = isLast ? course.lengthMeters - a.s : b.s - a.s;
    const t = span > 0 ? (m - a.s) / span : 0;

    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        heading: a.heading,
        alt: a.alt + (b.alt - a.alt) * t,
        grade: a.grade,
    };
}

function gradeAt(course, s) {
    return course.samples[sampleIndex(course, s)].grade;
}

function altitudeAtCourse(course, s) {
    return positionAt(course, s).alt;
}

// [{s, alt, grade}] with `count` + 1 points, for drawing the elevation profile.
function elevationProfile(course, count = 120) {
    const out = [];
    for(let i = 0; i <= count; i++) {
        const s = (i / count) * course.lengthMeters;
        out.push({s, alt: altitudeAtCourse(course, s), grade: gradeAt(course, s)});
    }
    return out;
}

// Segment containing distance s (within one lap), or undefined.
function segmentAt(course, s) {
    const m = wrap(s, course.lengthMeters);
    return course.segments.find(sg => m >= sg.start && m < sg.end);
}

// Next segment start ahead of distance s, wrapping to the next lap.
// Returns {segment, distanceTo} or undefined when the course has no segments.
function nextSegment(course, s) {
    const m = wrap(s, course.lengthMeters);
    let best;
    for(const sg of course.segments) {
        let d = sg.start - m;
        if(d <= 0) d += course.lengthMeters;
        if(!best || d < best.distanceTo) best = {segment: sg, distanceTo: d};
    }
    return best;
}

export {
    buildCourse,
    closedSplinePath,
    positionAt,
    gradeAt,
    altitudeAt,
    altitudeAtCourse,
    elevationProfile,
    segmentAt,
    nextSegment,
    wrap,
};
