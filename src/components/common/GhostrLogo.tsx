interface GhostrLogoProps {
  className?: string
}

export function GhostrLogo({ className }: GhostrLogoProps) {
  return (
    <svg
      viewBox="0 0 90 90"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M81.83,40.91v-24.54h-8.2v-8.2h-8.17V0H24.54v8.17h-8.17v8.2h-8.2v24.54H0v49.09h8.17v-8.17h8.2v-8.2h8.17v16.37h8.18v-8.17h16.37v8.17h8.19v-8.17h8.18v-8.2h8.17v8.2h8.2v8.17h8.17v-49.09h-8.17Z"
        fill="#9333ea"
      />
      <path
        d="M73.63,32.72h-8.17v16.37h8.17v8.19h-16.35v-8.19h-8.19v-16.37h8.19v-8.18h16.35v8.18ZM16.37,32.72h8.17v-8.18h16.37v8.18h-8.19v16.37h8.19v8.19h-16.37v-8.19h-8.17v-16.37Z"
        fill="#fff"
      />
    </svg>
  )
}
