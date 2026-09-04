import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared machinery for the two public registration forms.
 *
 * Both pages had the same three faults, so the fixes live here rather than
 * twice over:
 *
 *   1. Neither page was a <form>. Without one there is no submit event, so
 *      Enter did nothing, and password managers had nothing to recognise as a
 *      sign-up -- which is why offers to save a password never appeared.
 *   2. The autocomplete tokens were invented ("first-name", "major", "skills").
 *      A browser that does not recognise a token falls back to guessing from
 *      the label, and often declines to fill at all.
 *   3. Worst of it: the fields were controlled by React state, and Chrome fills
 *      a saved profile straight into the DOM. When that happens before React
 *      attaches its listeners -- which is the normal case for a saved password
 *      on page load -- no change event is ever dispatched. State stayed empty,
 *      so validation refused to submit and pointed at fields the person could
 *      plainly see they had filled in.
 */

/**
 * A controlled form that also believes the DOM.
 *
 * `values` still drives the inputs, so everything downstream stays ordinary
 * React. The difference is that the DOM gets the last word at the three moments
 * a browser fills fields behind our back: on mount, when the autofill
 * animation from index.css fires, and immediately before submitting.
 *
 * Only string entries are reconciled. Checkboxes and multi-selects are ours
 * alone -- no browser autofills them, and reading them back would fight the
 * component that owns them.
 */
export function useSyncedForm(initialValues) {
  const formRef = useRef(null);
  const [values, setValues] = useState(initialValues);

  // `collect` is called from listeners and timeouts that outlive any one
  // render, so it reads through a ref rather than closing over `values`.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const collect = useCallback(() => {
    const form = formRef.current;
    const current = valuesRef.current;
    if (!form) return current;

    const next = { ...current };
    let changed = false;

    for (const name of Object.keys(current)) {
      if (typeof current[name] !== "string") continue;
      const field = form.elements.namedItem(name);
      if (!field || typeof field.value !== "string") continue;
      if (field.value !== current[name]) {
        next[name] = field.value;
        changed = true;
      }
    }

    if (!changed) return current;
    // keep the ref in step so a second call in the same tick sees the update
    valuesRef.current = next;
    setValues(next);
    return next;
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return undefined;

    // Chrome fills saved credentials somewhere between first paint and a
    // second or so later, with no event we can hook. These three sweeps cover
    // the window; each is a handful of string comparisons.
    const frame = requestAnimationFrame(collect);
    const timers = [setTimeout(collect, 300), setTimeout(collect, 1200)];

    const onAnimationStart = (event) => {
      if (event.animationName === "onAutofill") collect();
    };

    form.addEventListener("animationstart", onAnimationStart, true);
    form.addEventListener("change", collect, true);
    // The deadline that matters: a controlled input whose value React has not
    // seen gets overwritten on the next render, so a filled field would empty
    // itself the moment anything else on the page changed. focusin runs before
    // the click that causes that render, so the value is banked first.
    form.addEventListener("focusin", collect, true);

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      form.removeEventListener("animationstart", onAnimationStart, true);
      form.removeEventListener("change", collect, true);
      form.removeEventListener("focusin", collect, true);
    };
  }, [collect]);

  const setValue = useCallback((name, value) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      valuesRef.current = next;
      return next;
    });
  }, []);

  const handleChange = useCallback(
    (event) => {
      const { name, type, value, checked } = event.target;
      setValue(name, type === "checkbox" ? checked : value);
    },
    [setValue]
  );

  return { formRef, values, setValue, setValues, handleChange, collect };
}

/**
 * Puts the caret where the problem is. A message at the bottom of a form this
 * long is a message nobody scrolls back up to read.
 */
export function focusField(formRef, name) {
  const form = formRef?.current;
  if (!form) return;

  // A MUI Select keeps its value in a hidden input, which cannot take focus.
  // The thing a person actually operates is the element carrying the id, so
  // that is the fallback.
  let element = null;
  try {
    element =
      form.querySelector(`[name="${name}"]:not([type="hidden"])`) ||
      form.querySelector(`#${name}`);
  } catch (error) {
    element = null;
  }

  if (typeof element?.focus !== "function") return;
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: "center", behavior: "smooth" });
}

// \w{2,3} rejected every TLD longer than three characters, so nobody with a
// .tech / .info / .online address could register.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (value) => EMAIL_PATTERN.test(String(value ?? "").trim());

export const MIN_PASSWORD = 6;

export const isFilled = (value) => String(value ?? "").trim().length > 0;

/**
 * The old forms ran `replace(/[^a-z]/gi, "")` on every keystroke, which meant
 * an autofilled "Mary-Jane O'Brien" landed as "MaryJaneOBrien" and anyone with
 * an accent in their name lost it a letter at a time as they typed. Names are
 * only tidied on the way to the database, and only of whitespace.
 */
export const cleanName = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

export function joinList(items) {
  if (items.length < 2) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

/**
 * Naming what is missing only helps while the list is short enough to hold in
 * your head. Pressing submit on an untouched form otherwise produces a
 * paragraph that repeats all eight inline messages back at you. Past three,
 * the count plus the field focus has just landed on says more.
 */
export function outstandingMessage(nouns) {
  if (!nouns.length) return "";
  if (nouns.length <= 3) return `Still needed: ${joinList(nouns)}.`;
  return `${nouns.length} answers still needed, starting with ${nouns[0]}.`;
}
