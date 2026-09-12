import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

function Svg({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.3c0-.9 1-1.5 1.8-1L20 11.1c.7.5.7 1.5 0 2L9.8 19.7c-.8.5-1.8-.1-1.8-1V5.3z" />
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="4.5" width="3.6" height="15" rx="1.1" />
    <rect x="13.9" y="4.5" width="3.6" height="15" rx="1.1" />
  </Svg>
);

export const PrevIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="2.4" height="14" rx="1" />
    <path d="M20 6.1c0-.9-1-1.4-1.7-.9l-9 6.9c-.6.4-.6 1.3 0 1.8l9 6.9c.7.5 1.7 0 1.7-.9V6.1z" />
  </Svg>
);

export const NextIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="17.6" y="5" width="2.4" height="14" rx="1" />
    <path d="M4 6.1c0-.9 1-1.4 1.7-.9l9 6.9c.6.4.6 1.3 0 1.8l-9 6.9c-.7.5-1.7 0-1.7-.9V6.1z" />
  </Svg>
);

export const HeartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M12 20.7l-1.3-1.2C5.9 15.2 3 12.6 3 9.4 3 6.7 5.1 4.6 7.8 4.6c1.5 0 3 .7 4.2 1.9 1.2-1.2 2.7-1.9 4.2-1.9 2.7 0 4.8 2.1 4.8 4.8 0 3.2-2.9 5.8-7.7 10.1L12 20.7z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </Svg>
);

export const HeartFilledIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.7l-1.3-1.2C5.9 15.2 3 12.6 3 9.4 3 6.7 5.1 4.6 7.8 4.6c1.5 0 3 .7 4.2 1.9 1.2-1.2 2.7-1.9 4.2-1.9 2.7 0 4.8 2.1 4.8 4.8 0 3.2-2.9 5.8-7.7 10.1L12 20.7z" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.8" cy="10.8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M15.8 15.8L20.6 20.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const VolumeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.2h3.3L12 5.3v13.4L7.3 14.8H4a1 1 0 0 1-1-1v-3.6a1 1 0 0 1 1-1z" />
    <path d="M15.4 9.1a4.1 4.1 0 0 1 0 5.8M18.1 6.6a7.7 7.7 0 0 1 0 10.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </Svg>
);

export const VolumeMuteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.2h3.3L12 5.3v13.4L7.3 14.8H4a1 1 0 0 1-1-1v-3.6a1 1 0 0 1 1-1z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h11M4 12h11M4 17.5h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M17.5 11.4v7.2c0 .7-.8 1.1-1.4.8l-2-1.2c-.5-.3-.5-1 0-1.3l2-1.2c.6-.3 1.4.1 1.4.8z" />
    <path d="M17.5 11.4V6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

export const LoopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 8h9.2a3.8 3.8 0 0 1 0 7.6H8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.4 5.2L6.6 8l2.8 2.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 12.4v3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const SingleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 8h9.2a3.8 3.8 0 0 1 0 7.6H8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.4 5.2L6.6 8l2.8 2.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <text x="12.2" y="15.6" fontSize="9" fontWeight="700" textAnchor="middle" fill="currentColor">
      1
    </text>
  </Svg>
);

export const RandomIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h3.2l3 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M4 17.5h3.2l8.4-11h3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17.2 17.5h-3.2L10.6 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16.4 4.2l2.8 2.3-2.8 2.3M16.4 15.2l2.8 2.3-2.8 2.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const HeadphonesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 14.2v-2a7 7 0 0 1 14 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="3" y="13.4" width="4" height="6.2" rx="1.6" />
    <rect x="17" y="13.4" width="4" height="6.2" rx="1.6" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 7.4V12l3.2 2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.8 7h14.4M9.6 7V5.4c0-.6.5-1 1-1h2.8c.5 0 1 .4 1 1V7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M6.6 7l.9 11.2c.05.9.8 1.6 1.7 1.6h5.6c.9 0 1.65-.7 1.7-1.6L17.4 7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.4" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4.8 19.4c1-3.2 3.8-5 7.2-5s6.2 1.8 7.2 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 5.5L16 12l-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.8v10.4M7.8 10.4L12 14.6l4.2-4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 19.4h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const MusicNoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.6 18.4V7.2l9-1.6v11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="7.2" cy="18.4" r="2.4" />
    <circle cx="16.2" cy="16.6" r="2.4" />
  </Svg>
);

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6L6 18M18 6l1.6-1.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </Svg>
);

export const AutoThemeIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.2" y="4.4" width="17.6" height="12.4" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8.6 20.2h6.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M12 16.8v3.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 6.6v8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M5 12.8l4.2 4.2L19 7.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 2.8v2.4M12 18.8v2.4M4.4 7.2l2.1 1.2M17.5 15.6l2.1 1.2M4.4 16.8l2.1-1.2M17.5 8.4l2.1-1.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </Svg>
);

export const StopIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="10" width="15" height="10" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 10V7.2a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="14.6" r="1.4" />
  </Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
  </Svg>
);

export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M4 4.8l16 14.4M9.9 6.2A9.6 9.6 0 0 1 12 5.8c5.8 0 9.2 6.2 9.2 6.2a17 17 0 0 1-2.7 3.5M6.3 8.3A16.4 16.4 0 0 0 2.8 12S6.2 18.2 12 18.2c1.4 0 2.7-.4 3.8-1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M10 10.2a2.8 2.8 0 0 0 3.9 3.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </Svg>
);

export const SmileIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8.6 14.2a4.4 4.4 0 0 0 6.8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="9.2" cy="10" r="0.9" />
    <circle cx="14.8" cy="10" r="0.9" />
  </Svg>
);
