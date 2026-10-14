// A handful of 16px line icons, drawn for this project.
const PATHS = {
  sound: 'M3 6h2.5L9 3v10L5.5 10H3zM11.5 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6 6 0 0 1 0 9',
  mute: 'M3 6h2.5L9 3v10L5.5 10H3zM11.5 6l3.5 4M15 6l-3.5 4',
  help: 'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M8 11.3v.2',
  download: 'M8 2v8M4.5 6.8 8 10.3l3.5-3.5M2.5 13.5h11',
  close: 'M4 4l8 8M12 4l-8 8',
  lock: 'M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2',
}

export function Icon({ name, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
