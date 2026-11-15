//
// Course rendering (SVG)
//
// Light 2.5D: the top-down course is squashed vertically (isometric-ish) and
// the road is lifted by altitude, so climbs visibly rise out of the terrain.
// Every element - road, segment overlays, signs, start line, riders - is
// placed with project(), which reads the same sample table the race engine
// uses for position and grade. That is what keeps markers on the road.
//

import { positionAt, elevationProfile, closedSplinePath, } from '../geometry.js';

const SQUASH = 0.74;          // vertical squash for the isometric look
const LIFT_MAX = 46;          // px the highest point of a course is lifted
const PAD = 75;

const COLORS = {
    lime: '#C6FF3D',
    limeDark: '#7fb81c',
    orange: '#FF9F3A',
    orangeDark: '#d97a12',
    road: '#3b3f47',
    roadEdge: '#b9bec8',
    roadLine: '#e8e8e8',
    ghost: '#9fd8ff',
    white: '#ffffff',
};

function liftScale(course) {
    const range = Math.max(1, course.maxAlt - course.minAlt);
    return LIFT_MAX / range;
}

// {x, y, alt} -> {x, y} in projected drawing space
function project(course, p) {
    return {
        x: p.x,
        y: p.y * SQUASH - (p.alt - course.minAlt) * liftScale(course),
    };
}

function projectBase(p) {
    return {x: p.x, y: p.y * SQUASH};
}

function viewBox(course) {
    const b = course.bounds;
    const minY = b.minY * SQUASH - LIFT_MAX;
    const maxY = b.maxY * SQUASH;
    return {
        x: b.minX - PAD,
        y: minY - PAD,
        w: b.width + 2 * PAD,
        h: maxY - minY + 2 * PAD,
    };
}

function f(n) {
    return Number(n.toFixed(1));
}

function polyline(points, close = true) {
    let d = `M ${f(points[0].x)} ${f(points[0].y)}`;
    for(let i = 1; i < points.length; i++) {
        d += ` L ${f(points[i].x)} ${f(points[i].y)}`;
    }
    return close ? d + ' Z' : d;
}

function roadPath(course) {
    return polyline(course.samples.map(s => project(course, s)));
}

function basePath(course) {
    return polyline(course.samples.map(s => projectBase(s)));
}

// A filled band between the lifted road and its ground shadow, so climbs
// read as embankments.
function embankmentPath(course) {
    const top = course.samples.map(s => project(course, s));
    const bottom = course.samples.map(s => projectBase(s)).reverse();
    return polyline(top, false) + ' ' + polyline(bottom, false).replace('M', 'L') + ' Z';
}

function sceneryMarkup(course) {
    const theme = course.theme ?? {};
    let out = '';

    for(const item of course.scenery ?? []) {
        if(item.type === 'water') {
            const pts = item.points.map(projectBase);
            out += `<path class="scenery-water" d="${closedSplinePath(pts)}" fill="${theme.water ?? '#2b5f7a'}"/>`;
            out += `<path class="scenery-water-glint" d="${closedSplinePath(pts)}" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2"/>`;
        }
        if(item.type === 'forest') {
            out += forestMarkup(projectBase(item), item.r, theme);
        }
        if(item.type === 'peak') {
            out += peakMarkup(projectBase(item), item.size, theme);
        }
    }
    return out;
}

// cluster of stylised spruces, deterministic per cluster position
function forestMarkup(c, r, theme) {
    let out = `<g class="scenery-forest">`;
    const count = Math.max(6, Math.round(r / 5));
    let seed = Math.round(c.x * 7 + c.y * 13);
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const trees = [];
    for(let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * r;
        trees.push({x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d * SQUASH, h: 14 + rnd() * 14});
    }
    trees.sort((a, b) => a.y - b.y);
    for(const t of trees) {
        const w = t.h * 0.55;
        out += `<path d="M ${f(t.x)} ${f(t.y - t.h)} L ${f(t.x + w)} ${f(t.y)} L ${f(t.x - w)} ${f(t.y)} Z" fill="${theme.groundDark ?? '#1d3323'}"/>`;
        out += `<path d="M ${f(t.x)} ${f(t.y - t.h)} L ${f(t.x + w * 0.45)} ${f(t.y - t.h * 0.45)} L ${f(t.x - w * 0.45)} ${f(t.y - t.h * 0.45)} Z" fill="#3f6b45"/>`;
    }
    return out + `</g>`;
}

function peakMarkup(c, size, theme) {
    const h = size;
    const w = size * 0.9;
    const rock = theme.rock ?? '#6b7280';
    return `<g class="scenery-peak">
        <path d="M ${f(c.x)} ${f(c.y - h)} L ${f(c.x + w)} ${f(c.y)} L ${f(c.x - w)} ${f(c.y)} Z" fill="${rock}"/>
        <path d="M ${f(c.x)} ${f(c.y - h)} L ${f(c.x + w)} ${f(c.y)} L ${f(c.x + w * 0.2)} ${f(c.y)} Z" fill="#000" fill-opacity="0.18"/>
        <path d="M ${f(c.x)} ${f(c.y - h)} L ${f(c.x + w * 0.3)} ${f(c.y - h * 0.62)} L ${f(c.x + w * 0.12)} ${f(c.y - h * 0.7)} L ${f(c.x)} ${f(c.y - h * 0.58)} L ${f(c.x - w * 0.14)} ${f(c.y - h * 0.68)} L ${f(c.x - w * 0.3)} ${f(c.y - h * 0.62)} Z" fill="#eef2f7"/>
    </g>`;
}

// Segment overlays use pathLength so dash offsets are in course meters.
function segmentOverlayMarkup(course) {
    const L = course.lengthMeters;
    const d = roadPath(course);
    let out = '';
    for(const sg of course.segments) {
        const color = sg.type === 'climb' ? COLORS.orange : COLORS.lime;
        out += `<path class="segment-overlay segment-${sg.type}" d="${d}" pathLength="${L}"
            fill="none" stroke="${color}" stroke-opacity="0.75" stroke-width="5" stroke-linecap="butt"
            stroke-dasharray="${sg.length} ${L - sg.length}" stroke-dashoffset="${-sg.start}"/>`;
    }
    return out;
}

function chevronsMarkup(course, spacing = 220) {
    let out = `<g class="road-chevrons" fill="none" stroke="${COLORS.roadLine}" stroke-opacity="0.85" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">`;
    for(let s = spacing / 2; s < course.lengthMeters; s += spacing) {
        const q = project(course, positionAt(course, s));
        const deg = headingProjected(course, s) * 180 / Math.PI;
        out += `<path transform="translate(${f(q.x)} ${f(q.y)}) rotate(${f(deg)})" d="M -3 -3 L 1 0 L -3 3"/>`;
    }
    return out + `</g>`;
}

// heading in projected space, from two nearby samples
function headingProjected(course, s) {
    const a = project(course, positionAt(course, s - 4));
    const b = project(course, positionAt(course, s + 4));
    return Math.atan2(b.y - a.y, b.x - a.x);
}

function startLineMarkup(course) {
    const q = project(course, positionAt(course, 0));
    const dir = headingProjected(course, 0) + Math.PI / 2;
    const half = 9;
    const n = 6;
    let out = `<g class="start-line">`;
    for(let i = 0; i < n; i++) {
        const t0 = -half + (2 * half) * i / n;
        const t1 = -half + (2 * half) * (i + 1) / n;
        const x0 = q.x + Math.cos(dir) * t0, y0 = q.y + Math.sin(dir) * t0;
        const x1 = q.x + Math.cos(dir) * t1, y1 = q.y + Math.sin(dir) * t1;
        out += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${i % 2 ? '#111' : '#fff'}" stroke-width="3"/>`;
    }
    const px = q.x + Math.cos(dir) * half;
    const py = q.y + Math.sin(dir) * half;
    out += `<line x1="${f(px)}" y1="${f(py)}" x2="${f(px)}" y2="${f(py - 22)}" stroke="#fff" stroke-width="1.5"/>`;
    out += checkerFlag(px, py - 22);
    return out + `</g>`;
}

function checkerFlag(x, y) {
    let out = `<g transform="translate(${f(x)} ${f(y)})">`;
    const c = 3.5;
    for(let r = 0; r < 3; r++) for(let k = 0; k < 4; k++) {
        out += `<rect x="${f(k * c)}" y="${f(r * c)}" width="${c}" height="${c}" fill="${(r + k) % 2 ? '#111' : '#fff'}"/>`;
    }
    return out + `</g>`;
}

function signMarkup(course, sg) {
    const q = project(course, positionAt(course, sg.start));
    const isClimb = sg.type === 'climb';
    const color = isClimb ? COLORS.orange : COLORS.lime;
    const label = isClimb ? 'BAKKE' : 'SPURT';
    const lift = isClimb ? 46 : 40;
    const w = 64;
    const h = 19;

    const icon = isClimb
          ? `<path d="M 0 8 L 4 2 L 6.5 5 L 9 0 L 14 8 Z" fill="#1b1b1b"/>`
          : `<path d="M 6 0 L 1 8 L 5 8 L 3 14 L 10 5 L 6 5 Z" fill="#1b1b1b"/>`;

    return `<g class="segment-sign segment-sign-${sg.type}" data-segment="${sg.id}">
        <line x1="${f(q.x)}" y1="${f(q.y)}" x2="${f(q.x)}" y2="${f(q.y - lift + h / 2)}" stroke="${color}" stroke-width="1.5"/>
        <circle cx="${f(q.x)}" cy="${f(q.y)}" r="2.6" fill="${color}" stroke="#111" stroke-width="0.8"/>
        <g transform="translate(${f(q.x - w / 2)} ${f(q.y - lift - h / 2)})">
            <rect width="${w}" height="${h}" rx="4" fill="${color}" stroke="#141414" stroke-width="1"/>
            <g transform="translate(6 ${isClimb ? 5 : 2})">${icon}</g>
            <text x="${isClimb ? 25 : 23}" y="13" font-size="9.5" font-weight="700" fill="#1b1b1b" letter-spacing="0.4" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">${label}</text>
        </g>
    </g>`;
}

function sprintGateMarkup(course, sg) {
    const q = project(course, positionAt(course, sg.start));
    const dir = headingProjected(course, sg.start) + Math.PI / 2;
    const half = 8;
    let out = `<g class="sprint-gate">`;
    for(const side of [-1, 1]) {
        const x = q.x + Math.cos(dir) * half * side;
        const y = q.y + Math.sin(dir) * half * side;
        out += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x)}" y2="${f(y - 16)}" stroke="${COLORS.lime}" stroke-width="2.2"/>`;
        out += `<circle cx="${f(x)}" cy="${f(y - 16)}" r="1.8" fill="${COLORS.lime}"/>`;
    }
    return out + `</g>`;
}

// Side-view cyclist glyph, ground line at y=0, facing +x.
function riderGlyph(color, opacity = 1, scale = 1) {
    return `<g transform="scale(${scale})" opacity="${opacity}" stroke="${color}" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="-9" cy="0" r="6"/>
        <circle cx="10" cy="0" r="6"/>
        <path d="M -9 0 L -1 -9 L 10 0 M -1 -9 L 7 -9 M -1 -9 L 3 -1"/>
        <path d="M 1 -8 L -2 -16 L 6 -19 L 9 -13"/>
        <circle cx="10" cy="-22" r="3.3" fill="${color}" stroke="none"/>
    </g>`;
}

function ridersMarkup() {
    return `
        <g class="ghost-trail"><path class="ghost-trail-path" fill="none" stroke="${COLORS.ghost}" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/></g>
        <g class="rider ghost-rider" style="display:none">
            <ellipse class="rider-shadow" cx="0" cy="2" rx="14" ry="3.5" fill="#000" fill-opacity="0.25"/>
            <g class="rider-flip">${riderGlyph(COLORS.ghost, 0.6, 0.95)}</g>
            <g class="rider-label" transform="translate(0 -40)">
                <rect x="-30" y="-9" width="60" height="16" rx="5" fill="#0d141c" fill-opacity="0.78" stroke="${COLORS.ghost}" stroke-opacity="0.6" stroke-width="0.8"/>
                <text text-anchor="middle" y="3" font-size="9" font-weight="700" fill="${COLORS.ghost}">FORRIGE TUR</text>
            </g>
        </g>
        <g class="rider main-rider">
            <ellipse class="rider-shadow" cx="0" cy="2" rx="15" ry="4" fill="#000" fill-opacity="0.35"/>
            <g class="rider-flip">${riderGlyph(COLORS.lime, 1, 1.05)}</g>
            <g class="rider-label" transform="translate(0 -42)">
                <path d="M -14 -9 h 28 a 5 5 0 0 1 5 5 v 7 a 5 5 0 0 1 -5 5 h -9 l -5 5 l -5 -5 h -9 a 5 5 0 0 1 -5 -5 v -7 a 5 5 0 0 1 5 -5 z" fill="${COLORS.lime}"/>
                <text text-anchor="middle" y="4" font-size="10" font-weight="800" fill="#152000">DU</text>
            </g>
        </g>`;
}

// Full map. `mode` is 'preview' (no riders, lighter decoration) or 'ride'.
function courseSvg(course, mode = 'ride') {
    const vb = viewBox(course);
    const theme = course.theme ?? {};
    const isRide = mode === 'ride';
    const id = `grad-${course.id}-${mode}`;
    const road = roadPath(course);

    return `<svg class="course-svg course-svg-${mode}" xmlns="http://www.w3.org/2000/svg"
            viewBox="${f(vb.x)} ${f(vb.y)} ${f(vb.w)} ${f(vb.h)}" preserveAspectRatio="xMidYMid meet">
        <defs>
            <radialGradient id="${id}-ground" cx="50%" cy="45%" r="70%">
                <stop offset="0%" stop-color="${theme.ground ?? '#2f4a3a'}"/>
                <stop offset="100%" stop-color="${theme.groundDark ?? '#223829'}"/>
            </radialGradient>
            <filter id="${id}-blur" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3"/>
            </filter>
        </defs>
        <ellipse class="ground" cx="${f(vb.x + vb.w / 2)}" cy="${f(vb.y + vb.h / 2 + PAD * 0.3)}" rx="${f(vb.w / 2 + PAD * 0.4)}" ry="${f(vb.h / 2 + PAD * 0.2)}" fill="url(#${id}-ground)"/>
        <g class="scenery">${sceneryMarkup(course)}</g>
        <path class="road-shadow" d="${basePath(course)}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="16" filter="url(#${id}-blur)"/>
        <path class="embankment" d="${embankmentPath(course)}" fill="${theme.rock ?? '#6b7280'}" fill-opacity="0.32" fill-rule="evenodd"/>
        <path class="road-edge" d="${road}" fill="none" stroke="${COLORS.roadEdge}" stroke-width="15" stroke-linejoin="round"/>
        <path class="road" d="${road}" fill="none" stroke="${COLORS.road}" stroke-width="12.5" stroke-linejoin="round"/>
        ${segmentOverlayMarkup(course)}
        <path class="road-center" d="${road}" fill="none" stroke="${COLORS.roadLine}" stroke-opacity="0.5" stroke-width="0.9" stroke-dasharray="6 7" stroke-linejoin="round"/>
        ${isRide ? chevronsMarkup(course) : ''}
        ${startLineMarkup(course)}
        ${course.segments.filter(s => s.type === 'sprint').map(s => sprintGateMarkup(course, s)).join('')}
        ${isRide ? ridersMarkup() : ''}
        <g class="signs">${course.segments.map(s => signMarkup(course, s)).join('')}</g>
    </svg>`;
}

const PROFILE_W = 300;
const PROFILE_H = 60;

function profileY(course, alt, h = PROFILE_H) {
    const range = Math.max(8, course.maxAlt - course.minAlt);
    return h - 2 - ((alt - course.minAlt) / range) * (h - 2 - 6);
}

// Elevation profile as a small standalone SVG. Segments are tinted.
function profileSvg(course, options = {}) {
    const w = PROFILE_W;
    const h = PROFILE_H;
    const points = elevationProfile(course, options.count ?? 160);
    const toX = (s) => (s / course.lengthMeters) * w;

    let line = `M ${f(toX(points[0].s))} ${f(profileY(course, points[0].alt))}`;
    for(let i = 1; i < points.length; i++) {
        line += ` L ${f(toX(points[i].s))} ${f(profileY(course, points[i].alt))}`;
    }
    const area = `${line} L ${w} ${h} L 0 ${h} Z`;

    let segs = '';
    for(const sg of course.segments) {
        const color = sg.type === 'climb' ? COLORS.orange : COLORS.lime;
        const x0 = toX(sg.start), x1 = toX(sg.end);
        const clipId = `clip-${course.id}-${sg.id}-${options.key ?? 'p'}`;
        segs += `<clipPath id="${clipId}"><rect x="${f(x0)}" y="0" width="${f(x1 - x0)}" height="${h}"/></clipPath>`;
        segs += `<path d="${area}" fill="${color}" fill-opacity="0.5" clip-path="url(#${clipId})"/>`;
    }

    return `<svg class="profile-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <path d="${area}" fill="#ffffff" fill-opacity="0.22"/>
        ${segs}
        <path d="${line}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
        <g class="profile-marker" style="display:none">
            <line y1="0" y2="${h}" stroke="${COLORS.lime}" stroke-width="1" vector-effect="non-scaling-stroke"/>
            <circle r="3" fill="${COLORS.lime}" stroke="#101010" stroke-width="1" vector-effect="non-scaling-stroke"/>
        </g>
        <g class="profile-ghost-marker" style="display:none">
            <circle r="2.5" fill="${COLORS.ghost}" fill-opacity="0.8" vector-effect="non-scaling-stroke"/>
        </g>
    </svg>`;
}

// Where to draw a rider for a given lap distance, in SVG coordinates.
function riderPlacement(course, lapDistance) {
    const q = project(course, positionAt(course, lapDistance));
    const heading = headingProjected(course, lapDistance);
    return {x: q.x, y: q.y, flip: Math.cos(heading) < 0};
}

// Dotted trail behind a rider (last `meters` of road).
function trailPath(course, lapDistance, meters = 120) {
    const pts = [];
    const step = 6;
    const from = Math.max(lapDistance - meters, lapDistance < meters ? 0 : lapDistance - meters);
    for(let s = from; s <= lapDistance; s += step) {
        pts.push(project(course, positionAt(course, s)));
    }
    if(pts.length < 2) return '';
    return polyline(pts, false);
}

function profileMarker(course, lapDistance) {
    const p = positionAt(course, lapDistance);
    return {
        x: (lapDistance / course.lengthMeters) * PROFILE_W,
        y: profileY(course, p.alt),
    };
}

export {
    courseSvg,
    profileSvg,
    riderPlacement,
    trailPath,
    profileMarker,
    project,
    COLORS,
};
