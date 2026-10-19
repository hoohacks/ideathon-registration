// DOM matchers such as toBeInTheDocument and toHaveTextContent, registered on
// Vitest's expect.
import '@testing-library/jest-dom/vitest';

// Testing Library only knows how to advance Jest's fake timers: under fake
// timers its waitFor ends on a setTimeout(0) that it moves along by calling
// jest.advanceTimersByTime, and without a `jest` to call, a test that fakes
// timers and then awaits a findBy hangs until it times out. This is the one
// function it needs, pointed at Vitest's clock.
globalThis.jest = { advanceTimersByTime: (ms) => vi.advanceTimersByTime(ms) };

// The public forms are gated by a build-time flag that defaults to CLOSED, so a
// production build that forgets it keeps strangers out. Tests are development,
// not production: they render the forms, so the doors are open here for the
// same reason `npm start` opens them.
//
// `registrationWindow.test.js` overrides this deliberately, with resetModules,
// to prove which way the flag fails.
vi.stubEnv("VITE_REGISTRATION_OPEN", "true");
