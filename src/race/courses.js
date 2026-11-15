//
// The three built-in loops. Everything the app shows or sends to the trainer
// about a course is derived from this data by geometry.js.
//
// points:    closed loop control points in a 1000 x 620 drawing space
// elevation: altitude knots by distance along the loop (meters)
// segments:  named climbs and sprints by distance along the loop (meters)
// scenery:   decorative shapes drawn under the road
//

const fjordrunden = {
    id: 'fjordrunden',
    name: 'Fjordrunden',
    tagline: 'Lett og rask',
    description: 'Flat og flytende runde langs fjorden. En liten kneik over neset, ellers full fart.',
    lengthMeters: 4200,
    theme: {
        sky: ['#1c2a3a', '#3b5068'],
        ground: '#2f4a3a',
        groundDark: '#223829',
        water: '#2b5f7a',
        rock: '#6b7280',
    },
    points: [
        {x: 150, y: 430}, {x: 115, y: 310}, {x: 190, y: 190}, {x: 340, y: 140},
        {x: 480, y: 185}, {x: 610, y: 130}, {x: 770, y: 145}, {x: 885, y: 250},
        {x: 870, y: 385}, {x: 760, y: 470}, {x: 610, y: 445}, {x: 460, y: 505},
        {x: 300, y: 500},
    ],
    elevation: [
        {at: 0,    alt: 12},
        {at: 800,  alt: 12},
        {at: 1250, alt: 35},
        {at: 1800, alt: 12},
        {at: 2900, alt: 12},
        {at: 3200, alt: 26},
        {at: 3650, alt: 12},
    ],
    segments: [
        {type: 'climb',  name: 'Neset',        start: 800,  end: 1250},
        {type: 'sprint', name: 'Fjordspurten', start: 2000, end: 2500},
        {type: 'climb',  name: 'Kaia',         start: 2900, end: 3200},
    ],
    scenery: [
        {type: 'water', points: [
            {x: 330, y: 250}, {x: 480, y: 270}, {x: 640, y: 230}, {x: 760, y: 260},
            {x: 780, y: 360}, {x: 650, y: 380}, {x: 500, y: 420}, {x: 320, y: 400},
            {x: 260, y: 320},
        ]},
        {type: 'forest', x: 230, y: 240, r: 45},
        {type: 'forest', x: 600, y: 520, r: 60},
        {type: 'forest', x: 880, y: 470, r: 50},
        {type: 'forest', x: 80,  y: 520, r: 55},
        {type: 'peak',   x: 940, y: 110, size: 70},
        {type: 'peak',   x: 60,  y: 130, size: 55},
    ],
};

const skogsringen = {
    id: 'skogsringen',
    name: 'Skogsringen',
    tagline: 'Kupert',
    description: 'To skikkelige bakker gjennom granskogen, og en lang spurtstrekning langs vannet på slutten.',
    lengthMeters: 4800,
    theme: {
        sky: ['#1a2420', '#34503e'],
        ground: '#2b4631',
        groundDark: '#1d3323',
        water: '#2a5a6b',
        rock: '#5f6b63',
    },
    points: [
        {x: 220, y: 530}, {x: 120, y: 430}, {x: 135, y: 300}, {x: 235, y: 225},
        {x: 300, y: 125}, {x: 430, y: 95},  {x: 530, y: 165}, {x: 620, y: 105},
        {x: 740, y: 85},  {x: 860, y: 160}, {x: 910, y: 290}, {x: 865, y: 410},
        {x: 760, y: 480}, {x: 640, y: 430}, {x: 520, y: 485}, {x: 400, y: 550},
        {x: 300, y: 565},
    ],
    elevation: [
        {at: 0,    alt: 80},
        {at: 600,  alt: 80},
        {at: 1000, alt: 105},
        {at: 1500, alt: 140},
        {at: 2200, alt: 95},
        {at: 2500, alt: 110},
        {at: 2800, alt: 95},
        {at: 2900, alt: 95},
        {at: 3400, alt: 130},
        {at: 3900, alt: 85},
        {at: 4600, alt: 80},
    ],
    segments: [
        {type: 'climb',  name: 'Granlia',     start: 600,  end: 1500},
        {type: 'climb',  name: 'Steinbrotet', start: 2900, end: 3400},
        {type: 'sprint', name: 'Langspurten', start: 3900, end: 4600},
    ],
    scenery: [
        {type: 'water', points: [
            {x: 380, y: 300}, {x: 520, y: 280}, {x: 680, y: 260}, {x: 760, y: 320},
            {x: 700, y: 380}, {x: 560, y: 400}, {x: 420, y: 420}, {x: 330, y: 370},
        ]},
        {type: 'forest', x: 200, y: 150, r: 55},
        {type: 'forest', x: 430, y: 200, r: 40},
        {type: 'forest', x: 820, y: 300, r: 45},
        {type: 'forest', x: 650, y: 540, r: 65},
        {type: 'forest', x: 120, y: 560, r: 50},
        {type: 'forest', x: 940, y: 520, r: 55},
        {type: 'peak',   x: 90,  y: 100, size: 60},
        {type: 'peak',   x: 930, y: 80,  size: 75},
    ],
};

const fjellpasset = {
    id: 'fjellpasset',
    name: 'Fjellpasset',
    tagline: 'Lange bakker',
    description: 'Lang stigning med hårnålssvinger opp til passet, svingete nedkjøring og en siste kneik før mål.',
    lengthMeters: 6500,
    theme: {
        sky: ['#15181f', '#3a3f4f'],
        ground: '#3a4a40',
        groundDark: '#27332c',
        water: '#2a4f66',
        rock: '#7a7f86',
    },
    points: [
        {x: 500, y: 565}, {x: 350, y: 545}, {x: 215, y: 505},
        {x: 135, y: 440}, {x: 265, y: 398}, {x: 125, y: 345}, {x: 255, y: 300},
        {x: 130, y: 245}, {x: 270, y: 200}, {x: 400, y: 140}, {x: 560, y: 110},
        {x: 710, y: 150}, {x: 850, y: 205}, {x: 760, y: 265}, {x: 885, y: 325},
        {x: 775, y: 385}, {x: 880, y: 450}, {x: 770, y: 520}, {x: 640, y: 560},
    ],
    elevation: [
        {at: 0,    alt: 300},
        {at: 600,  alt: 300},
        {at: 1000, alt: 328},
        {at: 1600, alt: 380},
        {at: 2200, alt: 438},
        {at: 2600, alt: 460},
        {at: 3300, alt: 455},
        {at: 4900, alt: 300},
        {at: 5250, alt: 300},
        {at: 5650, alt: 335},
        {at: 6100, alt: 300},
    ],
    segments: [
        {type: 'climb',  name: 'Passet',        start: 600,  end: 2600},
        {type: 'sprint', name: 'Toppspurten',   start: 2700, end: 3250},
        {type: 'climb',  name: 'Siste kneika',  start: 5250, end: 5650},
        {type: 'sprint', name: 'Målspurten',    start: 6100, end: 6450},
    ],
    scenery: [
        {type: 'water', points: [
            {x: 420, y: 320}, {x: 540, y: 300}, {x: 660, y: 330}, {x: 640, y: 420},
            {x: 520, y: 450}, {x: 400, y: 410},
        ]},
        {type: 'peak', x: 470, y: 60,  size: 90},
        {type: 'peak', x: 620, y: 45,  size: 70},
        {type: 'peak', x: 950, y: 120, size: 80},
        {type: 'peak', x: 50,  y: 110, size: 70},
        {type: 'forest', x: 330, y: 470, r: 50},
        {type: 'forest', x: 700, y: 480, r: 45},
        {type: 'forest', x: 930, y: 560, r: 60},
        {type: 'forest', x: 80,  y: 580, r: 50},
    ],
};

const courseDefinitions = [fjordrunden, skogsringen, fjellpasset];

export { courseDefinitions, fjordrunden, skogsringen, fjellpasset };
