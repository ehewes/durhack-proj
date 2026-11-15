import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "kip.map.showSimulated";

/**
 * Whether the map shows simulated people. On until turned off, then remembered on this device
 * (AsyncStorage on iOS, localStorage on the web), so a demo phone or dashboard stays as set.
 */
export function useShowSimulated(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(true);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        if (live && saved !== null) setShow(saved === "true");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const change = (next: boolean) => {
    setShow(next);
    void AsyncStorage.setItem(KEY, String(next)).catch(() => undefined);
  };
  return [show, change];
}
