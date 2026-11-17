/*
  Pages that have moved, answered with a permanent redirect (`redirects()` in
  next.config.ts). Next passes a request's query string on to the destination,
  so `?run=<id>` carries over. Written as literals, not read from a process,
  because the config loads before the `@/` alias exists and an address that
  was published must not change when a process's does.
*/
export const MOVED_ROUTES = [
  {
    source: '/examples/brunch-orders',
    destination: '/processes/brunch-orders',
    permanent: true,
  },
  {
    source: '/examples/brunch-orders-direct',
    destination: '/processes/brunch-orders-direct',
    permanent: true,
  },
] as const;
