import { createInstallManager, type InstallManagerOptions } from './manager'
import type { InstallContext, InstallPlan } from './types'
import type { Lockfile } from './lockfile'

export type InstallFlow = {
  plan: InstallPlan
  run: () => Promise<Lockfile>
}

export function createInstallFlow(
  ctx: InstallContext,
  options: InstallManagerOptions,
): InstallFlow {
  const manager = createInstallManager(ctx, options)
  return {
    plan: manager.plan,
    run: manager.run,
  }
}
