import { useCallback, useEffect, useRef, useState } from "react";
import { readSession, readStored, writeSession, writeStored } from "../lib/store.js";

/**
 * useState that survives reloads. `scope: "session"` keeps the value out of
 * localStorage — used for API keys unless the user opts into remembering them.
 */
export default function usePersistedState(key, initialValue, { scope = "local" } = {}) {
  const read = scope === "session" ? readSession : readStored;
  const write = scope === "session" ? writeSession : writeStored;
  const [value, setValue] = useState(() => read(key, initialValue));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    write(key, value);
  }, [key, value, write]);

  const reset = useCallback(() => setValue(initialValue), [initialValue]);
  return [value, setValue, reset];
}
