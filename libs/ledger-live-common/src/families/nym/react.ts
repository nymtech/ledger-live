import invariant from "invariant"
import { useEffect, useMemo, useState } from "react"
import {
  getCurrentNymPreloadData,
  getNymPreloadDataUpdates,
} from "./preloadedData"
import type {
  NymMappedDelegation,
  NymValidatorItem,
  NymMappedValidator,
  NymDelegationInfo,
  NymOperationMode,
  NymSearchFilter,
  Transaction,
  NymExtraTxInfo,
  NymPreloadData,
  NymAccount,
} from "./types"
import {
  mapDelegations,
  mapDelegationInfo,
  searchFilter as defaultSearchFilter,
} from "./logic"
import { getAccountUnit } from "../../account"
import useMemoOnce from "../../hooks/useMemoOnce"
import { LEDGER_VALIDATOR_ADDRESS } from "./utils"

// Add Nym-families imports below:
import {
  getCurrentOsmosisPreloadData,
  getOsmosisPreloadDataUpdates,
} from "../osmosis/preloadedData"
import { LEDGER_OSMOSIS_VALIDATOR_ADDRESS } from "../osmosis/utils"

export function useNymFamilyPreloadData(currencyName: string): NymPreloadData {
  let getCurrent
  let getUpdates

  if (currencyName == "nym") {
    getCurrent = getCurrentNymPreloadData
    getUpdates = getNymPreloadDataUpdates
  }
  if (currencyName == "osmosis") {
    getCurrent = getCurrentOsmosisPreloadData
    getUpdates = getOsmosisPreloadDataUpdates
  }

  const [state, setState] = useState(getCurrent)
  useEffect(() => {
    const sub = getUpdates().subscribe(setState)
    return () => sub.unsubscribe()
  }, [getCurrent, getUpdates])
  return state
}

// export function useNymPreloadData(): NymPreloadData {
//   const [state, setState] = useState(getCurrentNymPreloadData);
//   useEffect(() => {
//     const sub = getNymPreloadDataUpdates().subscribe(setState);
//     return () => sub.unsubscribe();
//   }, []);
//   return state;
// }

export function useNymFamilyMappedDelegations(
  account: NymAccount,
  mode?: NymOperationMode
): NymMappedDelegation[] {
  const currencyName = account.currency.name.toLowerCase()
  const { validators } = useNymFamilyPreloadData(currencyName)

  const delegations = account.nymResources?.delegations
  invariant(delegations, "nym: delegations is required")
  const unit = getAccountUnit(account)
  return useMemo(() => {
    const mappedDelegations = mapDelegations(
      delegations || [],
      validators,
      unit
    )
    return mode === "claimReward"
      ? mappedDelegations.filter(({ pendingRewards }) => pendingRewards.gt(0))
      : mappedDelegations
  }, [delegations, validators, mode, unit])
}

export function useNymFamilyDelegationsQuerySelector(
  account: NymAccount,
  transaction: Transaction,
  delegationSearchFilter: NymSearchFilter = defaultSearchFilter
): {
  query: string
  setQuery: (query: string) => void
  options: NymMappedDelegation[]
  value: NymMappedDelegation | null | undefined
} {
  const [query, setQuery] = useState<string>("")
  const delegations = useNymFamilyMappedDelegations(account, transaction.mode)
  const options = useMemo<NymMappedDelegation[]>(
    () => delegations.filter(delegationSearchFilter(query)),
    [query, delegations, delegationSearchFilter]
  )
  const selectedValidator = transaction.validators && transaction.validators[0]
  const value = useMemo(() => {
    switch (transaction.mode) {
      case "redelegate":
        invariant(
          transaction.sourceValidator,
          "nym: sourceValidator is required"
        )
        return options.find(
          ({ validatorAddress }) =>
            validatorAddress === transaction.sourceValidator
        )

      default:
        return (
          selectedValidator &&
          delegations.find(
            ({ validatorAddress }) =>
              validatorAddress === selectedValidator.address
          )
        )
    }
  }, [delegations, selectedValidator, transaction, options])
  return {
    query,
    setQuery,
    options,
    value,
  }
}

/** Hook to search and sort SR list according to initial votes and query */
export function useSortedValidators(
  search: string,
  validators: NymValidatorItem[],
  delegations: NymDelegationInfo[],
  validatorSearchFilter: NymSearchFilter = defaultSearchFilter
): NymMappedValidator[] {
  const initialVotes = useMemoOnce(() =>
    delegations.map(({ address }) => address)
  )
  const mappedValidators = useMemo(
    () =>
      validators.map((validator, rank) => ({
        rank: rank + 1,
        validator,
      })),
    [validators]
  )
  const sortedVotes = useMemo(
    () =>
      mappedValidators
        .filter(({ validator }) =>
          initialVotes.includes(validator.validatorAddress)
        )
        .concat(
          mappedValidators.filter(
            ({ validator }) =>
              !initialVotes.includes(validator.validatorAddress)
          )
        ),
    [mappedValidators, initialVotes]
  )
  const sr = useMemo(
    () =>
      search
        ? mappedValidators.filter(validatorSearchFilter(search))
        : sortedVotes,
    [search, mappedValidators, sortedVotes, validatorSearchFilter]
  )
  return sr
}

// Nothing using this function?
export function useMappedExtraOperationDetails({
  account,
  extra,
}: {
  account: NymAccount
  extra: NymExtraTxInfo
}): NymExtraTxInfo {
  const { validators } = useNymFamilyPreloadData("nym")
  const unit = getAccountUnit(account)
  return {
    validators: extra.validators
      ? mapDelegationInfo(extra.validators, validators, unit)
      : undefined,
    validator: extra.validator
      ? mapDelegationInfo([extra.validator], validators, unit)[0]
      : undefined,
    sourceValidator: extra.sourceValidator ? extra.sourceValidator : undefined,
    autoClaimedRewards:
      extra.autoClaimedRewards != null
        ? extra.autoClaimedRewards
        : "empty string",
  }
}

export function useLedgerFirstShuffledValidatorsNymFamily(
  currencyName: string,
  searchInput?: string
): NymValidatorItem[] {
  let data
  let ledgerValidatorAddress
  if (currencyName == "osmosis") {
    data = getCurrentOsmosisPreloadData()
    ledgerValidatorAddress = LEDGER_OSMOSIS_VALIDATOR_ADDRESS
  } else {
    data = getCurrentNymPreloadData()
    ledgerValidatorAddress = LEDGER_VALIDATOR_ADDRESS
  }

  return useMemo(() => {
    return reorderValidators(
      data?.validators ?? [],
      ledgerValidatorAddress,
      searchInput
    )
  }, [data, ledgerValidatorAddress, searchInput])
}

function reorderValidators(
  validators: NymValidatorItem[],
  ledgerValidatorAddress: string,
  searchInput?: string
): NymValidatorItem[] {
  const sortedValidators = validators
    .filter((validator) => validator.commission !== 1.0)
    .filter((validator) =>
      searchInput
        ? validator.name.toLowerCase().includes(searchInput.toLowerCase())
        : true
    )
    .sort((a, b) => b.votingPower - a.votingPower)

  // move Ledger validator to the first position
  const ledgerValidator = sortedValidators.find(
    (v) => v.validatorAddress === ledgerValidatorAddress
  )

  if (ledgerValidator) {
    const sortedValidatorsLedgerFirst = sortedValidators.filter(
      (v) => v.validatorAddress !== ledgerValidatorAddress
    )
    sortedValidatorsLedgerFirst.unshift(ledgerValidator)

    return sortedValidatorsLedgerFirst
  }

  return sortedValidators
}
