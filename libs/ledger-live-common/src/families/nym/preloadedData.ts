import { Observable, Subject } from "rxjs"
import type { NymPreloadData, NymValidatorItem } from "./types"

// this module holds the cached state of preload()
// eslint-disable-next-line no-unused-vars
let currentNymPreloadedData: NymPreloadData = {
  // NB initial state because UI need to work even if it's currently "loading", typically after clear cache
  validators: [],
}
export function asSafeNymPreloadData(data?: {
  validators?: NymValidatorItem[]
}): NymPreloadData {
  // NB this function must not break and be resilient to changes in data
  const validators: NymValidatorItem[] = []

  if (typeof data === "object" && data) {
    const validatorsUnsafe = data.validators

    if (
      typeof validatorsUnsafe === "object" &&
      validatorsUnsafe &&
      Array.isArray(validatorsUnsafe)
    ) {
      validatorsUnsafe.forEach((v) => {
        // FIXME if model changes, we should validate the object
        validators.push(v)
      })
    }
  }

  return {
    validators,
  }
}

const updates = new Subject<NymPreloadData>()

export function setNymPreloadData(data: NymPreloadData): void {
  if (data === currentNymPreloadedData) return
  currentNymPreloadedData = data
  updates.next(data)
}

export function getCurrentNymPreloadData(): NymPreloadData {
  return currentNymPreloadedData
}

export function getNymPreloadDataUpdates(): Observable<NymPreloadData> {
  return updates.asObservable()
}
