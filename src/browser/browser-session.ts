export type BrowserLike = {
  close: () => Promise<void>;
};

export type PageLike = {
  setViewport: (viewport: { width: number; height: number }) => Promise<void>;
  setCookie: (...cookies: unknown[]) => Promise<void>;
  cookies: () => Promise<unknown[]>;
  goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
  waitForSelector: (selector: string, options: { timeout: number }) => Promise<unknown>;
  evaluate: <TArg, TResult>(pageFunction: (arg: TArg) => TResult, arg: TArg) => Promise<Awaited<TResult>>;
};

export type BrowserSession = {
  browser: BrowserLike;
  page: PageLike;
};
