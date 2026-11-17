/** Backend'in yazdırdığı URL'deki `#token=` değerini alır ve adres çubuğundan siler (ADR-008, ADR-016). */
export function takeTokenFromLocation(location: Location, history: History): string | null {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const token = params.get("token");
  if (!token) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return token;
}
