//
// Intensity and trainer grade
//
// Intensity scales only what the trainer is asked to simulate. The virtual
// speed model always uses the real course grade, so rides at different
// intensities on the same course remain comparable (a ghost from a 100 %
// ride is a fair opponent for a 70 % ride, it is just harder to beat).
//
//   grade sent to trainer = clamp(courseGrade * intensity / 100, min, max)
//
// 100 % is the course as drawn. 50 % halves every climb, 150 % makes them
// half as steep again. The clamp exists because the Elite Zumo (and most
// wheel-on / mid-range direct drive trainers) simulate at most ~12 %, and
// cannot drive the flywheel on descents, so anything below a few percent
// negative is effectively the same as flat.
//

const INTENSITY = Object.freeze({
    min: 50,
    max: 150,
    step: 5,
    default: 100,
});

const TRAINER_LIMITS = Object.freeze({
    maxGrade: 12,
    minGrade: -8,
});

function clamp(min, max, x) {
    return Math.min(max, Math.max(min, x));
}

function clampIntensity(x) {
    const v = Number.isFinite(x) ? x : INTENSITY.default;
    const stepped = Math.round(v / INTENSITY.step) * INTENSITY.step;
    return clamp(INTENSITY.min, INTENSITY.max, stepped);
}

// Float, Int, {maxGrade, minGrade} -> {grade: Float, clipped: Bool}
function trainerGrade(courseGrade, intensity, limits = TRAINER_LIMITS) {
    const scaled = courseGrade * (clampIntensity(intensity) / 100);
    const grade = clamp(limits.minGrade, limits.maxGrade, scaled);
    return {
        grade: Math.round(grade * 10) / 10,
        clipped: grade !== scaled,
    };
}

// Move `current` toward `target` by at most maxRate %/s so the trainer never
// jumps from flat to steep in one command. dt in seconds.
function smoothGrade(current, target, dt, maxRate = 2.0) {
    if(!Number.isFinite(current)) return target;
    const maxDelta = maxRate * Math.max(0, dt);
    const delta = target - current;
    if(Math.abs(delta) <= maxDelta) return target;
    return current + Math.sign(delta) * maxDelta;
}

export {
    INTENSITY,
    TRAINER_LIMITS,
    clampIntensity,
    trainerGrade,
    smoothGrade,
};
