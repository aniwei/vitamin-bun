export function nextTick(callback: (...args: unknown[]) => void, ...args: unknown[]): void {
	const enqueue = typeof queueMicrotask === 'function'
		? queueMicrotask
		: (cb: () => void) => Promise.resolve().then(cb)

	enqueue(() => callback(...args))
}

export default nextTick

