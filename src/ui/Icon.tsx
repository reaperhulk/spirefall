// One stroked, engraved icon family for the HUD and combat controls.
const paths = {
  calendar: 'M4 5h16v16H4z M4 9h16 M8 3v4 M16 3v4 M8 13h2 M14 13h2 M8 17h2',
  stats: 'M4 20V4 M4 20h17 M8 17v-6 M13 17V7 M18 17v-9',
  book: 'M12 5v16 M12 5C8 2 4 3 3 4v15c4-1 7 0 9 2 M12 5c4-3 8-2 9-1v15c-4-1-7 0-9 2',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  sound: 'M3 9h4l5-5v16l-5-5H3z M16 8q6 4 0 8 M19 4q9 8 0 16',
  muted: 'M3 9h4l5-5v16l-5-5H3z M16 9l6 6 M22 9l-6 6',
  pause: 'M8 5v14 M16 5v14',
  advance: 'M3 5l8 7-8 7z M13 5l8 7-8 7z',
  beam: 'M3 12h12 M15 8l6 4-6 4 M6 5l2 3 M6 19l2-3 M13 3v3 M13 21v-3',
  lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
  air: 'M3 14l8-4V4l1-2 1 2v6l8 4v2l-8-2v5l3 2H8l3-2v-5l-8 2z',
}
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="game-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
