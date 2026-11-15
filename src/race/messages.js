//
// Short motivational feedback for race events. Deterministic given a seed so
// tests are stable; the controller passes Date.now().
//

import { formatRaceTime, formatDelta } from './format.js';

const climbDone = [
    'Bakken er tatt!',
    'Toppen nådd – pust ut',
    'Sterkt opp bakken!',
    'Det var kneika. Nå ruller det',
];

const sprintDone = [
    'Spurten i boks!',
    'Full gass – godt levert',
    'Spurt fullført',
    'Det der var fart!',
];

const lapDone = [
    'Runde {lap} fullført',
    'Runde {lap} i mål',
    'Runde {lap} unnagjort',
];

const finish = [
    'I mål! Sterkt kjørt',
    'Ferdig – bra jobba',
];

function pick(list, seed = 0) {
    return list[Math.abs(Math.floor(seed)) % list.length];
}

function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// Event -> {title, detail} | null
function messageFor(event, seed = 0) {
    if(!event) return null;

    if(event.type === 'segment:end') {
        const sg = event.segment;
        const list = sg.type === 'climb' ? climbDone : sprintDone;
        return {
            title: pick(list, seed),
            detail: `${sg.name} · ${formatRaceTime(sg.time)}`,
            tone: sg.type,
        };
    }
    if(event.type === 'lap') {
        let detail = formatRaceTime(event.time);
        if(event.ghostTime != null) {
            detail += ` · ${formatDelta(event.ghostTime - event.time)} mot forrige`;
        }
        return {
            title: fill(pick(lapDone, seed), {lap: event.lap}),
            detail,
            tone: 'lap',
        };
    }
    if(event.type === 'finish') {
        let detail = formatRaceTime(event.time);
        if(event.ghostTime != null) {
            detail += ` · ${formatDelta(event.ghostTime - event.time)} mot forrige`;
        }
        return {
            title: pick(finish, seed),
            detail,
            tone: 'finish',
        };
    }
    return null;
}

export { messageFor };
