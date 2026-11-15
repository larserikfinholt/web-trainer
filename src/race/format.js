//
// Formatting helpers for the race UI (Norwegian conventions).
//

function pad2(n) {
    return String(n).padStart(2, '0');
}

// seconds -> "m:ss" or "h:mm:ss"
function formatRaceTime(seconds) {
    const s = Math.max(0, Math.round(seconds ?? 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if(h > 0) return `${h}:${pad2(m)}:${pad2(sec)}`;
    return `${m}:${pad2(sec)}`;
}

// seconds ahead (+) / behind (-) -> "+8 s" / "-12 s" / "+1:05"
function formatDelta(seconds) {
    if(seconds == null || !Number.isFinite(seconds)) return '–';
    const sign = seconds >= 0 ? '+' : '−';
    const abs = Math.abs(Math.round(seconds));
    if(abs < 60) return `${sign}${abs} s`;
    return `${sign}${formatRaceTime(abs)}`;
}

// meters -> "4,8 km" / "180 m"
function formatDistance(meters) {
    if(meters >= 1000) {
        return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
    }
    return `${Math.round(meters)} m`;
}

// 4.53 -> "+4,5 %"
function formatGrade(grade) {
    const sign = grade > 0 ? '+' : '';
    return `${sign}${grade.toFixed(1).replace('.', ',')} %`;
}

export {
    formatRaceTime,
    formatDelta,
    formatDistance,
    formatGrade,
};
