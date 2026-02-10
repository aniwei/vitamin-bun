import * as semver from 'semver'

export function createBunSemverModule(): Record<string, unknown> {
  return {
    parse(version: string) {
      return semver.parse(version)
    },
    valid(version: string) {
      return semver.valid(version)
    },
    clean(version: string) {
      return semver.clean(version)
    },
    coerce(version: string) {
      return semver.coerce(version)
    },
    major(version: string) {
      return semver.major(version)
    },
    minor(version: string) {
      return semver.minor(version)
    },
    patch(version: string) {
      return semver.patch(version)
    },
    compare(a: string, b: string) {
      return semver.compare(a, b)
    },
    rcompare(a: string, b: string) {
      return semver.rcompare(a, b)
    },
    compareBuild(a: string, b: string) {
      return semver.compareBuild(a, b)
    },
    eq(a: string, b: string) {
      return semver.eq(a, b)
    },
    neq(a: string, b: string) {
      return semver.neq(a, b)
    },
    gt(a: string, b: string) {
      return semver.gt(a, b)
    },
    gte(a: string, b: string) {
      return semver.gte(a, b)
    },
    lt(a: string, b: string) {
      return semver.lt(a, b)
    },
    lte(a: string, b: string) {
      return semver.lte(a, b)
    },
    satisfies(version: string, range: string, options?: semver.RangeOptions) {
      return semver.satisfies(version, range, options)
    },
    validRange(range: string) {
      return semver.validRange(range)
    },
    intersects(rangeA: string, rangeB: string, options?: semver.RangeOptions) {
      return semver.intersects(rangeA, rangeB, options)
    },
    subset(rangeA: string, rangeB: string, options?: semver.RangeOptions) {
      return semver.subset(rangeA, rangeB, options)
    },
    gtr(version: string, range: string, options?: semver.RangeOptions) {
      return semver.gtr(version, range, options)
    },
    ltr(version: string, range: string, options?: semver.RangeOptions) {
      return semver.ltr(version, range, options)
    },
    outside(version: string, range: string, hilo: '>' | '<', options?: semver.RangeOptions) {
      return semver.outside(version, range, hilo, options)
    },
    minVersion(range: string) {
      return semver.minVersion(range)
    },
    maxSatisfying(versions: string[], range: string) {
      return semver.maxSatisfying(versions, range)
    },
    prerelease(version: string) {
      return semver.prerelease(version)
    },
    inc(version: string, release: semver.ReleaseType) {
      return semver.inc(version, release)
    },
    diff(a: string, b: string) {
      return semver.diff(a, b)
    },
    range(range: string) {
      return new semver.Range(range)
    },
    simplifyRange(versions: string[], range: string) {
      return semver.simplifyRange(versions, range)
    },
    sort(versions: string[]) {
      return semver.sort(versions)
    },
    rsort(versions: string[]) {
      return semver.rsort(versions)
    },
  }
}
