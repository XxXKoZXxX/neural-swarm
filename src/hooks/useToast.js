import { createContext, useContext } from "react";

/** Toast API: { info, success, warn, error }. Provided by <ToastProvider>. */
const noop = () => {};
export const ToastContext = createContext({ info: noop, success: noop, warn: noop, error: noop });

export const useToast = () => useContext(ToastContext);
export default useToast;
