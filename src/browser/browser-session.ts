export type BrowserLike = {
  close: () => Promise<void>;
};

export type ElementHandleLike = {
  click: () => Promise<void>;
};

export type PageLike = {
  setViewport: (viewport: { width: number; height: number }) => Promise<void>;
  setCookie: (...cookies: unknown[]) => Promise<void>;
  cookies: () => Promise<unknown[]>;
  goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
  waitForSelector: (selector: string, options: { timeout: number }) => Promise<unknown>;
  evaluate: {
    <TArg, TResult>(pageFunction: (arg: TArg) => TResult, arg: TArg): Promise<Awaited<TResult>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (expression: string): Promise<any>;
  };
  $: (selector: string) => Promise<ElementHandleLike | null>;
  url: () => string;
  waitForNavigation: (options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
};

export type BrowserSession = {
  browser: BrowserLike;
  page: PageLike;
};
