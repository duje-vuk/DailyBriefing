const landmarks = [
  { name: 'House', draw: () => `
    <rect x="-14" y="-22" width="28" height="22" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <polygon points="-18,-22 0,-36 18,-22" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <rect x="-4" y="-12" width="8" height="12" stroke="#1a1a1a" stroke-width="0.8" fill="var(--bg)"/>
  `},
  { name: 'Mansion', draw: () => `
    <rect x="-22" y="-26" width="44" height="26" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <polygon points="-26,-26 0,-40 26,-26" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <line x1="-14" y1="0" x2="-14" y2="-22" stroke="#1a1a1a" stroke-width="1"/>
    <line x1="-8" y1="0" x2="-8" y2="-22" stroke="#1a1a1a" stroke-width="1"/>
    <line x1="8" y1="0" x2="8" y2="-22" stroke="#1a1a1a" stroke-width="1"/>
    <line x1="14" y1="0" x2="14" y2="-22" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="-4" y="-14" width="8" height="14" stroke="#1a1a1a" stroke-width="0.8" fill="var(--bg)"/>
  `},
  { name: 'Skyscraper', draw: () => `
    <rect x="-10" y="-55" width="20" height="55" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <rect x="-6" y="-60" width="12" height="8" stroke="#1a1a1a" stroke-width="1" fill="var(--bg)"/>
    <line x1="0" y1="-60" x2="0" y2="-65" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="-6" y="-50" width="4" height="3" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="2" y="-50" width="4" height="3" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="-6" y="-40" width="4" height="3" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="2" y="-40" width="4" height="3" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="-6" y="-30" width="4" height="3" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="2" y="-30" width="4" height="3" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="-6" y="-20" width="4" height="3" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="2" y="-20" width="4" height="3" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
  `},
  { name: 'Tree', draw: () => `
    <line x1="0" y1="0" x2="0" y2="-20" stroke="#1a1a1a" stroke-width="2"/>
    <circle cx="0" cy="-30" r="14" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
  `},
  { name: 'Dog', draw: () => `
    <ellipse cx="0" cy="-10" rx="10" ry="7" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <circle cx="12" cy="-16" r="5" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <circle cx="14" cy="-17" r="1" fill="#1a1a1a"/>
    <line x1="-8" y1="-3" x2="-8" y2="0" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="-3" y1="-3" x2="-3" y2="0" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="4" y1="-3" x2="4" y2="0" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="8" y1="-3" x2="8" y2="0" stroke="#1a1a1a" stroke-width="1.5"/>
    <path d="M-10,-9 Q-16,-6 -12,-2" stroke="#1a1a1a" stroke-width="1" fill="none"/>
  `},
  { name: 'Mailbox', draw: () => `
    <line x1="0" y1="0" x2="0" y2="-22" stroke="#1a1a1a" stroke-width="1.5"/>
    <rect x="-7" y="-32" width="14" height="10" rx="2" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <line x1="-4" y1="-27" x2="4" y2="-27" stroke="#1a1a1a" stroke-width="0.8"/>
    <line x1="7" y1="-29" x2="12" y2="-29" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
  `},
  { name: 'Hydrant', draw: () => `
    <rect x="-5" y="-18" width="10" height="18" rx="2" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <ellipse cx="0" cy="-18" rx="6" ry="3" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <line x1="-8" y1="-10" x2="8" y2="-10" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="-7" y="-3" width="14" height="3" stroke="#1a1a1a" stroke-width="1" fill="var(--bg)"/>
  `},
  { name: 'Church', draw: () => `
    <rect x="-16" y="-28" width="32" height="28" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <polygon points="-16,-28 0,-44 16,-28" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <rect x="-3" y="-52" width="6" height="12" stroke="#1a1a1a" stroke-width="1" fill="var(--bg)"/>
    <line x1="0" y1="-56" x2="0" y2="-52" stroke="#1a1a1a" stroke-width="1.2"/>
    <line x1="-3" y1="-54" x2="3" y2="-54" stroke="#1a1a1a" stroke-width="1.2"/>
    <rect x="-4" y="-14" width="8" height="14" stroke="#1a1a1a" stroke-width="0.8" fill="var(--bg)"/>
    <circle cx="0" cy="-32" r="3" stroke="#1a1a1a" stroke-width="0.8" fill="none"/>
  `},
  { name: 'Apartment', draw: () => `
    <rect x="-14" y="-42" width="28" height="42" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
    <rect x="-10" y="-38" width="6" height="5" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="4" y="-38" width="6" height="5" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="-10" y="-28" width="6" height="5" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="4" y="-28" width="6" height="5" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="-10" y="-18" width="6" height="5" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="4" y="-18" width="6" height="5" stroke="#1a1a1a" stroke-width="0.6" fill="none"/>
    <rect x="-3" y="-10" width="6" height="10" stroke="#1a1a1a" stroke-width="0.8" fill="var(--bg)"/>
  `},
  { name: 'Bench', draw: () => `
    <line x1="-14" y1="-8" x2="14" y2="-8" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="-14" y1="-8" x2="-14" y2="-16" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="14" y1="-8" x2="14" y2="-16" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="-14" y1="-16" x2="14" y2="-16" stroke="#1a1a1a" stroke-width="1.2"/>
    <line x1="-10" y1="-8" x2="-12" y2="0" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="10" y1="-8" x2="12" y2="0" stroke="#1a1a1a" stroke-width="1.5"/>
  `},
];

const bikeSvg = `
  <g class="wheel-back">
    <circle cx="12" cy="44" r="9" stroke="#1a1a1a" stroke-width="2" fill="none"/>
    <line x1="12" y1="35" x2="12" y2="53" stroke="#1a1a1a" stroke-width="0.8"/>
    <line x1="3" y1="44" x2="21" y2="44" stroke="#1a1a1a" stroke-width="0.8"/>
  </g>
  <g class="wheel-front">
    <circle cx="44" cy="44" r="9" stroke="#1a1a1a" stroke-width="2" fill="none"/>
    <line x1="44" y1="35" x2="44" y2="53" stroke="#1a1a1a" stroke-width="0.8"/>
    <line x1="35" y1="44" x2="53" y2="44" stroke="#1a1a1a" stroke-width="0.8"/>
  </g>
  <line x1="12" y1="44" x2="28" y2="30" stroke="#1a1a1a" stroke-width="2"/>
  <line x1="28" y1="30" x2="44" y2="44" stroke="#1a1a1a" stroke-width="2"/>
  <line x1="28" y1="30" x2="38" y2="30" stroke="#1a1a1a" stroke-width="2"/>
  <line x1="12" y1="44" x2="24" y2="30" stroke="#1a1a1a" stroke-width="1.5"/>
  <line x1="38" y1="26" x2="38" y2="33" stroke="#1a1a1a" stroke-width="2"/>
  <line x1="35" y1="26" x2="41" y2="26" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
  <line x1="24" y1="28" x2="30" y2="28" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
  <line x1="27" y1="28" x2="32" y2="16" stroke="#1a1a1a" stroke-width="2"/>
  <line x1="32" y1="18" x2="38" y2="26" stroke="#1a1a1a" stroke-width="1.5"/>
  <circle cx="33" cy="12" r="4" stroke="#1a1a1a" stroke-width="1.5" fill="var(--bg)"/>
  <path d="M29 11 Q33 7 37 11" stroke="#1a1a1a" stroke-width="1.5" fill="#1a1a1a"/>
  <rect x="18" y="18" width="8" height="6" rx="1" stroke="#1a1a1a" stroke-width="1.2" fill="var(--bg)"/>
  <line x1="20" y1="20" x2="24" y2="20" stroke="#1a1a1a" stroke-width="0.8"/>
  <line x1="20" y1="22" x2="24" y2="22" stroke="#1a1a1a" stroke-width="0.8"/>
  <line x1="22" y1="18" x2="30" y2="20" stroke="#1a1a1a" stroke-width="1"/>
`;
