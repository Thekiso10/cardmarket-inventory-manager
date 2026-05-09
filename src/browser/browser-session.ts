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
  waitForSelector: (selector: string, options: { timeout: number, visible?: boolean }) => Promise<unknown>;
  evaluate: {
    <TArg, TResult>(pageFunction: (arg: TArg) => TResult, arg: TArg): Promise<Awaited<TResult>>;
    <TResult>(pageFunction: () => TResult): Promise<Awaited<TResult>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (expression: string): Promise<any>;
  };
  $: (selector: string) => Promise<ElementHandleLike | null>;
  $$: (selector: string) => Promise<ElementHandleLike[]>;
  url: () => string;
  waitForNavigation: (options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
  type: (selector: string, text: string) => Promise<void>;
  click: (selector: string) => Promise<void>;
  select: (selector: string, ...values: string[]) => Promise<string[]>;
};

export type BrowserSession = {
  browser: BrowserLike;
  page: PageLike;
};
