/**
 * Result type for explicit error handling
 * Inspired by Rust's Result type
 */

/**
 * Success result
 */
export interface Ok<T> {
  readonly success: true;
  readonly data: T;
}

/**
 * Error result
 */
export interface Err<E> {
  readonly success: false;
  readonly error: E;
}

/**
 * Result type - represents either success with data or failure with error
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return err('Division by zero');
 *   }
 *   return ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (isOk(result)) {
 *   console.log(result.data); // 5
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Async version of Result
 *
 * @example
 * ```typescript
 * async function fetchData(): AsyncResult<Data, FetchError> {
 *   try {
 *     const data = await api.get();
 *     return ok(data);
 *   } catch (e) {
 *     return err(new FetchError(e.message));
 *   }
 * }
 * ```
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Create a success result
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * // result.success === true
 * // result.data === 42
 * ```
 */
export function ok<T>(data: T): Ok<T> {
  return { success: true, data };
}

/**
 * Create an error result
 *
 * @example
 * ```typescript
 * const result = err(new Error('Something went wrong'));
 * // result.success === false
 * // result.error.message === 'Something went wrong'
 * ```
 */
export function err<E>(error: E): Err<E> {
  return { success: false, error };
}

/**
 * Type guard for success result
 *
 * @example
 * ```typescript
 * const result = divide(10, 2);
 * if (isOk(result)) {
 *   // TypeScript knows result.data is available here
 *   console.log(result.data);
 * }
 * ```
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.success === true;
}

/**
 * Type guard for error result
 *
 * @example
 * ```typescript
 * const result = divide(10, 0);
 * if (isErr(result)) {
 *   // TypeScript knows result.error is available here
 *   console.error(result.error);
 * }
 * ```
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.success === false;
}

/**
 * Extract data from result, throwing if it's an error
 *
 * @throws The error contained in the result if it's an Err
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * const value = unwrap(result); // 42
 *
 * const errResult = err(new Error('fail'));
 * const value = unwrap(errResult); // throws Error('fail')
 * ```
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.data;
  }
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(String(result.error));
}

/**
 * Extract data from result, returning default value if it's an error
 *
 * @example
 * ```typescript
 * const result = err<number, string>('not found');
 * const value = unwrapOr(result, 0); // 0
 *
 * const okResult = ok(42);
 * const value = unwrapOr(okResult, 0); // 42
 * ```
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Extract error from result, throwing if it's a success
 *
 * @throws Error if the result is Ok
 *
 * @example
 * ```typescript
 * const result = err(new ValidationError('invalid'));
 * const error = unwrapErr(result); // ValidationError
 * ```
 */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (isErr(result)) {
    return result.error;
  }
  throw new Error('Called unwrapErr on an Ok value');
}

/**
 * Map a function over the success value
 *
 * @example
 * ```typescript
 * const result = ok(5);
 * const doubled = map(result, x => x * 2); // ok(10)
 *
 * const errResult = err<number, string>('error');
 * const doubled = map(errResult, x => x * 2); // err('error')
 * ```
 */
export function map<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.data));
  }
  return result;
}

/**
 * Map a function over the error value
 *
 * @example
 * ```typescript
 * const result = err('not found');
 * const mapped = mapErr(result, e => new Error(e)); // err(Error('not found'))
 * ```
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chain results (flatMap)
 *
 * @example
 * ```typescript
 * const parse = (s: string): Result<number, string> => {
 *   const n = parseInt(s);
 *   return isNaN(n) ? err('not a number') : ok(n);
 * };
 *
 * const double = (n: number): Result<number, string> =>
 *   n > 100 ? err('too large') : ok(n * 2);
 *
 * const result = andThen(parse('50'), double); // ok(100)
 * const result2 = andThen(parse('abc'), double); // err('not a number')
 * ```
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.data);
  }
  return result;
}

/**
 * Convert a promise that might throw to an AsyncResult
 *
 * @example
 * ```typescript
 * const result = await fromPromise(fetch('/api/data'));
 * if (isOk(result)) {
 *   console.log(result.data);
 * }
 * ```
 */
export function fromPromise<T>(promise: Promise<T>): AsyncResult<T, Error> {
  return promise
    .then((data) => ok(data) as Result<T, Error>)
    .catch((error) => err(error instanceof Error ? error : new Error(String(error))));
}

/**
 * Convert a function that might throw to one that returns Result
 *
 * @example
 * ```typescript
 * const safeJsonParse = tryCatch((s: string) => JSON.parse(s));
 * const result = safeJsonParse('{"a":1}'); // ok({a: 1})
 * const result2 = safeJsonParse('invalid'); // err(SyntaxError)
 * ```
 */
export function tryCatch<T, A extends unknown[]>(
  fn: (...args: A) => T
): (...args: A) => Result<T, Error> {
  return (...args: A): Result<T, Error> => {
    try {
      return ok(fn(...args));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/**
 * Collect an array of results into a result of array
 * Returns the first error if any result is an error
 *
 * @example
 * ```typescript
 * const results = [ok(1), ok(2), ok(3)];
 * const collected = collect(results); // ok([1, 2, 3])
 *
 * const results2 = [ok(1), err('fail'), ok(3)];
 * const collected2 = collect(results2); // err('fail')
 * ```
 */
export function collect<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.data);
  }
  return ok(values);
}
