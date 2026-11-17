// Az sayıda satır içi SVG (ADR-015): tek çizgi stili, 16 px, metnin yanında dekoratif.
const PATHS = {
  file: "M4 1.5h5.5L13 5v9.5H4z M9.5 1.5V5H13",
  folder: "M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z",
  build: "M2 13.5 8.5 7 M9 3l4 4-2 2-4-4z M11 1.5l3.5 3.5",
  play: "M4.5 2.5v11l9-5.5z",
  stop: "M3.5 3.5h9v9h-9z",
  close: "M4 4l8 8 M12 4l-8 8",
  plus: "M8 3v10 M3 8h10",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
