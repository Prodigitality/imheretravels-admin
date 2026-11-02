import { useEffect, useRef, useState } from "react";

const COUNTDOWN_SECONDS = 5;

/**
 * Counts down on the "payment confirmed" screen, then moves on to the payment
 * plan. Runs once: going Back from Step 3 doesn't send the customer forward again.
 */
export function useStep3Countdown({
  step,
  paymentConfirmed,
  onDone,
}: {
  step: number;
  paymentConfirmed: boolean;
  onDone: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const reachedStep3 = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  if (step === 3) reachedStep3.current = true;
  const active = step === 2 && paymentConfirmed && !reachedStep3.current;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (active && secondsLeft === 0) doneRef.current();
  }, [active, secondsLeft]);

  return active ? secondsLeft : null;
}
