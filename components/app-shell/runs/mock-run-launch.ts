/*
  Asking a process page for a fresh mock run. From elsewhere the request rides
  in the address (?run=new-mock), so nothing is queued that could fire on a
  later visit; on the page itself an event reaches the sheet already mounted.
*/
export const NEW_MOCK_RUN = 'new-mock';
const LAUNCH_EVENT = 'safepoint:mock-run-launch';

export function mockRunHref(href: string) {
  return `${href}?run=${NEW_MOCK_RUN}`;
}

export function requestMockRunHere(processId: string) {
  window.dispatchEvent(new CustomEvent(LAUNCH_EVENT, { detail: processId }));
}

export function subscribeMockRunLaunch(processId: string, start: () => void) {
  const launch = (event: Event) => {
    if ((event as CustomEvent<string>).detail === processId) start();
  };
  window.addEventListener(LAUNCH_EVENT, launch);
  return () => window.removeEventListener(LAUNCH_EVENT, launch);
}
