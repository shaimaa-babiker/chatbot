import * as React from "react"

function Input({ className, type, style, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      style={{
        /* Base styles that work without Tailwind */
        display: 'block',
        width: '100%',
        minWidth: 0,
        height: 'auto',
        padding: '10px 14px',
        fontSize: 15,
        lineHeight: 1.5,
        color: 'var(--assistly-ink, #101820)',
        background: 'transparent',
        border: '1px solid var(--assistly-hairline-strong, rgba(16,24,32,0.22))',
        borderRadius: 8,
        outline: 'none',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        transition: 'border-color 180ms ease, box-shadow 180ms ease',
        /* Caller overrides take precedence */
        ...style,
      }}
      {...props}
    />
  )
}

export { Input }
