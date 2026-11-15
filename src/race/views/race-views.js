//
// Race UI: course selection, the ride screen and the result screen.
// Web components in the same style as the rest of Auuki, driven by db:* events.
//

import { xf, exists, } from '../../functions.js';
import { models } from '../../models/models.js';
import { courses, getCourse } from '../library.js';
import { INTENSITY, TRAINER_LIMITS, trainerGrade } from '../intensity.js';
import { MAX_LAPS } from '../race-controller.js';
import { formatRaceTime, formatDelta, formatDistance, formatGrade } from '../format.js';
import { courseSvg, profileSvg, riderPlacement, trailPath, profileMarker } from './course-svg.js';

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function dateLabel(ts) {
    if(!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('nb-NO', {day: 'numeric', month: 'short'}) + ' ' +
        d.toLocaleTimeString('nb-NO', {hour: '2-digit', minute: '2-digit'});
}

//
// <race-app>: shows one of the three screens and flags the body while riding
//
class RaceApp extends HTMLElement {
    connectedCallback() {
        this.abortController = new AbortController();
        const signal = {signal: this.abortController.signal};
        xf.sub('db:raceScreen', this.onScreen.bind(this), signal);
        xf.sub('db:page', this.onPage.bind(this), signal);
        this.screen = 'select';
        this.page = 'race';
        this.apply();
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    onScreen(screen) {
        this.screen = screen;
        this.apply();
    }
    onPage(page) {
        this.page = page;
        this.apply();
    }
    apply() {
        for(const el of this.querySelectorAll('[data-screen]')) {
            el.classList.toggle('active', el.dataset.screen === this.screen);
        }
        const riding = this.page === 'race' && this.screen === 'ride';
        document.body.classList.toggle('race-riding', riding);
        document.body.classList.toggle('race-page', this.page === 'race');
    }
}
customElements.define('race-app', RaceApp);

//
// <race-select>
//
class RaceSelect extends HTMLElement {
    connectedCallback() {
        this.abortController = new AbortController();
        const signal = {signal: this.abortController.signal};

        this.setup = {courseId: courses[0].id, laps: 2, intensity: 100, ghost: true};
        this.ghostInfo = {available: false};
        this.rides = [];
        this.render();

        xf.sub('db:raceSetup', this.onSetup.bind(this), signal);
        xf.sub('db:raceGhost', this.onGhost.bind(this), signal);
        xf.sub('db:rides', this.onRides.bind(this), signal);
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    render() {
        this.innerHTML = `
            <div class="race-select-cards" id="race-cards">
                ${courses.map((c, i) => this.cardTemplate(c, i)).join('')}
            </div>
            <div class="race-select-dots">${courses.map(c => `<span class="race-dot" data-course="${c.id}"></span>`).join('')}</div>
            <div class="race-select-controls">
                <div class="race-control">
                    <div class="race-control-label">Runder</div>
                    <div class="race-segmented" id="race-laps">
                        ${Array.from({length: MAX_LAPS}, (_, i) => `<button type="button" data-laps="${i + 1}">${i + 1}</button>`).join('')}
                    </div>
                </div>
                <div class="race-control">
                    <div class="race-control-label">Intensitet</div>
                    <div class="race-stepper">
                        <button type="button" class="race-round-btn" id="race-int-dec" aria-label="Lavere intensitet">−</button>
                        <div class="race-stepper-value"><span id="race-int-value">100</span><span class="race-unit">%</span></div>
                        <button type="button" class="race-round-btn" id="race-int-inc" aria-label="Høyere intensitet">+</button>
                    </div>
                    <div class="race-control-hint" id="race-int-hint"></div>
                </div>
                <div class="race-control">
                    <div class="race-control-label">Forrige tur som ghost</div>
                    <button type="button" class="race-toggle" id="race-ghost-toggle" role="switch" aria-checked="true">
                        <span class="race-toggle-knob"></span>
                    </button>
                    <div class="race-control-hint" id="race-ghost-hint"></div>
                </div>
            </div>
            <button type="button" class="race-start-btn" id="race-start">
                <span class="race-start-icon">▶</span> START
            </button>
            <div class="race-history" id="race-history"></div>
        `;

        this.$cards = this.querySelector('#race-cards');
        this.$cards.addEventListener('scroll', this.onScroll.bind(this), {passive: true});
        this.$cards.addEventListener('click', (e) => {
            const card = e.target.closest('.race-card');
            if(card) this.selectCourse(card.dataset.course, true);
        });
        this.querySelector('#race-laps').addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if(b) xf.dispatch('race:setup', {laps: parseInt(b.dataset.laps)});
        });
        this.querySelector('#race-int-dec').addEventListener('click', () => {
            xf.dispatch('race:setup', {intensity: this.setup.intensity - INTENSITY.step});
        });
        this.querySelector('#race-int-inc').addEventListener('click', () => {
            xf.dispatch('race:setup', {intensity: this.setup.intensity + INTENSITY.step});
        });
        this.querySelector('#race-ghost-toggle').addEventListener('click', () => {
            xf.dispatch('race:setup', {ghost: !this.setup.ghost});
        });
        this.querySelector('#race-start').addEventListener('click', () => {
            xf.dispatch('ui:race:start');
        });
        this.querySelector('#race-history').addEventListener('click', this.onHistoryClick.bind(this));
    }
    cardTemplate(course, i) {
        return `
            <article class="race-card" data-course="${course.id}">
                <div class="race-card-map">${courseSvg(course, 'preview')}</div>
                <div class="race-card-body">
                    <div class="race-card-title">
                        <h2>${esc(course.name)}</h2>
                        <span class="race-card-tag">${esc(course.tagline)}</span>
                    </div>
                    <div class="race-card-stats">
                        <div><b>${formatDistance(course.lengthMeters)}</b><span>per runde</span></div>
                        <div><b>${course.ascent} m</b><span>høydemeter</span></div>
                        <div><b>${formatGrade(course.maxGrade).replace('+', '')}</b><span>brattest</span></div>
                        <div><b>${course.segments.filter(s => s.type === 'climb').length} / ${course.segments.filter(s => s.type === 'sprint').length}</b><span>bakker / spurter</span></div>
                    </div>
                    <div class="race-card-profile">${profileSvg(course, {key: 'card' + i})}</div>
                    <p class="race-card-desc">${esc(course.description)}</p>
                </div>
            </article>`;
    }
    onSetup(setup) {
        const courseChanged = setup.courseId !== this.setup.courseId;
        this.setup = setup;
        this.update();
        if(courseChanged) this.scrollToCourse(setup.courseId);
    }
    onGhost(info) {
        this.ghostInfo = info ?? {available: false};
        this.update();
    }
    onRides(rides) {
        this.rides = rides ?? [];
        this.renderHistory();
    }
    update() {
        const s = this.setup;
        for(const card of this.querySelectorAll('.race-card')) {
            card.classList.toggle('selected', card.dataset.course === s.courseId);
        }
        for(const dot of this.querySelectorAll('.race-dot')) {
            dot.classList.toggle('active', dot.dataset.course === s.courseId);
        }
        for(const b of this.querySelectorAll('#race-laps button')) {
            b.classList.toggle('active', parseInt(b.dataset.laps) === s.laps);
        }
        this.querySelector('#race-int-value').textContent = s.intensity;
        this.querySelector('#race-int-dec').disabled = s.intensity <= INTENSITY.min;
        this.querySelector('#race-int-inc').disabled = s.intensity >= INTENSITY.max;

        const course = getCourse(s.courseId);
        const steepest = trainerGrade(course.maxGrade, s.intensity);
        let hint = `Brattest bakke føles som ${formatGrade(steepest.grade).replace('+', '')}`;
        if(steepest.clipped) hint += ` (rulla stopper på ${TRAINER_LIMITS.maxGrade} %)`;
        this.querySelector('#race-int-hint').textContent = hint;

        const toggle = this.querySelector('#race-ghost-toggle');
        toggle.classList.toggle('on', s.ghost);
        toggle.setAttribute('aria-checked', String(s.ghost));
        const g = this.ghostInfo;
        const ghostHint = this.querySelector('#race-ghost-hint');
        if(g.available) {
            ghostHint.textContent = `Forrige: ${formatRaceTime(g.totalTime)} · ${g.intensity} % · ${g.avgPower} W (${dateLabel(g.finishedAt)})`;
            ghostHint.classList.remove('warn');
        } else {
            ghostHint.textContent = `Ingen fullført tur på ${course.name} med ${s.laps} ${s.laps === 1 ? 'runde' : 'runder'} ennå – ingen ghost denne gangen`;
            ghostHint.classList.toggle('warn', s.ghost);
        }
    }
    selectCourse(id, scroll) {
        if(id !== this.setup.courseId) xf.dispatch('race:setup', {courseId: id});
        if(scroll) this.scrollToCourse(id);
    }
    scrollToCourse(id) {
        const card = this.querySelector(`.race-card[data-course="${id}"]`);
        if(!card || !this.$cards) return;
        const left = card.offsetLeft - (this.$cards.clientWidth - card.clientWidth) / 2;
        this.$cards.scrollTo({left, behavior: 'smooth'});
    }
    onScroll() {
        clearTimeout(this.scrollTimer);
        this.scrollTimer = setTimeout(() => {
            const center = this.$cards.scrollLeft + this.$cards.clientWidth / 2;
            let best, bestD = Infinity;
            for(const card of this.$cards.querySelectorAll('.race-card')) {
                const c = card.offsetLeft + card.clientWidth / 2;
                const d = Math.abs(c - center);
                if(d < bestD) { bestD = d; best = card; }
            }
            if(best && best.dataset.course !== this.setup.courseId) {
                this.selectCourse(best.dataset.course, false);
            }
        }, 120);
    }
    renderHistory() {
        const $h = this.querySelector('#race-history');
        if(!this.rides.length) {
            $h.innerHTML = `<h3>Historikk</h3><p class="race-muted">Ingen turer ennå. Den første blir sammenligningsgrunnlag for neste.</p>`;
            return;
        }
        $h.innerHTML = `<h3>Historikk <span class="race-muted">(${this.rides.length})</span></h3>
            <ul class="race-history-list">
            ${this.rides.slice(0, 30).map(r => `
                <li class="race-history-item ${r.completed ? '' : 'incomplete'}" data-id="${r.id}">
                    <div class="race-history-main">
                        <b>${esc(r.courseName)}</b>
                        <span>${r.laps} ${r.laps === 1 ? 'runde' : 'runder'} · ${r.intensity} %${r.completed ? '' : ' · avbrutt'}</span>
                        <span class="race-muted">${dateLabel(r.startedAt)}</span>
                    </div>
                    <div class="race-history-time">${formatRaceTime(r.totalTime)}<span>${r.avgPower} W</span></div>
                    <div class="race-history-actions">
                        ${r.activityId ? `<button type="button" data-action="fit" title="Last ned .fit">FIT</button>` : ''}
                        <button type="button" data-action="delete" title="Slett">✕</button>
                    </div>
                </li>`).join('')}
            </ul>`;
    }
    onHistoryClick(e) {
        const btn = e.target.closest('button[data-action]');
        if(!btn) return;
        const item = btn.closest('.race-history-item');
        const ride = this.rides.find(r => r.id === item.dataset.id);
        if(!ride) return;
        if(btn.dataset.action === 'fit' && ride.activityId) {
            models.activity.download(ride.activityId);
        }
        if(btn.dataset.action === 'delete') {
            if(confirm(`Slette turen på ${ride.courseName} (${formatRaceTime(ride.totalTime)})?`)) {
                xf.dispatch('ui:race:deleteRide', ride.id);
            }
        }
    }
}
customElements.define('race-select', RaceSelect);

//
// <race-ride>: the big map with the HUD
//
class RaceRide extends HTMLElement {
    connectedCallback() {
        this.abortController = new AbortController();
        const signal = {signal: this.abortController.signal};

        this.state = null;
        this.courseId = null;
        this.course = null;
        this.live = {power: 0, heartRate: 0, cadence: 0, elapsed: 0};
        this.anim = {
            rider: {from: 0, to: 0, t0: 0},
            ghost: {from: 0, to: 0, t0: 0},
        };
        this.overlayOpen = false;
        this.confirmStop = false;

        this.render();

        xf.sub('db:race', this.onState.bind(this), signal);
        xf.sub('db:raceMessage', this.onMessage.bind(this), signal);
        xf.sub('db:raceScreen', this.onScreen.bind(this), signal);
        xf.sub('db:power1s', (x) => { this.live.power = x; this.updateMetrics(); }, signal);
        xf.sub('db:heartRate', (x) => { this.live.heartRate = x; this.updateMetrics(); }, signal);
        xf.sub('db:cadence', (x) => { this.live.cadence = x; this.updateMetrics(); }, signal);
        xf.sub('db:elapsed', (x) => { this.live.elapsed = x; this.updateMetrics(); }, signal);
    }
    disconnectedCallback() {
        this.abortController.abort();
        this.stopLoop();
    }
    render() {
        this.innerHTML = `
            <div class="ride-map" id="ride-map"></div>

            <div class="hud hud-top-left">
                <div class="hud-panel hud-title">
                    <div class="hud-title-bar"></div>
                    <div>
                        <h1 id="ride-course-name">–</h1>
                        <div class="hud-sub" id="ride-course-sub"></div>
                    </div>
                </div>
                <div class="hud-panel hud-metrics">
                    <div class="hud-metric hud-metric-power">
                        <span class="hud-metric-icon">⚡</span>
                        <span class="hud-metric-value" id="ride-power">0</span>
                        <span class="hud-metric-unit">W</span>
                    </div>
                    <div class="hud-metric">
                        <span class="hud-metric-icon">⟳</span>
                        <span class="hud-metric-value" id="ride-cadence">0</span>
                        <span class="hud-metric-unit">rpm</span>
                    </div>
                    <div class="hud-metric hud-metric-hr" id="ride-hr-row">
                        <span class="hud-metric-icon">♥</span>
                        <span class="hud-metric-value" id="ride-hr">–</span>
                        <span class="hud-metric-unit">bpm</span>
                    </div>
                </div>
            </div>

            <div class="hud hud-top-center">
                <div class="hud-panel hud-lap">RUNDE <span id="ride-lap">1</span> / <span id="ride-laps">1</span></div>
            </div>

            <div class="hud hud-top-right">
                <div class="hud-panel hud-upcoming" id="ride-upcoming">
                    <span class="hud-upcoming-icon" id="ride-upcoming-icon"></span>
                    <span id="ride-upcoming-text">–</span>
                    <span class="hud-upcoming-grade" id="ride-upcoming-grade"></span>
                </div>
                <button type="button" class="hud-icon-btn" id="ride-pause-btn" aria-label="Pause">❚❚</button>
            </div>

            <div class="hud hud-bottom-left">
                <div class="hud-panel hud-time"><span class="hud-time-icon">⏱</span><span id="ride-time">0:00</span></div>
            </div>

            <div class="hud hud-bottom-right">
                <div class="hud-panel hud-delta" id="ride-delta-panel">
                    <div class="hud-delta-value" id="ride-delta">–</div>
                    <div class="hud-delta-sub" id="ride-delta-sub">Ingen forrige tur</div>
                </div>
            </div>

            <div class="hud hud-bottom-center">
                <div class="hud-panel hud-overlay" id="ride-overlay">
                    <button type="button" class="hud-overlay-handle" id="ride-overlay-toggle">
                        <span class="hud-overlay-label">INTENSITET</span>
                        <span class="hud-overlay-value"><span id="ride-int-value">100</span> %</span>
                        <span class="hud-overlay-chevron">⌃</span>
                    </button>
                    <div class="hud-overlay-body">
                        <div class="hud-portrait-metrics">
                            <div class="hud-metric hud-metric-power"><span class="hud-metric-icon">⚡</span><span class="hud-metric-value" id="ride-power-p">0</span><span class="hud-metric-unit">W</span></div>
                            <div class="hud-metric"><span class="hud-metric-icon">⟳</span><span class="hud-metric-value" id="ride-cadence-p">0</span><span class="hud-metric-unit">rpm</span></div>
                            <div class="hud-metric hud-metric-hr"><span class="hud-metric-icon">♥</span><span class="hud-metric-value" id="ride-hr-p">–</span><span class="hud-metric-unit">bpm</span></div>
                        </div>
                        <div class="hud-overlay-row">
                            <button type="button" class="race-round-btn" id="ride-int-dec" aria-label="Lavere intensitet">−</button>
                            <div class="hud-int-big"><span id="ride-int-big">100</span> %</div>
                            <button type="button" class="race-round-btn" id="ride-int-inc" aria-label="Høyere intensitet">+</button>
                        </div>
                        <div class="hud-int-track"><div class="hud-int-fill" id="ride-int-fill"></div></div>
                        <div class="hud-int-hint" id="ride-int-hint"></div>
                        <div class="hud-profile" id="ride-profile"></div>
                        <div class="hud-overlay-actions">
                            <button type="button" class="hud-big-btn" id="ride-pause-big">PAUSE</button>
                            <button type="button" class="hud-big-btn danger" id="ride-stop-big">AVSLUTT</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="ride-toast" id="ride-toast"></div>

            <div class="ride-paused" id="ride-paused">
                <div class="ride-paused-card">
                    <h2>PAUSE</h2>
                    <p class="race-muted">Begynn å tråkke for å fortsette, eller trykk Fortsett.</p>
                    <div class="ride-paused-actions">
                        <button type="button" class="hud-big-btn primary" id="ride-resume">FORTSETT</button>
                        <button type="button" class="hud-big-btn danger" id="ride-stop">AVSLUTT</button>
                    </div>
                </div>
            </div>

            <div class="ride-confirm" id="ride-confirm">
                <div class="ride-paused-card">
                    <h2>Avslutte turen?</h2>
                    <p class="race-muted">Turen lagres som avbrutt og blir ikke brukt som ghost.</p>
                    <div class="ride-paused-actions">
                        <button type="button" class="hud-big-btn" id="ride-confirm-no">NEI, FORTSETT</button>
                        <button type="button" class="hud-big-btn danger" id="ride-confirm-yes">JA, AVSLUTT</button>
                    </div>
                </div>
            </div>
        `;

        this.$map = this.querySelector('#ride-map');
        const q = (s) => this.querySelector(s);
        q('#ride-pause-btn').addEventListener('click', () => this.togglePause());
        q('#ride-pause-big').addEventListener('click', () => this.togglePause());
        q('#ride-resume').addEventListener('click', () => xf.dispatch('ui:race:resume'));
        q('#ride-stop').addEventListener('click', () => this.askStop());
        q('#ride-stop-big').addEventListener('click', () => this.askStop());
        q('#ride-confirm-no').addEventListener('click', () => this.showConfirm(false));
        q('#ride-confirm-yes').addEventListener('click', () => {
            this.showConfirm(false);
            xf.dispatch('ui:race:stop');
        });
        q('#ride-int-dec').addEventListener('click', () => this.changeIntensity(-INTENSITY.step));
        q('#ride-int-inc').addEventListener('click', () => this.changeIntensity(INTENSITY.step));
        q('#ride-overlay-toggle').addEventListener('click', () => this.toggleOverlay());
    }
    onScreen(screen) {
        if(screen === 'ride') {
            this.startLoop();
        } else {
            this.stopLoop();
            this.showConfirm(false);
            this.setOverlay(false);
        }
    }
    togglePause() {
        if(!this.state) return;
        if(this.state.paused) xf.dispatch('ui:race:resume');
        else xf.dispatch('ui:race:pause');
    }
    askStop() {
        this.showConfirm(true);
    }
    showConfirm(show) {
        this.querySelector('#ride-confirm').classList.toggle('open', show);
    }
    changeIntensity(delta) {
        if(!this.state) return;
        xf.dispatch('ui:race:intensity', this.state.intensity + delta);
    }
    toggleOverlay() {
        this.setOverlay(!this.overlayOpen);
    }
    setOverlay(open) {
        this.overlayOpen = open;
        this.querySelector('#ride-overlay').classList.toggle('open', open);
    }
    ensureCourse(courseId) {
        if(courseId === this.courseId) return;
        this.courseId = courseId;
        this.course = getCourse(courseId);
        this.$map.innerHTML = courseSvg(this.course, 'ride');
        this.querySelector('#ride-profile').innerHTML = profileSvg(this.course, {key: 'ride'});
        this.$rider = this.$map.querySelector('.main-rider');
        this.$riderFlip = this.$rider.querySelector('.rider-flip');
        this.$ghost = this.$map.querySelector('.ghost-rider');
        this.$ghostFlip = this.$ghost.querySelector('.rider-flip');
        this.$trail = this.$map.querySelector('.ghost-trail-path');
        this.$profileMarker = this.querySelector('#ride-profile .profile-marker');
        this.$profileGhost = this.querySelector('#ride-profile .profile-ghost-marker');
        this.$signs = Array.from(this.$map.querySelectorAll('.segment-sign'));
        this.querySelector('#ride-course-name').textContent = this.course.name;
        this.querySelector('#ride-course-sub').textContent = `${formatDistance(this.course.lengthMeters)} per runde · ${this.course.ascent} hm`;
        this.anim.rider = {from: 0, to: 0, t0: performance.now()};
        this.anim.ghost = {from: 0, to: 0, t0: performance.now()};
        this.placeRider(this.$rider, this.$riderFlip, 0);
    }
    onState(state) {
        if(!state) return;
        this.state = state;
        this.ensureCourse(state.courseId);

        const now = performance.now();
        const r = this.anim.rider;
        r.from = this.currentDistance(r, now);
        r.to = state.distance;
        r.t0 = now;

        if(state.hasGhost && exists(state.ghostDistance)) {
            const g = this.anim.ghost;
            g.from = this.currentDistance(g, now);
            g.to = state.ghostDistance;
            g.t0 = now;
            this.$ghost.style.display = '';
            this.$profileGhost.style.display = '';
        } else {
            this.$ghost.style.display = 'none';
            this.$profileGhost.style.display = 'none';
        }

        const q = (s) => this.querySelector(s);
        q('#ride-lap').textContent = state.lap;
        q('#ride-laps').textContent = state.laps;
        q('#ride-int-value').textContent = state.intensity;
        q('#ride-int-big').textContent = state.intensity;
        q('#ride-int-fill').style.width = `${((state.intensity - INTENSITY.min) / (INTENSITY.max - INTENSITY.min)) * 100}%`;
        q('#ride-int-dec').disabled = state.intensity <= INTENSITY.min;
        q('#ride-int-inc').disabled = state.intensity >= INTENSITY.max;

        const g = state.trainerGrade ?? 0;
        let hint = `Rulla: ${formatGrade(g)} nå (løypa: ${formatGrade(state.grade)})`;
        if(state.trainerClipped) hint += ` · rullegrense`;
        q('#ride-int-hint').textContent = hint;

        this.updateUpcoming(state);
        this.updateDelta(state);
        this.updateSigns(state);

        this.querySelector('#ride-paused').classList.toggle('open', state.paused === true);
        this.querySelector('#ride-pause-btn').textContent = state.paused ? '▶' : '❚❚';
        this.querySelector('#ride-pause-big').textContent = state.paused ? 'FORTSETT' : 'PAUSE';
    }
    updateUpcoming(state) {
        const up = state.upcoming;
        const $panel = this.querySelector('#ride-upcoming');
        const $icon = this.querySelector('#ride-upcoming-icon');
        const $text = this.querySelector('#ride-upcoming-text');
        const $grade = this.querySelector('#ride-upcoming-grade');
        $panel.classList.remove('climb', 'sprint', 'finish');
        if(!up) { $text.textContent = '–'; $grade.textContent = ''; return; }

        $panel.classList.add(up.type);
        const dist = formatDistance(up.distanceTo);
        if(up.type === 'finish') {
            $icon.textContent = '🏁';
            $text.textContent = `Mål om ${dist}`;
            $grade.textContent = '';
        } else if(up.kind === 'in') {
            $icon.textContent = up.type === 'climb' ? '▲' : '⚡';
            $text.textContent = `${up.name} · ${dist} igjen`;
            $grade.textContent = up.type === 'climb' ? formatGrade(state.grade) : '';
        } else {
            $icon.textContent = up.type === 'climb' ? '▲' : '⚡';
            $text.textContent = `${up.type === 'climb' ? 'Bakke' : 'Spurt'} om ${dist}`;
            $grade.textContent = up.type === 'climb' ? `${formatGrade(up.avgGrade)} · ${up.gain} m` : `${formatDistance(up.length)}`;
        }
    }
    updateDelta(state) {
        const $panel = this.querySelector('#ride-delta-panel');
        const $v = this.querySelector('#ride-delta');
        const $s = this.querySelector('#ride-delta-sub');
        $panel.classList.remove('ahead', 'behind', 'none');
        if(!state.hasGhost || !exists(state.ghostDelta)) {
            $panel.classList.add('none');
            $v.textContent = '–';
            $s.textContent = 'Ingen forrige tur å måle mot';
            return;
        }
        const d = state.ghostDelta;
        $panel.classList.add(d >= 0 ? 'ahead' : 'behind');
        const abs = Math.abs(Math.round(d));
        $v.textContent = `${abs < 60 ? `${abs} s` : formatRaceTime(abs)} ${d >= 0 ? 'foran' : 'bak'}`;
        $s.textContent = `Din forrige tur${exists(state.ghostIntensity) ? ` (${state.ghostIntensity} %)` : ''}`;
    }
    updateSigns(state) {
        const active = state.activeSegment?.id;
        for(const $s of this.$signs) {
            $s.classList.toggle('active', $s.dataset.segment === active);
        }
    }
    updateMetrics() {
        if(!this.isConnected) return;
        const power = Math.round(this.live.power);
        const cadence = Math.round(this.live.cadence);
        const hr = this.live.heartRate;
        const hrText = hr > 0 ? Math.round(hr) : '–';
        this.querySelector('#ride-power').textContent = power;
        this.querySelector('#ride-power-p').textContent = power;
        this.querySelector('#ride-cadence').textContent = cadence;
        this.querySelector('#ride-cadence-p').textContent = cadence;
        this.querySelector('#ride-hr').textContent = hrText;
        this.querySelector('#ride-hr-p').textContent = hrText;
        this.querySelector('#ride-hr-row').classList.toggle('muted', !(hr > 0));
        this.querySelector('#ride-time').textContent = formatRaceTime(this.live.elapsed);
    }
    onMessage(message) {
        const $t = this.querySelector('#ride-toast');
        if(!message) { $t.classList.remove('show'); return; }
        $t.className = `ride-toast show tone-${message.tone ?? 'lap'}`;
        $t.innerHTML = `<div class="ride-toast-title">${esc(message.title)}</div><div class="ride-toast-detail">${esc(message.detail ?? '')}</div>`;
    }
    currentDistance(a, now) {
        const t = Math.min(1, (now - a.t0) / 1000);
        return a.from + (a.to - a.from) * t;
    }
    startLoop() {
        if(this.raf) return;
        const tick = (now) => {
            this.raf = requestAnimationFrame(tick);
            this.frame(now);
        };
        this.raf = requestAnimationFrame(tick);
    }
    stopLoop() {
        if(this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
    }
    frame(now) {
        if(!this.course || !this.state) return;
        const L = this.course.lengthMeters;
        const rd = this.currentDistance(this.anim.rider, now);
        const riderLap = this.state.status === 'finished' ? L : rd % L;
        this.placeRider(this.$rider, this.$riderFlip, riderLap);

        const pm = profileMarker(this.course, riderLap);
        this.$profileMarker.style.display = '';
        this.$profileMarker.setAttribute('transform', `translate(${pm.x.toFixed(1)} 0)`);
        this.$profileMarker.querySelector('circle').setAttribute('cy', pm.y.toFixed(1));

        if(this.state.hasGhost && this.$ghost.style.display !== 'none') {
            const gd = this.currentDistance(this.anim.ghost, now);
            const ghostLap = gd % L;
            this.placeRider(this.$ghost, this.$ghostFlip, ghostLap);
            this.$trail.setAttribute('d', trailPath(this.course, ghostLap));
            const gm = profileMarker(this.course, ghostLap);
            this.$profileGhost.setAttribute('transform', `translate(${gm.x.toFixed(1)} ${gm.y.toFixed(1)})`);
        }
    }
    placeRider($g, $flip, lapDistance) {
        const p = riderPlacement(this.course, lapDistance);
        $g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        $flip.setAttribute('transform', p.flip ? 'scale(-1 1)' : '');
    }
}
customElements.define('race-ride', RaceRide);

//
// <race-result>
//
class RaceResult extends HTMLElement {
    connectedCallback() {
        this.abortController = new AbortController();
        const signal = {signal: this.abortController.signal};
        this.innerHTML = `<div class="race-result-inner" id="race-result-inner"></div>`;
        xf.sub('db:raceResult', this.onResult.bind(this), signal);
        this.addEventListener('click', this.onClick.bind(this));
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    onResult(result) {
        this.result = result;
        const $i = this.querySelector('#race-result-inner');
        if(!result) { $i.innerHTML = ''; return; }
        const r = result.ride;
        const g = result.ghost;
        const course = getCourse(r.courseId);
        const delta = (g && result.completed) ? g.totalTime - r.totalTime : null;

        const lapRows = r.lapTimes.map((t, i) => {
            const gt = g?.lapTimes?.[i];
            return `<tr><td>Runde ${i + 1}</td><td>${formatRaceTime(t)}</td><td class="${exists(gt) ? (gt - t >= 0 ? 'ahead' : 'behind') : ''}">${exists(gt) ? formatDelta(gt - t) : '–'}</td></tr>`;
        }).join('');

        const segRows = r.segmentTimes.map(s => {
            const gs = g?.segmentTimes?.find(x => x.id === s.id && x.lap === s.lap);
            return `<tr><td><span class="race-seg-dot ${s.type}"></span>${esc(s.name)} <span class="race-muted">r${s.lap}</span></td><td>${formatRaceTime(s.time)}</td><td class="${gs ? (gs.time - s.time >= 0 ? 'ahead' : 'behind') : ''}">${gs ? formatDelta(gs.time - s.time) : '–'}</td></tr>`;
        }).join('');

        $i.innerHTML = `
            <header class="race-result-header">
                <div class="race-result-kicker">${result.completed ? 'I MÅL' : 'AVBRUTT'}</div>
                <h1>${esc(course.name)} · ${r.laps} ${r.laps === 1 ? 'runde' : 'runder'}</h1>
                <div class="race-result-time">${formatRaceTime(r.totalTime)}</div>
                ${exists(delta) ? `<div class="race-result-delta ${delta >= 0 ? 'ahead' : 'behind'}">${formatDelta(delta)} mot forrige tur (${formatRaceTime(g.totalTime)})</div>`
                                : `<div class="race-result-delta none">${g ? 'Ufullført – ikke sammenlignet' : 'Ingen forrige tur å sammenligne med. Denne blir ghost neste gang.'}</div>`}
            </header>
            <div class="race-result-stats">
                <div><b>${r.avgPower}</b><span>snitt W</span></div>
                <div><b>${r.maxPower}</b><span>maks W</span></div>
                <div><b>${r.avgHeartRate || '–'}</b><span>snitt puls</span></div>
                <div><b>${r.avgCadence}</b><span>snitt rpm</span></div>
                <div><b>${formatDistance(r.distance)}</b><span>distanse</span></div>
                <div><b>${r.ascent} m</b><span>høydemeter</span></div>
                <div><b>${r.intensity} %</b><span>intensitet</span></div>
            </div>
            <div class="race-result-tables">
                <table class="race-table">
                    <thead><tr><th>Rundetider</th><th>Tid</th><th>vs forrige</th></tr></thead>
                    <tbody>${lapRows || '<tr><td colspan="3" class="race-muted">Ingen fullførte runder</td></tr>'}</tbody>
                </table>
                <table class="race-table">
                    <thead><tr><th>Bakker og spurter</th><th>Tid</th><th>vs forrige</th></tr></thead>
                    <tbody>${segRows || '<tr><td colspan="3" class="race-muted">Ingen fullførte segmenter</td></tr>'}</tbody>
                </table>
            </div>
            <div class="race-result-actions">
                ${r.activityId ? `<button type="button" class="hud-big-btn" data-action="fit">LAST NED .FIT</button>` : ''}
                <button type="button" class="hud-big-btn primary" data-action="done">TIL LØYPEVALG</button>
            </div>`;
    }
    onClick(e) {
        const btn = e.target.closest('button[data-action]');
        if(!btn || !this.result) return;
        if(btn.dataset.action === 'fit' && this.result.ride.activityId) {
            models.activity.download(this.result.ride.activityId);
        }
        if(btn.dataset.action === 'done') {
            xf.dispatch('ui:race:dismissResult');
        }
    }
}
customElements.define('race-result', RaceResult);

export { RaceApp, RaceSelect, RaceRide, RaceResult };
