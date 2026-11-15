//
// Demo rider: fakes a trainer when the page is opened with ?demo=1 so the
// race UI can be tested without Bluetooth. Power is a noisy rider who pushes
// harder on climbs and sprints, so laps and ghost deltas look realistic.
//

import { xf } from '../functions.js';

function DemoRider() {
    let grade = 0;
    let inSegment = null;
    let basePower = 190;
    let distance = 0;
    let warp = 0;

    function params() {
        try {
            return new URL(window.location.href).searchParams;
        } catch(e) {
            return new URLSearchParams();
        }
    }

    function enabled() {
        return params().get('demo') === '1';
    }

    function start() {
        if(!enabled()) return;
        // &warp=N adds N extra m/s on top of the physics, to run through laps quickly
        warp = parseFloat(params().get('warp')) || 0;
        console.warn(`|-- DEMO RIDER ON (?demo=1${warp ? `&warp=${warp}` : ''}) --|`);

        xf.sub('db:virtualGrade', (g) => { grade = g ?? 0; });
        xf.sub('db:race', (state) => { inSegment = state?.activeSegment?.type ?? null; });
        xf.sub('db:distance', (d) => { distance = d; });

        xf.dispatch('ble:controllable:connected');
        xf.dispatch('ble:heartRateMonitor:connected');

        // Background tabs throttle setInterval heavily; a worker does not.
        // (Real trainers push BLE notifications regardless of tab state.)
        const worker = new Worker(new URL('../timer.js', import.meta.url), {type: 'module'});
        worker.addEventListener('message', () => { tick(); setTimeout(tick, 500); });
        worker.postMessage('start');
    }

    function tick() {
        let target = basePower;
        if(grade > 2) target += 60 + grade * 8;
        if(inSegment === 'sprint') target += 120;
        if(grade < -2) target = 60;

        const power = Math.max(0, Math.round(target + (Math.random() - 0.5) * 30));
        const cadence = Math.round(84 + (Math.random() - 0.5) * 8 - Math.max(0, grade) * 1.5);
        const heartRate = Math.round(120 + target / 5 + (Math.random() - 0.5) * 4);

        xf.dispatch('power', power);
        xf.dispatch('cadence', cadence);
        xf.dispatch('heartRate', heartRate);

        if(warp > 0) {
            xf.dispatch('distance', distance + warp * 0.5);
        }
    }

    xf.sub('app:ready', start);

    return Object.freeze({ enabled });
}

const demoRider = DemoRider();

export { demoRider };
