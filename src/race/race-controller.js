//
// Race controller
//
// Glue between the pure race engine and the rest of Auuki: the watch (time),
// the virtual state (distance from measured power), the trainer (slope
// target) and storage. Everything the UI needs is published on db.race.
//

import { xf, exists, } from '../functions.js';
import { watch } from '../watch.js';
import { ControlMode } from '../ble/enums.js';
import { LocalStorageItem } from '../storage/local-storage.js';
import { courses, getCourse } from './library.js';
import { createRace } from './race-engine.js';
import { gradeAt } from './geometry.js';
import { INTENSITY, clampIntensity, trainerGrade, smoothGrade } from './intensity.js';
import { pickGhost } from './ghost.js';
import { rides } from './rides.js';
import { messageFor } from './messages.js';

const MAX_LAPS = 4;
const LOOKAHEAD_METERS = 8;      // send the grade slightly ahead to hide BLE/trainer latency
const GRADE_RATE = 2.0;          // max %/s change in the grade sent to the trainer
const GRADE_EPSILON = 0.1;       // don't spam the trainer with sub-0.1 % changes
const GRADE_REPEAT_TICKS = 5;    // ...but re-send the same grade every 5 s
const AUTOPAUSE_SECONDS = 5;     // stop the clock after this long at standstill
const AUTORESUME_POWER = 20;     // and restart it when pedalling again
const MESSAGE_MS = 4000;

const defaultSetup = {courseId: courses[0].id, laps: 2, intensity: INTENSITY.default, ghost: true};

const setupStorage = LocalStorageItem({
    key: 'raceSetup',
    fallback: defaultSetup,
    parse: (s) => { try { return JSON.parse(s); } catch(e) { return defaultSetup; } },
    encode: (v) => JSON.stringify(v),
    isValid: (v) => exists(v) && typeof v === 'object',
});

function normalizeSetup(setup = {}) {
    const course = getCourse(setup.courseId);
    return {
        courseId: course.id,
        laps: Math.min(MAX_LAPS, Math.max(1, parseInt(setup.laps) || 1)),
        intensity: clampIntensity(setup.intensity),
        ghost: setup.ghost !== false,
    };
}

function RaceController() {
    let race;
    let ride;
    let ghostRide;
    let sentGrade;
    let standstill = 0;
    let messageTimer;
    let savedSources;
    let pendingActivityLink = false;

    let live = {
        power: 0,
        heartRate: 0,
        cadence: 0,
        speed: 0,
        distance: 0,
    };

    xf.reg('race:setup', (setup, db) => {
        db.raceSetup = normalizeSetup(Object.assign({}, db.raceSetup, setup));
        setupStorage.set(db.raceSetup);
    });
    xf.reg('race:state', (state, db) => {
        db.race = state;
    });
    xf.reg('race:message', (message, db) => {
        db.raceMessage = message;
    });
    xf.reg('race:grade', (grade, db) => {
        db.virtualGrade = grade;
    });
    xf.reg('race:rides', (list, db) => {
        db.rides = list;
    });
    xf.reg('race:ghostInfo', (info, db) => {
        db.raceGhost = info;
    });
    xf.reg('race:result', (result, db) => {
        db.raceResult = result;
    });
    xf.reg('race:screen', (screen, db) => {
        db.raceScreen = screen;
    });
    xf.reg('race:activityName', (name, db) => {
        db.raceActivityName = name;
    });

    xf.sub('db:power1s',      (x) => { live.power = x; onPowerWhilePaused(x); });
    xf.sub('db:heartRate',    (x) => { live.heartRate = x; });
    xf.sub('db:cadence',      (x) => { live.cadence = x; });
    xf.sub('db:speedVirtual', (x) => { live.speed = x; });
    xf.sub('db:distance',     (x) => { live.distance = x; });
    xf.sub('db:elapsed',      onTick);
    xf.sub('db:watchStatus',  () => { if(race) publish(); });
    xf.sub('db:raceSetup',    onSetupChanged);
    xf.sub('activity:add',    onActivityAdded);

    xf.sub('ui:race:start',     start);
    xf.sub('ui:race:pause',     pause);
    xf.sub('ui:race:resume',    resume);
    xf.sub('ui:race:stop',      abort);
    xf.sub('ui:race:intensity', onIntensityChange);
    xf.sub('ui:race:dismissResult', () => {
        xf.dispatch('race:result', null);
        xf.dispatch('race:screen', 'select');
    });
    xf.sub('ui:race:deleteRide', async (id) => {
        await rides.remove(id);
        await refreshRides();
    });

    xf.sub('app:ready', init);

    async function init() {
        // Races start from the big START button and pause on standstill
        // (see onTick), so Auuki's power-based auto start/pause stay off.
        xf.dispatch('sources', {autoStart: false, autoPause: false});
        xf.dispatch('race:setup', setupStorage.restore());
        xf.dispatch('race:screen', 'select');
        await refreshRides();
    }

    async function refreshRides() {
        const list = await rides.restore();
        xf.dispatch('race:rides', list);
        await updateGhostInfo();
    }

    async function onSetupChanged() {
        await updateGhostInfo();
    }

    // Tell the select screen whether a comparable previous ride exists.
    async function updateGhostInfo() {
        const setup = currentSetup();
        const list = currentRides();
        const candidate = pickGhost(list, setup.courseId, setup.laps);
        xf.dispatch('race:ghostInfo', candidate ? {
            available: true,
            rideId: candidate.id,
            finishedAt: candidate.finishedAt,
            totalTime: candidate.totalTime,
            intensity: candidate.intensity,
            avgPower: candidate.avgPower,
        } : {available: false});
    }

    let _setup = normalizeSetup();
    let _rides = [];
    let _sources = {};
    xf.sub('db:raceSetup', (s) => { _setup = s; });
    xf.sub('db:rides', (r) => { _rides = r; });
    xf.sub('db:sources', (s) => { _sources = s; });
    function currentSetup() { return _setup; }
    function currentRides() { return _rides; }

    async function start() {
        if(race && race.getState().status === 'running') return;

        const setup = currentSetup();
        const course = getCourse(setup.courseId);

        // a stale session (e.g. after reload) must not leak into this ride
        if(!watch.isStopped()) {
            watch.stop();
        }

        ghostRide = undefined;
        if(setup.ghost) {
            const candidate = pickGhost(currentRides(), course.id, setup.laps);
            if(candidate) {
                ghostRide = await rides.get(candidate.id);
            }
        }

        race = createRace({
            course,
            laps: setup.laps,
            intensity: setup.intensity,
            ghost: ghostRide,
        });

        ride = rides.newRide({
            courseId: course.id,
            courseName: course.name,
            laps: setup.laps,
            intensity: setup.intensity,
            ghostRideId: ghostRide?.id ?? null,
        });

        savedSources = {
            autoPause: _sources.autoPause,
        };
        xf.dispatch('sources', {autoPause: false, autoStart: false});

        standstill = 0;
        sentGrade = undefined;
        xf.dispatch('race:result', null);
        xf.dispatch('ui:mode-set', ControlMode.sim);
        xf.dispatch('race:grade', gradeAt(course, 0));
        sendGrade(0, 1);
        xf.dispatch('race:activityName', `${course.name} · ${setup.laps} ${setup.laps === 1 ? 'runde' : 'runder'}`);

        race.start();
        publish();
        xf.dispatch('race:screen', 'ride');
        xf.dispatch('ui:watchStart');
    }

    function pause() {
        if(!race || race.getState().status !== 'running') return;
        if(watch.isStarted()) xf.dispatch('ui:watchPause');
    }

    function resume() {
        if(!race || race.getState().status !== 'running') return;
        if(watch.isPaused()) xf.dispatch('ui:watchResume');
    }

    function onPowerWhilePaused(power) {
        if(!race || race.getState().status !== 'running') return;
        if(watch.isPaused() && power > AUTORESUME_POWER && standstill >= AUTOPAUSE_SECONDS) {
            standstill = 0;
            xf.dispatch('ui:watchResume');
        }
    }

    function onIntensityChange(value) {
        const intensity = clampIntensity(value);
        xf.dispatch('race:setup', {intensity});
        if(race) {
            race.setIntensity(intensity);
            if(ride) ride.intensity = intensity;
            publish();
        }
    }

    function onTick(elapsed) {
        if(!race || race.getState().status !== 'running') return;
        if(!watch.isStarted()) return;

        const { state, events } = race.update({elapsed, distance: live.distance});

        ride.samples.push({
            t: elapsed,
            d: Math.round(state.distance * 10) / 10,
            p: Math.round(live.power),
            h: Math.round(live.heartRate),
            c: Math.round(live.cadence),
            s: Math.round(live.speed * 100) / 100,
            a: Math.round(state.altitude * 10) / 10,
        });

        // resistance follows the road ahead
        xf.dispatch('race:grade', state.grade);
        sendGrade(state.lapDistance + LOOKAHEAD_METERS, 1);

        // autopause on standstill, not on zero power (coasting downhill is fine)
        if(live.speed < 0.3 && live.power === 0) {
            standstill += 1;
            if(standstill === AUTOPAUSE_SECONDS) {
                xf.dispatch('ui:watchPause');
            }
        } else {
            standstill = 0;
        }

        for(const event of events) {
            onEvent(event, state);
        }

        publish();

        if(state.status === 'finished') {
            finish(true);
        }
    }

    function onEvent(event) {
        if(event.type === 'lap') {
            ride.lapTimes.push(event.time);
            xf.dispatch('watch:beep', 'lap');
        }
        if(event.type === 'segment:end') {
            ride.segmentTimes.push(event.segment);
        }
        const message = messageFor(event, Date.now());
        if(message) showMessage(message);
    }

    function showMessage(message) {
        clearTimeout(messageTimer);
        xf.dispatch('race:message', Object.assign({at: Date.now()}, message));
        messageTimer = setTimeout(() => xf.dispatch('race:message', null), MESSAGE_MS);
    }

    let unchangedTicks = 0;

    function sendGrade(lapDistance, dt) {
        const course = race.course;
        const intensity = race.getState().intensity;
        const target = trainerGrade(gradeAt(course, lapDistance), intensity);
        const next = smoothGrade(sentGrade, target.grade, dt, GRADE_RATE);
        const changed = !exists(sentGrade) || Math.abs(next - sentGrade) >= GRADE_EPSILON;
        // FTMS writes are dropped while the control point is busy, so repeat
        // the current grade now and then even when nothing changed.
        if(changed || ++unchangedTicks >= GRADE_REPEAT_TICKS) {
            unchangedTicks = 0;
            sentGrade = Math.round(next * 10) / 10;
            xf.dispatch('ui:slope-target-set', sentGrade);
        }
        return target.clipped;
    }

    function publish() {
        const state = race.getState();
        const course = race.course;
        const target = trainerGrade(state.grade, state.intensity);
        xf.dispatch('race:state', {
            ...state,
            courseName: course.name,
            lengthMeters: course.lengthMeters,
            paused: watch.isPaused(),
            trainerGrade: sentGrade ?? target.grade,
            trainerClipped: target.clipped,
            ghostIntensity: ghostRide?.intensity ?? null,
        });
    }

    async function finish(completed) {
        const state = race.getState();
        ride.completed = completed;
        ride.finishedAt = Date.now();
        ride.lapTimes = state.lapTimes.slice();
        ride.segmentTimes = state.segmentTimes.slice();
        ride.ascent = Math.round(state.distance / race.course.lengthMeters * race.course.ascent);
        rides.summarize(ride);
        ride.totalTime = state.elapsed;

        pendingActivityLink = true;
        xf.dispatch('race:grade', null);
        xf.dispatch('ui:slope-target-set', 0);
        if(!watch.isStopped()) {
            watch.stop(); // saves the .fit activity via the existing flow
        }
        pendingActivityLink = false;

        const result = {
            ride: rides.toSummary(ride),
            ghost: ghostRide ? rides.toSummary(ghostRide) : null,
            courseName: race.course.name,
            completed,
        };

        await rides.save(ride);
        await refreshRides();

        if(exists(savedSources?.autoPause)) {
            xf.dispatch('sources', {autoPause: savedSources.autoPause});
        }

        race = undefined;
        xf.dispatch('race:result', result);
        xf.dispatch('race:screen', 'result');
    }

    function onActivityAdded(summary) {
        if(pendingActivityLink && ride) {
            ride.activityId = summary.id;
        }
    }

    function abort() {
        if(!race) return;
        if(race.getState().elapsed < 5) {
            // nothing worth keeping
            xf.dispatch('race:grade', null);
            xf.dispatch('ui:slope-target-set', 0);
            if(!watch.isStopped()) watch.stop();
            race = undefined;
            xf.dispatch('race:screen', 'select');
            return;
        }
        finish(false);
    }

    return Object.freeze({
        MAX_LAPS,
    });
}

const raceController = RaceController();

export { raceController, MAX_LAPS };
