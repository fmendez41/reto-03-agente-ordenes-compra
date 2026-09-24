/** Mesa vista de frente: un documento sobre la tabla, listo para revisar. */
export function Logo() {
  return (
    <svg className="marca-signo" viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#0e6b52" />
      <path d="M16 9h12l5 5v14a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z" fill="#f7f5f1" />
      <path d="M28 9v5h5" fill="#d7efe6" />
      <path d="M18 18.5h10M18 22.5h10M18 26.5h6" stroke="#0e6b52" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 33.5h30" stroke="#f4e2b0" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M14 33.5v7M34 33.5v7" stroke="#f7f5f1" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
