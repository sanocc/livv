/** M01 keeps the Worker environment intentionally free of business bindings. */
export interface Env {}

export interface AppContext {
  readonly env: Env;
  readonly request: Request;
}
