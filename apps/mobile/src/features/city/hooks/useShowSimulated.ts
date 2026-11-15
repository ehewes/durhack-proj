import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

const KEY = "kip.map.showSimulated";

/**
 * Whether the map shows simulated people. On until turned off, then remembered on this device
 * (AsyncStorage on iOS, localStorage on the web), so a demo phone or dashboard stays as set.
 * A saved value that arrives after the user has already flipped the switch is ignored, so the
 * screen and storage never disagree.
 */
export function useShowSimulated(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(true);
  const touched = useRef(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        if (live && !touched.current && saved !== null) setShow(saved === "true");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const change = (next: boolean) => {
    touched.current = true;
    setShow(next);
    void AsyncStorage.setItem(KEY, String(next)).catch(() => undefined);
  };
  return [show, change];
}
